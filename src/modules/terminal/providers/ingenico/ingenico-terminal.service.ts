import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ITerminalProvider,
  PaymentRequest,
  PaymentResponse,
  MerchantInfo,
} from '../../interfaces/terminal-provider.interface';
import { TERMINAL_STATUS_EVENT } from '../../constants';
import { PrismaService } from '../../../../database/prisma.service';
import { BPOSLib } from './native/bposlib';

// Ingenico SELF2000, BPOS1 protocol over TCP (vendor "pure_c" Linux library, see
// native/BPOSLib.h). Unlike PrivatBank/MonoBank this is not a JSON socket protocol
// we frame ourselves — the vendor .so owns the TCP connection and STX/ETX/LRC
// framing internally; we only call its exported functions and poll LastResult().
//
// Purchase flow (see BPOSLib.h / ECRCommX docs):
//   1. Purchase() returns immediately, transaction runs in a library-internal thread
//   2. Poll LastResult(): 2 = in progress, 0 = success, 1 = error
//   3. On success, Confirm() is MANDATORY — otherwise the terminal reverts the
//      transaction itself (two-phase, unlike PrivatBank/MonoBank single-phase Purchase)
//
// merchIdx: the native API takes a numeric merchant index (BYTE), not a merchant-id
// string like PrivatBank/MonoBank. PaymentRequest.merchantId is parsed as that index.
//
// NOTE — unverified: PaymentRequest.amount/discount are in kopecks per the shared
// interface, and are passed to Purchase() as-is. BPOSLib.h does not document the
// expected unit for ulAmount. Confirm with a real small-amount transaction before
// relying on this in production.

@Injectable()
export class IngenicoTerminalService implements ITerminalProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngenicoTerminalService.name);
  private terminalStatus: 'online' | 'offline' = 'offline';
  private isReconnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private saleInProgress = false;
  private pinging = false;
  private hasInitialized = false;

  // Set to true by terminal.module factory before onModuleInit fires.
  shouldConnect = false;

  private host: string;
  private port: number;
  private readonly defaultMerchIdx: number;
  private readonly paymentTimeoutMs: number;
  private readonly connectionTimeoutMs: number;
  private readonly reconnectIntervalMs: number;
  private readonly pollIntervalMs = 500;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {
    this.host = config.get<string>('terminal.host') ?? '127.0.0.1';
    this.port = config.get<number>('terminal.ingenicoPort') ?? 2000;
    this.defaultMerchIdx = config.get<number>('terminal.ingenicoMerchIdx') ?? 1;
    this.paymentTimeoutMs = config.get<number>('terminal.paymentTimeoutMs') ?? 60000;
    this.connectionTimeoutMs = config.get<number>('terminal.connectionTimeoutMs') ?? 5000;
    this.reconnectIntervalMs = config.get<number>('terminal.reconnectIntervalMs') ?? 30000;
  }

  async onModuleInit() {
    if (!this.shouldConnect || this.hasInitialized) return;
    this.hasInitialized = true;

    const dbConfig = await this.prisma.terminalConfig.findUnique({ where: { bank: 'ingenico' } });
    if (dbConfig?.host) this.host = dbConfig.host;
    if (dbConfig?.port) this.port = dbConfig.port;

    BPOSLib.initialize();
    await this.connect();
  }

  async onModuleDestroy() {
    if (!this.shouldConnect) return;
    this.clearReconnect();
    BPOSLib.commClose();
  }

  private async connect(): Promise<void> {
    try {
      const result = await BPOSLib.commOpenTCP(this.host, String(this.port));
      if (result === 0) {
        this.logger.log(`Connected to Ingenico terminal at ${this.host}:${this.port}`);
        this.setStatus('online');
        this.clearReconnect();
      } else {
        this.logger.warn(`CommOpenTCP failed (code ${result})`);
        this.setStatus('offline');
        this.scheduleReconnect();
      }
    } catch (err) {
      this.logger.error(`CommOpenTCP threw: ${String(err)}`);
      this.setStatus('offline');
      this.scheduleReconnect();
    }
  }

  private setStatus(status: 'online' | 'offline') {
    if (this.terminalStatus === status) return;
    this.terminalStatus = status;
    this.events.emit(TERMINAL_STATUS_EVENT, { status });
  }

  private scheduleReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.reconnectTimer = setInterval(() => {
      this.connect().catch((err: unknown) => this.logger.error(`Reconnect failed: ${String(err)}`));
    }, this.reconnectIntervalMs);
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
      this.isReconnecting = false;
    }
  }

  private async pollUntilDone(deadlineMs: number): Promise<number> {
    const deadline = Date.now() + deadlineMs;
    while (Date.now() < deadline) {
      const result = BPOSLib.lastResult();
      if (result !== 2) return result;
      await new Promise<void>((r) => setTimeout(r, this.pollIntervalMs));
    }
    throw new Error('Timeout waiting for terminal to finish transaction');
  }

  async sendPayment(req: PaymentRequest): Promise<PaymentResponse> {
    const merchIdx = parseInt(req.merchantId, 10);
    if (Number.isNaN(merchIdx)) {
      throw new Error(`Invalid Ingenico merchant index: "${req.merchantId}"`);
    }

    this.saleInProgress = true;
    try {
      // A status ping may still be in flight; the terminal handles one operation at a time.
      const waitDeadline = Date.now() + this.connectionTimeoutMs * 2;
      while (this.pinging && Date.now() < waitDeadline) {
        await new Promise<void>((r) => setTimeout(r, 100));
      }

      // The link may have been lost while idle — re-open it before starting the sale.
      if (this.terminalStatus !== 'online') {
        BPOSLib.commClose();
        await this.connect();
        if (this.getStatus() !== 'online') {
          throw new Error('Ingenico terminal is not reachable');
        }
      }

      this.logger.log(
        `Purchase start: amount=${req.amount} discount=0 merchIdx=${merchIdx} (requested discount=${req.discount})`,
      );
      const startCode = await BPOSLib.purchase(req.amount, 0, merchIdx);
      if (startCode !== 0) {
        const desc = BPOSLib.lastErrorDescription();
        this.logger.error(
          `Purchase failed to start: code=${startCode} lastErrorCode=${BPOSLib.lastErrorCode()} "${desc}"`,
        );
        throw new Error(`Purchase failed to start (code ${startCode}): ${desc}`);
      }

      const lastResult = await this.pollUntilDone(this.paymentTimeoutMs);
      this.logger.log(`Purchase finished: LastResult=${lastResult}`);

      if (lastResult !== 0) {
        const desc = BPOSLib.lastErrorDescription() || `LastResult=${lastResult}`;
        this.logger.warn(
          `Purchase not approved: lastErrorCode=${BPOSLib.lastErrorCode()} "${desc}"`,
        );
        const err = new Error(`Payment declined: ${desc}`);
        (err as NodeJS.ErrnoException).code = 'PAYMENT_CANCELLED';
        throw err;
      }

      // Mandatory after a successful Purchase — otherwise the terminal reverts it.
      BPOSLib.confirm();

      const responseCode = BPOSLib.responseCode();
      const amountUAH = (BPOSLib.amount() / 100).toFixed(2);

      return {
        method: 'Purchase',
        params: {
          trnStatus: '1',
          transAmount: amountUAH,
          amount: amountUAH,
          approvalCode: BPOSLib.authCode(),
          rrn: BPOSLib.rrn(),
          pan: BPOSLib.pan(),
          responseCode: String(responseCode),
          invoiceNum: String(BPOSLib.invoiceNum()),
        },
      };
    } finally {
      this.saleInProgress = false;
    }
  }

  async cancelPayment(): Promise<void> {
    // Only effective while LastResult() === 2 (transaction in progress).
    // Best-effort: swallow errors so the terminal doesn't get stuck.
    try {
      BPOSLib.cancel();
    } catch (err) {
      this.logger.warn(`Cancel failed: ${String(err)}`);
    }
  }

  async getMerchants(): Promise<MerchantInfo[]> {
    // The vendor "pure_c" Linux API (unlike PrivatBank/MonoBank's JSON protocols)
    // has no merchant-list query — the merchant index is fixed by whoever
    // configured the terminal. Report the single configured index.
    return [{ merchantId: String(this.defaultMerchIdx) }];
  }

  // Polled by the kiosk frontend every few seconds. Uses the vendor Ping() (link to the
  // terminal only) — NOT CheckConnection(), which makes the terminal dial the bank and
  // keeps it busy (LastResult=2), which collided with Purchase and showed "Зв'язок з банком".
  async checkConnection(): Promise<boolean> {
    if (this.saleInProgress || this.pinging) return this.terminalStatus === 'online';
    this.pinging = true;
    try {
      // Link was lost earlier: re-open it instead of staying offline forever.
      if (this.terminalStatus !== 'online') {
        BPOSLib.commClose();
        await this.connect();
        return this.getStatus() === 'online';
      }

      const code = await BPOSLib.ping();
      if (code === 0) return true;

      this.logger.warn(`Ping failed: code=${code} "${BPOSLib.lastErrorDescription()}"`);
      this.setStatus('offline');
      return false;
    } catch (err) {
      this.logger.warn(`Ping threw: ${String(err)}`);
      this.setStatus('offline');
      return false;
    } finally {
      this.pinging = false;
    }
  }

  getStatus(): 'online' | 'offline' {
    return this.terminalStatus;
  }
}
