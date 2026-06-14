import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { FiscalDocument, FiscalPayload } from './dto/fiscal-job.dto';

export const RECEIPT_READY_EVENT = 'fiscal.receiptReady';

// Thrown when vchasno returns res_action=3 (manual intervention required — retry is useless)
class FiscalFatalError extends Error {
  readonly fiscalRes: number;
  readonly fiscalErrortxt: string;

  constructor(res: number, errortxt: string) {
    super(`Fiscal FATAL (res_action=3): res=${res}, errortxt=${errortxt}`);
    this.name = 'FiscalFatalError';
    this.fiscalRes = res;
    this.fiscalErrortxt = errortxt;
  }
}

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);
  private readonly http: ReturnType<typeof axios.create>;
  private readonly merchantToken: string;
  private readonly merchantTokenVat: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly events: EventEmitter2,
  ) {
    this.merchantToken = config.get<string>('fiscal.merchantToken') ?? '';
    this.merchantTokenVat = config.get<string>('fiscal.merchantTokenVat') ?? '';

    this.http = axios.create({
      baseURL: config.get<string>('fiscal.host'),
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  /**
   * Enqueues a fiscal receipt for processing.
   * NEVER sends directly — all receipts go through the queue
   * to guarantee chronological order required by vchasno.kasa.
   */
  async enqueue(payload: FiscalPayload, removeProductIds: number[]): Promise<void> {
    // Assign a stable tag UUID now — it must remain the same on every retry so
    // vchasno can detect duplicates and avoid registering the same receipt twice.
    // See vchasno docs: "Для уникнення дублювання чеків, повторні запити слід
    // надсилати з параметром tag рівним початковому запиту/відповіді."
    const stablePayload: FiscalPayload = { ...payload, tag: randomUUID() };

    await this.prisma.fiscalQueue.create({
      data: {
        payload: JSON.stringify(stablePayload),
        with_vat: stablePayload.withVat,
        status: 'pending',
        remove_product_ids: JSON.stringify(removeProductIds),
        next_retry_at: new Date(),
      },
    });
    this.logger.log(`Fiscal receipt enqueued for products: [${removeProductIds.join(', ')}]`);
  }

  /**
   * Processes the single oldest pending job for the given merchant stream.
   * withVat=false → merchantToken (noVAT RRO); withVat=true → merchantTokenVat (VAT RRO).
   *
   * Each stream is independent — a failure in one does NOT block the other, because
   * vchasno.kasa enforces chronological order per RRO account, not across accounts.
   *
   * IMPORTANT: We first find the globally oldest pending job in this stream (ignoring
   * next_retry_at), then check if it is ready. If it is NOT ready (backoff not expired),
   * we block this stream — we must NOT skip to a newer job in the same stream, because
   * vchasno.kasa requires strict chronological order within each RRO account.
   */
  async processQueue(withVat: boolean): Promise<void> {
    // Safety: skip if any job in this stream is currently being processed
    const processing = await this.prisma.fiscalQueue.findFirst({
      where: { status: 'processing', with_vat: withVat },
    });
    if (processing) {
      this.logger.debug(`Job #${processing.id} still processing — skipping cycle (withVat=${withVat})`);
      return;
    }

    // Find the oldest pending job in this stream (no next_retry_at filter here!)
    const oldestJob = await this.prisma.fiscalQueue.findFirst({
      where: { status: 'pending', with_vat: withVat },
      orderBy: { created_at: 'asc' },
    });

    if (!oldestJob) return;

    // If the oldest job is still in backoff — block the entire queue.
    // Do NOT skip to a newer job; that would violate chronological order.
    if (oldestJob.next_retry_at > new Date()) {
      this.logger.debug(
        `Fiscal queue (withVat=${withVat}) BLOCKED — oldest job #${oldestJob.id} not ready until ` +
          `${oldestJob.next_retry_at.toISOString()} (attempt ${oldestJob.attempts}/${oldestJob.max_attempts})`,
      );
      return;
    }

    const job = oldestJob;

    // Lock the job
    await this.prisma.fiscalQueue.update({
      where: { id: job.id },
      data: { status: 'processing' },
    });

    let payload: FiscalPayload;
    try {
      payload = JSON.parse(job.payload) as FiscalPayload;
    } catch {
      await this.prisma.fiscalQueue.update({
        where: { id: job.id },
        data: { status: 'failed', last_error: 'Invalid payload JSON' },
      });
      return;
    }

    try {
      const { mapped: fiscalDoc, raw: rawFiscalDoc } = await this.executeRequest(payload);

      await this.prisma.fiscalQueue.update({
        where: { id: job.id },
        data: {
          status: 'completed',
          fiscal_response: JSON.stringify(fiscalDoc),
          processed_at: new Date(),
        },
      });

      const removeIds: number[] = job.remove_product_ids
        ? (JSON.parse(job.remove_product_ids) as number[])
        : [];
      if (removeIds.length > 0) {
        await this.saveFiscalDataToRemoveProducts(removeIds, fiscalDoc);
      }

      this.events.emit(RECEIPT_READY_EVENT, { withVat: job.with_vat, raw: rawFiscalDoc });
      this.logger.log(`Fiscal job #${job.id} completed successfully`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = job.attempts + 1;

      // res_action=3 from vchasno means "manual intervention required — do not retry"
      const isFatal = error instanceof FiscalFatalError;
      const isFailed = isFatal || attempts >= job.max_attempts;

      // Exponential backoff: 10s, 20s, 40s ... max 30min (irrelevant for fatal errors)
      const backoffMs = Math.min(10_000 * Math.pow(2, attempts - 1), 30 * 60_000);
      const nextRetryAt = new Date(Date.now() + backoffMs);

      await this.prisma.fiscalQueue.update({
        where: { id: job.id },
        data: {
          status: isFailed ? 'failed' : 'pending',
          attempts,
          last_error: message,
          next_retry_at: nextRetryAt,
        },
      });

      if (isFatal) {
        this.logger.error(
          `Fiscal job #${job.id} FATAL (vchasno res_action=3). ` +
            `No retry — manual fix required in vchasno cabinet. Error: ${message}`,
        );
        void this.mailer.sendFiscalFatalAlert({
          jobId: job.id,
          res: (error as FiscalFatalError).fiscalRes,
          errortxt: (error as FiscalFatalError).fiscalErrortxt,
          tag: payload.tag,
          attempts,
          enqueuedAt: job.created_at.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
        });
      } else if (isFailed) {
        this.logger.error(
          `Fiscal job #${job.id} permanently failed after ${attempts} attempts. Manual intervention required.`,
        );
        void this.mailer.sendFiscalFailedAlert({
          jobId: job.id,
          maxAttempts: job.max_attempts,
          lastError: message,
          tag: payload.tag,
          enqueuedAt: job.created_at.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' }),
        });
      } else {
        this.logger.warn(
          `Fiscal job #${job.id} failed (attempt ${attempts}/${job.max_attempts}). ` +
            `Queue BLOCKED until retry at ${nextRetryAt.toISOString()}. ` +
            `Error: ${message}`,
        );
      }
    }
  }

  private async saveFiscalDataToRemoveProducts(
    ids: number[],
    fiscalDoc: FiscalDocument,
  ): Promise<void> {
    for (const id of ids) {
      const removeRecord = await this.prisma.removeProducts.findUnique({
        where: { id },
        include: { Products: { select: { barcode: true } } },
      });

      if (!removeRecord?.Products?.barcode) {
        this.logger.warn(`No barcode for RemoveProducts #${id} — skipping fiscal update`);
        continue;
      }

      const barcode = removeRecord.Products.barcode;

      const fiscalItem = fiscalDoc.data.items.find(
        (item) => String(item.code1) === barcode,
      );
      if (!fiscalItem) {
        this.logger.warn(`No fiscal item for barcode ${barcode} — skipping`);
        continue;
      }

      const tax = fiscalDoc.data.taxes.find((t) => t.tg_print === fiscalItem.tg_print);
      if (!tax) {
        this.logger.warn(`No tax for tg_print=${fiscalItem.tg_print} — skipping`);
        continue;
      }

      await this.prisma.removeProducts.update({
        where: { id },
        data: {
          fisc_fiscal_number: fiscalDoc.fiscal_number,
          fisc_company_name: fiscalDoc.company_name,
          fisc_company_edrpou: fiscalDoc.company_edrpou,
          fisc_rro_fiscal_number: fiscalDoc.rro_fiscal_number,
          fisc_iso_date_created: fiscalDoc.date_created ? new Date(fiscalDoc.date_created) : null,
          fisc_check_url: fiscalDoc.check_url,
          fics_target_url: fiscalDoc.target_url,
          fisc_check_tax_name: tax.tg_name,
          fisc_check_tax_print: tax.tg_print,
          fisc_check_tax_percent: parseFloat(tax.tax_percent),
          fisch_check_tax_sum: parseFloat(tax.tax_sum),
          fisc_tax_additional_tax_caption: tax.dt_caption,
          fisc_additional_tax_percent: parseFloat(tax.dt_percent),
          fisc_additional_tax_sum: parseFloat(tax.dt_sum),
        },
      });
    }
  }

  async executeRequest(payload: FiscalPayload): Promise<{ mapped: FiscalDocument; raw: Record<string, unknown> }> {
    const token = payload.withVat ? this.merchantTokenVat : this.merchantToken;

    // Strip internal withVat flag before sending to vchasno.kasa
    const { withVat: _withVat, ...apiPayload } = payload;

    const response = await this.http.post<Record<string, unknown>>(
      '/api/v3/fiscal/execute',
      apiPayload,
      { headers: { Authorization: token } },
    );

    const data = response.data;
    const res = data['res'] as number;
    const resAction = data['res_action'] as number;
    const errortxt = (data['errortxt'] as string) ?? '';

    if (res !== 0) {
      if (resAction === 3) {
        throw new FiscalFatalError(res, errortxt);
      }
      throw new Error(`Fiscal API error: res=${res}, res_action=${resAction}, errortxt=${errortxt}`);
    }

    const doccode = (data['info'] as Record<string, unknown>)['doccode'] as string;
    const fiscalDocResponse = await this.http.get<Record<string, unknown>>(
      `/c/${doccode}.json`,
      { headers: { Authorization: token } },
    );

    const raw = fiscalDocResponse.data as Record<string, unknown>;
    return { mapped: this.mapFiscalResult(raw), raw };
  }

  private mapFiscalResult(doc: Record<string, unknown>): FiscalDocument {
    const data = (doc['data'] as Record<string, unknown>) ?? {};
    const rawItems = (data['items'] as Record<string, unknown>[]) ?? [];
    const rawTaxes = (data['taxes'] as Record<string, unknown>[]) ?? [];

    return {
      fiscal_number: doc['fiscal_number'] as string,
      company_name: doc['company_name'] as string,
      company_edrpou: doc['company_edrpou'] as string,
      rro_fiscal_number: doc['rro_fiscal_number'] as string,
      date_created: doc['date_created'] as string,
      check_url: doc['check_url'] as string,
      target_url: doc['target_url'] as string,
      data: {
        items: rawItems.map((item) => ({
          code1: item['code1'] as string | number,
          tg_print: item['tg_print'] as string,
          discount: item['discount']
            ? {
                sum: parseFloat(
                  (item['discount'] as Record<string, unknown>)['sum'] as string,
                ),
              }
            : undefined,
        })),
        taxes: rawTaxes.map((tax) => {
          // Production API returns tg_print (letter code, e.g. "В").
          // Postman test env may only have tax_caption (e.g. "ПДВ_В").
          // Fall back: extract letter from "ПДВ_В" → "В" via last segment after "_".
          const tgPrint =
            (tax['tg_print'] as string) ||
            ((tax['tax_caption'] as string | undefined)?.split('_').pop() ?? '');

          return {
            tg_name: (tax['tg_name'] ?? tax['tax_caption']) as string,
            tg_print: tgPrint,
            tax_percent: String(tax['tax_percent'] ?? '0'),
            tax_sum: String(tax['tax_sum'] ?? '0'),
            dt_percent: String(tax['dt_percent'] ?? '0'),
            dt_sum: String(tax['dt_sum'] ?? '0'),
            dt_caption: (tax['dt_caption'] ?? '') as string,
          };
        }),
      },
    };
  }

  async getPendingCount(): Promise<number> {
    return this.prisma.fiscalQueue.count({
      where: { status: { in: ['pending', 'processing'] } },
    });
  }

  async getFailedJobs() {
    return this.prisma.fiscalQueue.findMany({
      where: { status: 'failed' },
      orderBy: { created_at: 'asc' },
    });
  }
}
