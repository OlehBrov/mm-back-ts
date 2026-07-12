import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { FiscalDocument, FiscalPayload } from './dto/fiscal-job.dto';

export interface VchasnoTokenStatus {
  valid: boolean;
  res: number;
  errortxt: string;
  edrpou?: string;
  merchantName?: string;
  fisid?: string;
  isFis?: number;
  shift_status?: number;
  online_status?: number;
}

export const RECEIPT_READY_EVENT = 'fiscal.receiptReady';
export const MERCHANT_CODE_MISMATCH_EVENT = 'fiscal.merchantCodeMismatch';
export const MAINTENANCE_CLEARED_EVENT = 'fiscal.maintenanceCleared';

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
export class FiscalService implements OnModuleInit {
  private readonly logger = new Logger(FiscalService.name);
  private readonly http: ReturnType<typeof axios.create>;
  private maintenanceActive = false;

  isMaintenanceActive(): boolean {
    return this.maintenanceActive;
  }

  resetMaintenanceState(): void {
    this.maintenanceActive = false;
  }

  clearMaintenanceMode(): void {
    this.maintenanceActive = false;
    this.events.emit(MAINTENANCE_CLEARED_EVENT);
    this.logger.log('Maintenance mode cleared — kiosk is now active');
  }

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    private readonly events: EventEmitter2,
  ) {
    this.http = axios.create({
      baseURL: config.get<string>('fiscal.host'),
      timeout: 60000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  async onModuleInit(): Promise<void> {
    // Verify all configured fiscal tokens in the background — don't block startup
    void this.verifyAndLogAllTokens();
  }

  private async verifyAndLogAllTokens(): Promise<void> {
    try {
      const configs = await this.prisma.fiscalConfig.findMany();
      if (configs.length === 0) {
        this.logger.warn('No fiscal configs found in DB — skipping token verification');
        return;
      }
      for (const cfg of configs) {
        await this.verifyAndSyncMerchantCode(cfg);
      }
    } catch (err) {
      this.logger.warn(`Token verification failed on startup: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Fetches fresh token data from Vchasno and persists edrpou + merchant name to DB.
   * Does NOT check for mismatches or touch maintenance state — use verifyAndSyncMerchantCode for that.
   */
  async fetchAndSyncVchasnoData(cfg: {
    merchant_id: string;
    fiscal_token: string | null;
  }): Promise<{ merchantName: string | null; edrpou: string | null; tokenValid: boolean }> {
    const status = await this.verifyToken(cfg.fiscal_token ?? '');

    const patch: Record<string, string> = {};
    if (status.edrpou !== undefined) patch['vchason_merchant_code'] = status.edrpou;
    if (status.merchantName !== undefined) patch['vchason_merchant_name'] = status.merchantName;

    if (Object.keys(patch).length > 0) {
      await this.prisma.fiscalConfig.update({
        where: { merchant_id: cfg.merchant_id },
        data: patch,
      });
    }

    return {
      merchantName: status.merchantName ?? null,
      edrpou: status.edrpou ?? null,
      tokenValid: status.valid,
    };
  }

  /**
   * Verifies a fiscal token, saves the returned edrpou + merchant name to vchason_* columns,
   * and emits MERCHANT_CODE_MISMATCH_EVENT + sends email if configured values don't match Vchasno.
   * Can be called on startup for all configs, or on-demand after config update.
   */
  async verifyAndSyncMerchantCode(cfg: {
    merchant_id: string;
    merchant_name: string | null;
    merchant_code: string | null;
    fiscal_token: string | null;
  }): Promise<VchasnoTokenStatus> {
    const status = await this.verifyToken(cfg.fiscal_token ?? '');

    this.logger.log(
      `Fiscal token [merchant=${cfg.merchant_id} "${cfg.merchant_name ?? ''}"] ` +
      `valid=${status.valid}, edrpou=${status.edrpou ?? '?'}, name="${status.merchantName ?? '?'}", ` +
      `fisid=${status.fisid ?? '?'}, shift=${status.shift_status ?? '?'}, online=${status.online_status ?? '?'}` +
      (status.valid ? '' : ` | error: ${status.errortxt}`),
    );

    // Persist fresh Vchasno data — these columns are ONLY written here, never via admin API
    const patch: Record<string, string> = {};
    if (status.edrpou !== undefined) patch['vchason_merchant_code'] = status.edrpou;
    if (status.merchantName !== undefined) patch['vchason_merchant_name'] = status.merchantName;
    if (Object.keys(patch).length > 0) {
      await this.prisma.fiscalConfig.update({
        where: { merchant_id: cfg.merchant_id },
        data: patch,
      });
    }

    if (status.edrpou) {

      const configuredCode = cfg.merchant_code?.trim() ?? '';
      const vchasnoCode = status.edrpou.trim();

      if (configuredCode && configuredCode !== vchasnoCode) {
        const overdueEmail = this.config.get<string>('mailer.overdueEmail') ?? '';
        const checkedAt = new Date().toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

        this.maintenanceActive = true;
        this.logger.error(
          `MERCHANT CODE MISMATCH for ${cfg.merchant_id}: ` +
          `configured="${configuredCode}", vchasno="${vchasnoCode}" — activating maintenance mode`,
        );

        this.events.emit(MERCHANT_CODE_MISMATCH_EVENT, {
          merchantId: cfg.merchant_id,
          configuredCode,
          vchasnoCode,
        });

        if (overdueEmail) {
          void this.mailer.sendMerchantCodeMismatchAlert(
            {
              merchantId: cfg.merchant_id,
              merchantName: cfg.merchant_name ?? cfg.merchant_id,
              configuredCode,
              vchasnoCode,
              checkedAt,
            },
            overdueEmail,
          );
        }
      }
    }

    // Check merchant name — compare configured name with what Vchasno returns
    if (cfg.merchant_name && status.merchantName) {
      const configuredName = cfg.merchant_name.trim().toLowerCase();
      const vchasnoName = status.merchantName.trim().toLowerCase();

      if (configuredName !== vchasnoName) {
        this.maintenanceActive = true;
        this.logger.error(
          `MERCHANT NAME MISMATCH for ${cfg.merchant_id}: ` +
          `configured="${cfg.merchant_name}", vchasno="${status.merchantName}" — activating maintenance mode`,
        );

        this.events.emit(MERCHANT_CODE_MISMATCH_EVENT, {
          merchantId: cfg.merchant_id,
          configuredCode: cfg.merchant_name,
          vchasnoCode: status.merchantName,
        });
      }
    }

    return status;
  }

  // ─── Token lookup ────────────────────────────────────────────────────────

  async getTokenForMerchant(merchantId: string): Promise<string> {
    const cfg = await this.prisma.fiscalConfig.findUnique({
      where: { merchant_id: merchantId },
      select: { fiscal_token: true },
    });
    return cfg?.fiscal_token ?? '';
  }

  async verifyToken(token: string): Promise<VchasnoTokenStatus> {
    if (!token) {
      return { valid: false, res: -1, errortxt: 'Token is empty' };
    }
    try {
      const resp = await this.http.post<Record<string, unknown>>(
        '/api/v3/fiscal/execute',
        { fiscal: { task: 18 } },
        { headers: { Authorization: token }, timeout: 15000 },
      );
      const data = resp.data;
      const res = (data['res'] as number) ?? -1;
      const info = (data['info'] as Record<string, unknown>) ?? {};
      return {
        valid: res === 0,
        res,
        errortxt: (data['errortxt'] as string) ?? '',
        edrpou: info['edrpou'] as string | undefined,
        merchantName: info['name'] as string | undefined,
        fisid: info['fisid'] as string | undefined,
        isFis: info['isFis'] as number | undefined,
        shift_status: info['shift_status'] as number | undefined,
        online_status: info['online_status'] as number | undefined,
      };
    } catch (err) {
      return { valid: false, res: -1, errortxt: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Enqueues a fiscal receipt for processing.
   * NEVER sends directly — all receipts go through the queue
   * to guarantee chronological order required by vchasno.kasa.
   */
  async enqueue(
    payload: FiscalPayload,
    removeProductIds: number[],
    bank: string,
    merchantId: string,
  ): Promise<void> {
    // Assign a stable tag UUID now — it must remain the same on every retry so
    // vchasno can detect duplicates and avoid registering the same receipt twice.
    // See vchasno docs: "Для уникнення дублювання чеків, повторні запити слід
    // надсилати з параметром tag рівним початковому запиту/відповіді."
    const stablePayload: FiscalPayload = { ...payload, tag: randomUUID() };

    await this.prisma.fiscalQueue.create({
      data: {
        payload: JSON.stringify(stablePayload),
        with_vat: stablePayload.withVat,
        bank,
        merchant_id: merchantId,
        status: 'pending',
        remove_product_ids: JSON.stringify(removeProductIds),
        next_retry_at: new Date(),
      },
    });
    this.logger.log(
      `Fiscal receipt enqueued [bank=${bank}, merchant=${merchantId}, vat=${stablePayload.withVat}] ` +
        `for products: [${removeProductIds.join(', ')}]`,
    );
  }

  /** Returns distinct (bank, merchant_id, with_vat) combinations that have pending/processing jobs. */
  async getActiveQueues(): Promise<Array<{ bank: string; merchant_id: string; with_vat: boolean }>> {
    return this.prisma.fiscalQueue.findMany({
      where: { status: { in: ['pending', 'processing'] } },
      select: { bank: true, merchant_id: true, with_vat: true },
      distinct: ['bank', 'merchant_id', 'with_vat'],
    });
  }

  /**
   * Processes the single oldest pending job for one specific (bank, merchant_id, with_vat) stream.
   * Each stream is fully independent — a failure in one does NOT block others.
   * Vchasno enforces chronological order per RRO account (merchant+vat), not globally.
   *
   * IMPORTANT: finds the OLDEST job first (ignoring next_retry_at), then checks backoff.
   * Never skips to a newer job — that would violate vchasno's chronological order requirement.
   */
  async processQueue(bank: string, merchantId: string, withVat: boolean): Promise<void> {
    const streamLabel = `bank=${bank}, merchant=${merchantId}, vat=${withVat}`;

    // Safety: skip if any job in this stream is currently being processed
    const processing = await this.prisma.fiscalQueue.findFirst({
      where: { status: 'processing', with_vat: withVat, bank, merchant_id: merchantId },
    });
    if (processing) {
      this.logger.debug(`Job #${processing.id} still processing — skipping cycle (${streamLabel})`);
      return;
    }

    // Find the oldest pending job in this stream (no next_retry_at filter here!)
    const oldestJob = await this.prisma.fiscalQueue.findFirst({
      where: { status: 'pending', with_vat: withVat, bank, merchant_id: merchantId },
      orderBy: { created_at: 'asc' },
    });

    if (!oldestJob) return;

    // If the oldest job is still in backoff — block the entire stream.
    // Do NOT skip to a newer job; that would violate chronological order within this RRO.
    if (oldestJob.next_retry_at > new Date()) {
      this.logger.debug(
        `Fiscal queue (${streamLabel}) BLOCKED — oldest job #${oldestJob.id} not ready until ` +
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
      const { mapped: fiscalDoc, raw: rawFiscalDoc } = await this.executeRequest(payload, job.merchant_id);

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

  async executeRequest(payload: FiscalPayload, merchantId: string): Promise<{ mapped: FiscalDocument; raw: Record<string, unknown> }> {
    const token = await this.getTokenForMerchant(merchantId);

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

    let fiscalDocResponse: Awaited<ReturnType<typeof this.http.get<Record<string, unknown>>>>;
    try {
      fiscalDocResponse = await this.http.get<Record<string, unknown>>(
        `/c/${doccode}.json`,
        { headers: { Authorization: token } },
      );
    } catch (err) {
      // POST succeeded and the receipt IS registered in vchasno (doccode exists).
      // Log doccode so it can be recovered manually if retries also fail.
      this.logger.error(
        `Fiscal receipt registered (doccode=${doccode}) but GET /c/${doccode}.json failed. ` +
          `Job will retry with same tag — vchasno will return same doccode. Error: ${(err as Error).message}`,
      );
      throw err;
    }

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
