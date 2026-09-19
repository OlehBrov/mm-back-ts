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
  private cancelRequested = false;
  // True while a status probe / heartbeat is talking to the terminal (one operation at a time).
  private pinging = false;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatFailing = false;
  private lastTermStatus = -1;
  private hasInitialized = false;

  // Set to true by terminal.module factory before onModuleInit fires.
  shouldConnect = false;

  private host: string;
  private port: number;
  private readonly defaultMerchIdx: number;
  // 0 disables the heartbeat (link is then opened per sale / per status probe only).
  private readonly heartbeatMs: number;
  // ECR status sent by the heartbeat (ECRCommX ExchangeStatuses): 1 not supported, 2 normal,
  // 3 customer in progress, 4 maintenance, 5 not connected. The terminal's idle screen may
  // depend on it — configurable so it can be tried on the real terminal.
  private readonly ecrStatus: number;
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
    this.heartbeatMs = config.get<number>('terminal.ingenicoHeartbeatMs') ?? 8000;
    this.ecrStatus = config.get<number>('terminal.ingenicoEcrStatus') ?? 2;
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

    if (this.heartbeatMs > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.heartbeat().catch((err: unknown) => this.logger.warn(`Heartbeat threw: ${String(err)}`));
      }, this.heartbeatMs);
    }
  }

  async onModuleDestroy() {
    if (!this.shouldConnect) return;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.clearReconnect();
    BPOSLib.commClose();
  }

  // Keeps the terminal from showing "ECR not connected" (it times out after 15 s without ECR
  // traffic) and keeps the link alive between sales. Best-effort: a failed heartbeat only
  // reopens the link — availability is decided by whether the TCP open succeeds.
  private async heartbeat(): Promise<void> {
    if (this.saleInProgress || this.pinging) return;
    this.pinging = true;
    try {
      const code = await BPOSLib.exchangeStatuses(this.ecrStatus);
      const ok = code === 0 && (await this.pollUntilDone(this.connectionTimeoutMs)) === 0;
      if (ok) {
        if (this.heartbeatFailing) this.logger.log('Heartbeat recovered');
        this.heartbeatFailing = false;
        this.setStatus('online');
        const termStatus = BPOSLib.termStatus();
        if (termStatus !== this.lastTermStatus) {
          this.lastTermStatus = termStatus;
          this.logger.log(`Terminal status (TermStatus)=${termStatus}`);
        }
        return;
      }

      if (!this.heartbeatFailing) {
        this.heartbeatFailing = true;
        this.logger.warn(
          this.describeFailure(`Heartbeat (ExchangeStatuses) failed, code=${code} — reopening link`),
        );
      }
      BPOSLib.commClose();
      await this.connect();
    } finally {
      this.pinging = false;
    }
  }

  private async connect(): Promise<void> {
    try {
      const result = await BPOSLib.commOpenTCP(this.host, String(this.port));
      if (result === 0) {
        // Status probes reopen the link every 30 s — log only the offline → online change.
        if (this.terminalStatus !== 'online') {
          this.logger.log(`Connected to Ingenico terminal at ${this.host}:${this.port}`);
        }
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
    this.cancelRequested = false;
    try {
      // A status probe may still be in flight; the terminal handles one operation at a time.
      const waitDeadline = Date.now() + this.connectionTimeoutMs * 2;
      while (this.pinging && Date.now() < waitDeadline) {
        await new Promise<void>((r) => setTimeout(r, 100));
      }

      // The terminal drops an idle TCP link after its "connection hold time" (15 s), and
      // the library does not notice — Purchase would fail with "Terminal connection error".
      // Open a fresh link right before every sale, as the vendor test tool does.
      BPOSLib.commClose();
      await this.connect();
      if (this.getStatus() !== 'online') {
        throw new Error('Ingenico terminal is not reachable');
      }

      this.logger.log(
        `Purchase start: amount=${req.amount} discount=0 merchIdx=${merchIdx} (requested discount=${req.discount})`,
      );
      const startCode = await BPOSLib.purchase(req.amount, 0, merchIdx);
      if (startCode !== 0) {
        throw new Error(this.describeFailure(`Purchase failed to start (code ${startCode})`));
      }

      const lastResult = await this.pollUntilDone(this.paymentTimeoutMs);
      this.logger.log(`Purchase finished: LastResult=${lastResult}`);

      if (lastResult !== 0) {
        const message = this.describeFailure('Purchase not approved');
        this.logger.warn(message);
        const err = new Error(message);
        // Cancelled from the kiosk (our Cancel()) or by the customer on the terminal
        // (ResponseCode 1001, same as PrivatBank) — not a connection error or a decline.
        if (this.cancelRequested || BPOSLib.responseCode() === 1001) {
          (err as NodeJS.ErrnoException).code = 'PAYMENT_CANCELLED';
        }
        throw err;
      }

      // Per the vendor sample: read the transaction data BEFORE Confirm — Confirm starts a new
      // library operation (LastResult=2) and the properties are undefined until it finishes.
      const amountUAH = (BPOSLib.amount() / 100).toFixed(2);
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const params = {
        trnStatus: '1',
        transAmount: amountUAH,
        amount: amountUAH,
        // BPOSLib.h has no DateTime getter — use the kiosk clock (DD/MM/YYYY, HH:MM:SS).
        date: `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`,
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
        approvalCode: BPOSLib.authCode(),
        rrn: BPOSLib.rrn(),
        pan: BPOSLib.pan(),
        terminalId: BPOSLib.terminalId(),
        paymentSystem: BPOSLib.issuerName(),
        // The library does not report the acquirer; this terminal is PrivatBank's.
        bankAcquirer: 'PrivatBank',
        responseCode: String(BPOSLib.responseCode()),
        invoiceNum: String(BPOSLib.invoiceNum()),
      };

      // Mandatory after a successful Purchase — otherwise the terminal reverts it.
      BPOSLib.confirm();
      const confirmResult = await this.pollUntilDone(this.connectionTimeoutMs * 2);
      if (confirmResult !== 0) {
        throw new Error(this.describeFailure('Payment was not confirmed (terminal will revert it)'));
      }

      return { method: 'Purchase', params };
    } finally {
      this.saleInProgress = false;
      // With the heartbeat on, keep the link open — closing it would show "ECR not connected"
      // until the next heartbeat tick reopens it.
      if (this.heartbeatMs === 0) BPOSLib.commClose();
    }
  }

  private describeFailure(prefix: string): string {
    const errorCode = BPOSLib.lastErrorCode();
    // 1/2 = COM/link not open, 3 = error connecting with terminal, 4 = terminal returned an
    // error (details in ResponseCode) — per ECRCommX docs.
    const responseCode = errorCode === 4 ? ` responseCode=${BPOSLib.responseCode()}` : '';
    return `${prefix}: lastErrorCode=${errorCode}${responseCode} "${BPOSLib.lastErrorDescription()}"`;
  }

  async cancelPayment(): Promise<void> {
    // Only effective while LastResult() === 2 (transaction in progress).
    // Best-effort: swallow errors so the terminal doesn't get stuck.
    this.cancelRequested = true;
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

  // Polled by the kiosk frontend every few seconds. A fresh TCP open is the reachability
  // probe: the terminal drops idle links after 15 s, so Ping() on the old link would report
  // offline every time. Not CheckConnection() either — that makes the terminal dial the bank
  // and keeps it busy (LastResult=2), which collided with Purchase.
  async checkConnection(): Promise<boolean> {
    if (this.saleInProgress || this.pinging) return this.terminalStatus === 'online';
    // The heartbeat already keeps the status current — no need to reopen the link here.
    if (this.heartbeatMs > 0) return this.terminalStatus === 'online';
    this.pinging = true;
    try {
      BPOSLib.commClose();
      await this.connect();
      const online = this.getStatus() === 'online';
      // Leave no half-dead link behind; the next sale opens its own.
      BPOSLib.commClose();
      return online;
    } finally {
      this.pinging = false;
    }
  }

  getStatus(): 'online' | 'offline' {
    return this.terminalStatus;
  }
}
