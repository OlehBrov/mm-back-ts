import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';

async function runMigrations() {
  const logger = new Logger('Migrations');
  const prisma = new PrismaClient();
  await prisma.$connect();

  const migrationsDir = path.join(__dirname, '../prisma/migrations');
  if (!fs.existsSync(migrationsDir)) {
    logger.warn('Migrations directory not found, skipping');
    await prisma.$disconnect();
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    await prisma.$executeRawUnsafe(sql);
    logger.log(`Applied: ${file}`);
  }

  await prisma.$disconnect();
}

async function bootstrap() {
  await runMigrations();

  const app = await NestFactory.create(AppModule);
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
