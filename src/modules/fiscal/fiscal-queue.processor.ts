import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FiscalService } from './fiscal.service';

@Injectable()
export class FiscalQueueProcessor {
  private readonly logger = new Logger(FiscalQueueProcessor.name);
  private isRunning = false;

  constructor(private readonly fiscalService: FiscalService) {}

  /**
   * Runs every 10 seconds.
   * Processes the oldest pending job in EACH stream (noVAT and VAT) independently.
   * A failure in one RRO stream does NOT block the other — vchasno.kasa enforces
   * chronological order per RRO account, not across accounts.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleQueue() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      await Promise.allSettled([
        this.fiscalService.processQueue(false),
        this.fiscalService.processQueue(true),
      ]);
    } catch (error) {
      this.logger.error(
        `Unexpected queue processor error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
