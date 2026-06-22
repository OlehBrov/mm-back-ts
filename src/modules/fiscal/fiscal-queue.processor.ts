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
   * Discovers all distinct (bank, merchant_id, with_vat) streams that have pending/processing
   * jobs and processes each one independently in parallel.
   *
   * This means: a failure or backoff in one merchant's queue never blocks another merchant's
   * receipts — even if the bank or terminal has changed since the old jobs were enqueued.
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async handleQueue() {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const activeQueues = await this.fiscalService.getActiveQueues();
      if (!activeQueues.length) return;

      await Promise.allSettled(
        activeQueues.map(q =>
          this.fiscalService.processQueue(q.bank, q.merchant_id, q.with_vat),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Unexpected queue processor error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
