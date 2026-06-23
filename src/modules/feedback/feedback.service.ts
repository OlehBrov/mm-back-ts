import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { feedbackReportTemplate } from './templates/feedback-report.template';

@Injectable()
export class FeedbackService implements OnModuleInit {
  private readonly logger = new Logger(FeedbackService.name);
  private readonly storeAuthId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {
    this.storeAuthId = config.get<string>('store.authId') ?? '';
  }

  async onModuleInit() {
    // On server startup: send report if it wasn't sent today yet
    await this.checkAndSendReport();
  }

  async submitFeedback(rating: number): Promise<void> {
    await this.prisma.feedbacks.create({ data: { rating } });
  }

  // Runs daily at 01:00
  @Cron('0 1 * * *')
  async scheduledReport() {
    await this.checkAndSendReport();
  }

  async checkAndSendReport(): Promise<void> {
    const store = await this.prisma.store.findFirst({
      where: { auth_id: this.storeAuthId },
      select: {
        store_name: true,
        feedback_email: true,
        last_feedback_report_date: true,
      },
    });

    if (!store?.feedback_email) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastSent = store.last_feedback_report_date
      ? new Date(store.last_feedback_report_date)
      : null;

    if (lastSent && lastSent >= today) return; // already sent today

    await this.sendReport(store.store_name ?? 'МікроМаркет', store.feedback_email);

    await this.prisma.store.updateMany({
      data: { last_feedback_report_date: today },
    });
  }

  private async sendReport(storeName: string, feedbackEmail: string): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const dayEnd = new Date(yesterday);
    dayEnd.setHours(23, 59, 59, 999);

    const feedbacks = await this.prisma.feedbacks.findMany({
      where: { created_at: { gte: yesterday, lte: dayEnd } },
      select: { rating: true },
    });

    const reportDate = yesterday.toLocaleDateString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });

    if (feedbacks.length === 0) {
      this.logger.log(`No feedbacks for ${reportDate}, skipping report`);
      return;
    }

    const total = feedbacks.length;
    const sum = feedbacks.reduce((acc, f) => acc + f.rating, 0);
    const average = (sum / total).toFixed(1);

    const distribution = [5, 4, 3, 2, 1].map((r) => {
      const count = feedbacks.filter((f) => f.rating === r).length;
      const pct = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
      return { rating: r, count, pct };
    });

    const { subject, html } = feedbackReportTemplate({
      storeName,
      reportDate,
      total,
      average,
      distribution,
    });

    await this.mailer.sendTo(feedbackEmail, subject, html);
    this.logger.log(`Feedback report for ${reportDate} sent to ${feedbackEmail} (${total} ratings, avg ${average})`);
  }
}
