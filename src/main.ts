import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';
import * as express from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

// MS SQL error codes that mean "object already exists" — safe to treat as already-applied
const ALREADY_EXISTS_CODES = new Set(['2705', '2714', '1779', '1913', '2627']);

async function runMigrations() {
  const logger = new Logger('Migrations');
  const prisma = new PrismaClient();

  const maxAttempts = 10;
  const retryDelayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$connect();
      break;
    } catch (err) {
      logger.warn(`DB not ready (attempt ${attempt}/${maxAttempts}): ${(err as Error).message}`);
      if (attempt === maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, retryDelayMs));
    }
  }

  const migrationsDir = path.join(__dirname, '../prisma/migrations');
  if (!fs.existsSync(migrationsDir)) {
    logger.warn('Migrations directory not found, skipping');
    await prisma.$disconnect();
    return;
  }

  // Ensure migration tracking table exists
  await prisma.$executeRawUnsafe(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='_MigrationHistory' AND xtype='U')
    CREATE TABLE _MigrationHistory (
      id       INT           IDENTITY(1,1) PRIMARY KEY,
      filename NVARCHAR(255) NOT NULL UNIQUE,
      applied_at DATETIME    NOT NULL DEFAULT GETDATE()
    )
  `);

  const applied = await prisma.$queryRaw<{ filename: string }[]>`
    SELECT filename FROM _MigrationHistory
  `;
  const appliedSet = new Set(applied.map((r) => r.filename));

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (appliedSet.has(file)) {
      logger.log(`Skipped (already applied): ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    try {
      await prisma.$executeRawUnsafe(sql);
      logger.log(`Applied: ${file}`);
    } catch (err: unknown) {
      const code = (err as { meta?: { code?: string } }).meta?.code ?? '';
      if (ALREADY_EXISTS_CODES.has(code)) {
        // Schema change was already applied in a previous run before tracking existed
        logger.warn(`Already applied (idempotent skip, code=${code}): ${file}`);
      } else {
        await prisma.$disconnect();
        throw err;
      }
    }

    // Mark as applied regardless of whether the SQL ran or was skipped as duplicate
    await prisma.$executeRawUnsafe(
      `IF NOT EXISTS (SELECT 1 FROM _MigrationHistory WHERE filename = '${file}')
       INSERT INTO _MigrationHistory (filename) VALUES ('${file}')`,
    );
  }

  await prisma.$disconnect();
}

async function seedServiceUsers() {
  const logger = new Logger('Seed');
  const prisma = new PrismaClient();
  await prisma.$connect();
  const count = await prisma.serviceUsers.count();
  if (count === 0) {
    const hash = await bcrypt.hash('123456', 10);
    await prisma.serviceUsers.create({ data: { password: hash } });
    logger.log('ServiceUsers: seeded default service user');
  }
  await prisma.$disconnect();
}

async function bootstrap() {
  await runMigrations();
  await seedServiceUsers();

  // Disable default body parser so we can set a higher limit for image uploads
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '200mb' }));
  app.use(express.urlencoded({ limit: '200mb', extended: true }));

  const config = app.get(ConfigService);
  const port = config.get<number>('port') ?? 6006;
  const logger = new Logger('Bootstrap');

  app.enableCors();
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(port);
  logger.log(`Application running on port ${port}`);
}
bootstrap();
