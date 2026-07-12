import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import { PrismaService } from '../../database/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import type { FiscalQueue } from '@prisma/client';

@Injectable()
export class OverdueFiscalService implements OnModuleInit {
  private readonly logger = new Logger(OverdueFiscalService.name);
  private readonly overdueEmail: string;
  private isArchiving = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {
    this.overdueEmail = config.get<string>('mailer.overdueEmail') ?? '';
  }

  async onModuleInit(): Promise<void> {
    // Run in background so it doesn't delay module startup
    void this.archiveIfNeeded();
  }

  // Runs at midnight Kyiv time every day
  @Cron('0 0 0 * * *', { timeZone: 'Europe/Kyiv' })
  async handleMidnightArchive(): Promise<void> {
    await this.archiveIfNeeded();
  }

  private async archiveIfNeeded(): Promise<void> {
    if (this.isArchiving) return;
    try {
      const todayStart = getKyivMidnightUtc();
      const hasOverdue = await this.prisma.fiscalQueue.findFirst({
        where: {
          created_at: { lt: todayStart },
          status: { in: ['pending', 'processing', 'failed'] },
        },
        select: { id: true },
      });
      if (hasOverdue) {
        await this.archiveOverdueJobs(todayStart);
      }
    } catch (err) {
      this.logger.error(
        `Overdue archival check failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async archiveOverdueJobs(todayStart: Date): Promise<void> {
    if (this.isArchiving) return;
    this.isArchiving = true;
    try {
      const jobs = await this.prisma.fiscalQueue.findMany({
        where: {
          created_at: { lt: todayStart },
          status: { in: ['pending', 'processing', 'failed'] },
        },
        orderBy: { created_at: 'asc' },
      });

      if (jobs.length === 0) return;

      this.logger.log(
        `Archiving ${jobs.length} overdue fiscal job(s) created before ${todayStart.toISOString()}`,
      );

      const archivedAt = new Date();

      await this.prisma.$transaction([
        this.prisma.overdueFiscalQueue.createMany({
          data: jobs.map(job => ({
            original_id: job.id,
            payload: job.payload,
            with_vat: job.with_vat,
            bank: job.bank,
            merchant_id: job.merchant_id,
            status: job.status,
            attempts: job.attempts,
            last_error: job.last_error,
            remove_product_ids: job.remove_product_ids,
            created_at: job.created_at,
            archived_at: archivedAt,
          })),
        }),
        this.prisma.fiscalQueue.deleteMany({
          where: { id: { in: jobs.map(j => j.id) } },
        }),
      ]);

      this.logger.log(`${jobs.length} overdue job(s) moved to OverdueFiscalQueue`);

      if (this.overdueEmail) {
        await this.sendReport(jobs);
      }
    } finally {
      this.isArchiving = false;
    }
  }

  private async sendReport(jobs: FiscalQueue[]): Promise<void> {
    try {
      const xlsxBuffer = await buildXlsx(jobs);
      const reportDate = jobs[0].created_at.toLocaleDateString('uk-UA', {
        timeZone: 'Europe/Kyiv',
      });
      await this.mailer.sendOverdueFiscalsReport(
        { count: jobs.length, reportDate },
        xlsxBuffer,
        this.overdueEmail,
      );
    } catch (err) {
      this.logger.error(
        `Failed to send overdue fiscals report: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the UTC equivalent of today's midnight in the Kyiv timezone.
 * Handles DST correctly by verifying the resulting UTC timestamp falls on
 * the same Kyiv calendar date (UTC+2 winter, UTC+3 summer).
 */
function getKyivMidnightUtc(): Date {
  const now = new Date();
  const kyivDateStr = now.toLocaleDateString('sv', { timeZone: 'Europe/Kyiv' }); // "YYYY-MM-DD"
  for (const tz of ['+03:00', '+02:00']) {
    const candidate = new Date(`${kyivDateStr}T00:00:00${tz}`);
    if (candidate.toLocaleDateString('sv', { timeZone: 'Europe/Kyiv' }) === kyivDateStr) {
      return candidate;
    }
  }
  return new Date(`${kyivDateStr}T00:00:00+02:00`);
}

async function buildXlsx(jobs: FiscalQueue[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Протерміновані чеки');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Дата створення', key: 'created_at', width: 22 },
    { header: 'Банк', key: 'bank', width: 14 },
    { header: 'Мерчант ID', key: 'merchant_id', width: 22 },
    { header: 'З ПДВ', key: 'with_vat', width: 8 },
    { header: 'Статус', key: 'status', width: 14 },
    { header: 'Спроб', key: 'attempts', width: 8 },
    { header: 'Остання помилка', key: 'last_error', width: 45 },
    { header: 'ID продуктів', key: 'remove_product_ids', width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBBDEFB' } };

  for (const job of jobs) {
    sheet.addRow({
      id: job.id,
      created_at: job.created_at.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
      bank: job.bank,
      merchant_id: job.merchant_id,
      with_vat: job.with_vat ? 'Так' : 'Ні',
      status: job.status,
      attempts: job.attempts,
      last_error: job.last_error ?? '',
      remove_product_ids: job.remove_product_ids ?? '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
