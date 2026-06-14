import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from './prisma.service';

@Injectable()
export class MigrationService implements OnModuleInit {
  private readonly logger = new Logger(MigrationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const migrationsDir = path.join(__dirname, '../../prisma/migrations');

    if (!fs.existsSync(migrationsDir)) {
      this.logger.warn('Migrations directory not found, skipping');
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      try {
        await this.prisma.$executeRawUnsafe(sql);
        this.logger.log(`Migration applied: ${file}`);
      } catch (err) {
        this.logger.error(`Migration failed: ${file} — ${(err as Error).message}`);
        throw err;
      }
    }
  }
}
