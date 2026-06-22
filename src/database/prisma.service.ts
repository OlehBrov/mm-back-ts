import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({ log: [{ emit: 'event', level: 'error' }, { emit: 'event', level: 'warn' }] });

    // Surface Prisma-level errors and warnings to the NestJS logger
    (this as any).$on('error', (e: { message: string; target: string }) => {
      this.logger.error(`Prisma error [${e.target}]: ${e.message}`);
    });
    (this as any).$on('warn', (e: { message: string; target: string }) => {
      this.logger.warn(`Prisma warn [${e.target}]: ${e.message}`);
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (err) {
      // Startup retry is handled by runMigrations() in main.ts before this point.
      // If we still can't connect here, log clearly and let NestJS crash with a readable message.
      this.logger.error(`Failed to connect to database: ${(err as Error).message}`);
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
