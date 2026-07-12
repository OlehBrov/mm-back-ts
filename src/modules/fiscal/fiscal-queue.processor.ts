import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FiscalService } from './fiscal.service';
import { MailerService } from '../mailer/mailer.service';

const OVERFLOW_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour between repeat alerts

@Injectable()
export class FiscalQueueProcessor {
  private readonly logger = new Logger(FiscalQueueProcessor.name);
  private readonly queueAlertThreshold: number;
  private isRunning = false;
  private lastOverflowAlertAt: Date | null = null;

  constructor(
    private readonly fiscalService: FiscalService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {
    this.queueAlertThreshold = config.get<number>('fiscal.queueAlertThreshold') ?? 0;
  }

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

      await this.checkQueueOverflow();
    } catch (error) {
      this.logger.error(
        `Unexpected queue processor error: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  private async checkQueueOverflow(): Promise<void> {
    if (!this.queueAlertThreshold) return;

    const pendingCount = await this.fiscalService.getPendingCount();
    if (pendingCount <= this.queueAlertThreshold) return;

    const now = new Date();
    if (
      this.lastOverflowAlertAt &&
      now.getTime() - this.lastOverflowAlertAt.getTime() < OVERFLOW_ALERT_COOLDOWN_MS
    ) {
      return;
    }

    this.lastOverflowAlertAt = now;
    this.logger.warn(
      `Fiscal queue overflow: ${pendingCount} pending/processing jobs exceed threshold ${this.queueAlertThreshold}`,
    );
    void this.mailer.sendFiscalQueueOverflowAlert({
      pendingCount,
      threshold: this.queueAlertThreshold,
      checkedAt: now.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
    });
  }
}
