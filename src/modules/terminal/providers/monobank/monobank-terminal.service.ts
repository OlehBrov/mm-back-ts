import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as net from 'net';
import {
  ITerminalProvider,
  PaymentRequest,
  PaymentResponse,
  MerchantInfo,
} from '../../interfaces/terminal-provider.interface';
import { buildFramedMessage, parseFramedBuffer } from '../privatbank/pax-protocol.utils';
import { TERMINAL_STATUS_EVENT } from '../../constants';
import { PrismaService } from '../../../../database/prisma.service';

interface ResponseListener {
  matcher: (data: Record<string, unknown>) => boolean;
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  resolveOnError?: boolean; // if true, resolve even when error:true (for GetLastResult)
}

// SSI JSON flow for financial operations:
//   1. Send Purchase and wait for terminal ack (catches immediate errors like E07 merchant-not-found)
//   2. Poll GetStatus every statusPollIntervalMs until status === 'S00' (terminal idle)
//      The terminal manages its own "no card" timeout — we never impose our own.
//   3. Call GetLastResult to get the actual transaction data
//   Cancel path: user taps Cancel on kiosk → we send Interrupt → terminal aborts → S00 →
//     GetLastResult returns non-0000 responseCode → sendPayment throws → frontend gets error.
//
// GetStatus codes:
//   S00 - idle, S01 - busy, S02 - waiting card, S03 - waiting PIN,
//   S04 - communicating with bank, S05 - printing, S06 - need Z-report, S07 - remove card

@Injectable()
export class MonoBankTerminalService implements ITerminalProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MonoBankTerminalService.name);
  private client!: net.Socket;
  private accumulatedBuffer = Buffer.alloc(0);
  private readonly responseListeners = new Set<ResponseListener>();
  private terminalStatus: 'online' | 'offline' = 'offline';
  private isReconnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private saleInProgress = false;

  // Set to true by terminal.module factory before onModuleInit fires
  shouldConnect = false;

  private readonly host: string;
  private readonly port: number;
  private readonly connectionTimeoutMs: number;
  private readonly reconnectIntervalMs: number;
  private readonly statusPollIntervalMs = 2000;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {
    this.host = config.get<string>('terminal.host') ?? '127.0.0.1';
    this.port = config.get<number>('terminal.port') ?? 3000;
    this.connectionTimeoutMs = config.get<number>('terminal.connectionTimeoutMs') ?? 5000;
    this.reconnectIntervalMs = config.get<number>('terminal.reconnectIntervalMs') ?? 30000;
  }

  onModuleInit() {
    if (!this.shouldConnect) return;
    this.client = this.createSocket();
    this.client.connect(this.port, this.host);
  }

  async onModuleDestroy() {
    if (!this.shouldConnect) return;
    this.clearReconnect();
    await new Promise<void>((resolve) => {
      this.client.end(() => {
        this.client.destroy();
        resolve();
      });
    });
  }

  private createSocket(): net.Socket {
    const socket = new net.Socket();

    socket.on('connect', () => {
      this.logger.log(`Connected to MonoBank terminal at ${this.host}:${this.port}`);
      this.clearReconnect();
      setImmediate(() =>
        this.onConnected().catch((err: unknown) =>
          this.logger.error(`Post-connect init failed: ${String(err)}`),
        ),
      );
    });

    socket.on('data', (data: Buffer) => {
      this.accumulatedBuffer = Buffer.concat([this.accumulatedBuffer, data]);
      this.processBuffer();
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      this.logger.error(`TCP error: ${err.message}`);
      if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
        this.setStatus('offline');
        this.scheduleReconnect();
      }
    });

    socket.on('close', (hadError: boolean) => {
      this.logger.warn(hadError ? 'Connection closed due to error' : 'Connection closed');
      this.setStatus('offline');
      this.scheduleReconnect();
    });

    return socket;
  }

  private processBuffer() {
    while (true) {
      const result = parseFramedBuffer(this.accumulatedBuffer);
      if (!result) break;

      this.accumulatedBuffer = this.accumulatedBuffer.subarray(result.consumed);
      if (Object.keys(result.parsed).length === 0) continue;

      const msg = result.parsed;
      this.logger.debug(`IN <<< ${JSON.stringify(msg)}`);

      let matched = false;
      for (const listener of this.responseListeners) {
        try {
          if (listener.matcher(msg)) {
            this.responseListeners.delete(listener);
            if (!listener.resolveOnError && msg['error'] === true) {
              listener.reject(
                new Error(
                  `Terminal error: ${(msg['errorDescription'] as string) ?? msg['errorCode'] ?? 'unknown'}`,
                ),
              );
            } else {
              listener.resolve(msg);
            }
            matched = true;
            break;
          }
        } catch (e) {
          this.logger.error(`Listener error: ${e}`);
        }
      }

      if (!matched) this.logger.debug(`Unmatched message: ${JSON.stringify(msg)}`);
    }
  }

  private write(data: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const buf = buildFramedMessage(JSON.stringify(data));
      this.logger.debug(`OUT >>> ${JSON.stringify(data)}`);
      this.client.write(buf, (err) => {
        if (err) reject(new Error(`Write error: ${err.message}`));
        else resolve();
      });
    });
  }

  private request<T extends Record<string, unknown>>(
    data: Record<string, unknown>,
    matcher: (r: Record<string, unknown>) => boolean,
    timeoutMs: number,
    resolveOnError = false,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const listener: ResponseListener = {
        matcher,
        resolve: (msg) => resolve(msg as T),
        reject,
        resolveOnError,
      };

      const timer = setTimeout(() => {
        this.responseListeners.delete(listener);
        reject(new Error('Timeout waiting for terminal response'));
      }, timeoutMs);

      listener.resolve = (msg) => {
        clearTimeout(timer);
        this.responseListeners.delete(listener);
        resolve(msg as T);
      };
      listener.reject = (err) => {
        clearTimeout(timer);
        this.responseListeners.delete(listener);
        reject(err);
      };

      this.responseListeners.add(listener);
      this.write(data).catch((err) => {
        clearTimeout(timer);
        this.responseListeners.delete(listener);
        reject(err);
      });
    });
  }

  private setStatus(status: 'online' | 'offline') {
    this.terminalStatus = status;
    this.events.emit(TERMINAL_STATUS_EVENT, { status });
  }

  private scheduleReconnect() {
    if (this.isReconnecting) return;
    this.isReconnecting = true;
    this.reconnectTimer = setInterval(() => {
      if (!this.client.connecting) {
        this.logger.log('Attempting reconnect...');
        this.client.connect(this.port, this.host);
      }
    }, this.reconnectIntervalMs);
  }

  private clearReconnect() {
    if (this.reconnectTimer) {
      clearInterval(this.reconnectTimer);
      this.reconnectTimer = null;
      this.isReconnecting = false;
    }
  }

  // Two-phase polling after Purchase:
  //
  // Phase 1 — wait for terminal to LEAVE S00 (max 5 s, 500 ms poll interval).
  //   Confirms the terminal received and started processing the Purchase.
  //   If it stays in S00 the whole time, the Purchase wasn't processed
  //   (e.g. previous cancel still cached, stale TCP state) → throw PAYMENT_NOT_STARTED.
  //
  // Phase 2 — wait for terminal to RETURN to S00 (no deadline).
  //   The terminal manages its own "no card" timeout — we never impose one.
  //
  // This eliminates the stale-GetLastResult bug: if Purchase was not processed the
  // terminal never leaves S00, so we never call GetLastResult and never confuse a
  // cached CANCELLED result from the previous transaction with the current one.
  private async pollUntilIdle(): Promise<void> {
    // Phase 1: confirm terminal started processing
    const startPollMs = 500;
    const startDeadline = Date.now() + 5_000;
    let transactionStarted = false;

    while (Date.now() < startDeadline) {
      await new Promise<void>((r) => setTimeout(r, startPollMs));
      const res = await this.request<Record<string, unknown>>(
        { method: 'GetStatus' },
        (r) => r['method'] === 'GetStatus',
        this.connectionTimeoutMs,
      );
      if ((res['status'] as string) !== 'S00') {
        transactionStarted = true;
        break;
      }
    }

    if (!transactionStarted) {
      const err = new Error('Terminal did not start processing payment (stayed S00 for 5 s after Purchase)');
      (err as NodeJS.ErrnoException).code = 'PAYMENT_NOT_STARTED';
      throw err;
    }

    // Phase 2: wait for transaction to finish
    while (true) {
      const res = await this.request<Record<string, unknown>>(
        { method: 'GetStatus' },
        (r) => r['method'] === 'GetStatus',
        this.connectionTimeoutMs,
      );
      if ((res['status'] as string) === 'S00') return;
      await new Promise<void>((r) => setTimeout(r, this.statusPollIntervalMs));
    }
  }

  async ping(): Promise<void> {
    try {
      await this.request(
        { method: 'PingDevice' },
        (r) => r['method'] === 'PingDevice',
        this.connectionTimeoutMs,
      );
      this.setStatus('online');
    } catch {
      this.setStatus('offline');
    }
  }

  private async onConnected(): Promise<void> {
    await this.ping();
    if (this.terminalStatus !== 'online') return;

    const merchants = await this.getMerchants();
    this.logger.log(
      `Terminal merchant list (${merchants.length}): ${merchants.map((m) => m.merchantId).join(', ')}`,
    );

    await this.syncMerchantsToStore(merchants);
  }

  private async syncMerchantsToStore(merchants: MerchantInfo[]): Promise<void> {
    if (merchants.length === 0) {
      this.logger.warn('No merchants returned from terminal — skipping DB sync');
      return;
    }

    const isSingle = merchants.length === 1;
    const data = {
      default_merchant: merchants[0].merchantId,
      VAT_excise_merchant: isSingle ? null : merchants[1].merchantId,
      is_single_merchant: isSingle,
    };

    await this.prisma.store.updateMany({ data });

    this.logger.log(
      isSingle
        ? `Store merchants synced: default=${data.default_merchant} (single merchant)`
        : `Store merchants synced: default=${data.default_merchant}, VAT=${data.VAT_excise_merchant!}`,
    );
  }

  async sendPayment(req: PaymentRequest): Promise<PaymentResponse> {
    this.saleInProgress = true;
    try {
      // Step 1: send Purchase and wait for terminal ack.
      // Using request() instead of write() so immediate protocol errors (E07 merchant-not-found,
      // etc.) are thrown right away rather than silently ignored as unmatched messages.
      await this.request<Record<string, unknown>>(
        {
          method: 'Purchase',
          params: {
            transAmount: String(req.amount),
            transCurrency: req.currency ?? '980',
            merchantId: req.merchantId,
          },
        },
        (r) => r['method'] === 'Purchase',
        this.connectionTimeoutMs,
      );

      // Step 2: poll GetStatus until S00 — terminal signals idle itself (success or no-card timeout).
      await this.pollUntilIdle();

      // Step 3: fetch actual transaction result.
      // resolveOnError=true: terminal uses error:true + E12 for cancelled/declined transactions —
      // these are application-level outcomes with useful params, not protocol failures.
      const result = await this.request<Record<string, unknown>>(
        { method: 'GetLastResult' },
        (r) => r['method'] === 'GetLastResult',
        this.connectionTimeoutMs,
        true,
      );

      const params = (result['params'] as Record<string, unknown>) ?? {};
      const responseCode = params['responseCode'] as string | undefined;
      const transactionResult = params['transactionResult'] as string | undefined;

      if (result['error'] === true || responseCode !== '0000') {
        const desc =
          (params['errorDetails'] as string) ??
          (result['errorDescription'] as string) ??
          transactionResult ??
          `responseCode=${responseCode ?? 'unknown'}`;

        if (transactionResult === 'CANCELLED') {
          const err = new Error(`Payment cancelled: ${desc}`);
          (err as NodeJS.ErrnoException).code = 'PAYMENT_CANCELLED';
          throw err;
        }

        throw new Error(`Payment declined: ${desc}`);
      }

      // Convert kopeks → UAH decimal string so downstream (fiscal, DB) always get the same format
      const amountKopeks = Number(params['transAmount'] ?? req.amount);
      const amountUAH = (amountKopeks / 100).toFixed(2);

      // Normalise date from any separator to DD/MM/YYYY for ReceiptBuilderService
      const rawDate = (params['date'] as string | undefined) ?? '';
      const normDate = rawDate.replace(/\./g, '/');

      return {
        method: 'Purchase',
        params: {
          ...params,
          amount: amountUAH,
          date: normDate,
          paymentSystem: params['binName'] as string,
          approvalCode: params['authCode'] as string,
          terminalId: params['terminalId'] as string,
          bankAcquirer: params['bankName'] as string,
          pan: params['pan'] as string,
          rrn: params['rrn'] as string,
          time: params['time'] as string,
          trnStatus: '1',
        },
      };
    } finally {
      this.saleInProgress = false;
    }
  }

  async cancelPayment(): Promise<void> {
    // Interrupt is only effective during S02 (card input) and S03 (PIN) statuses.
    // Best-effort: ignore errors so the terminal doesn't get into a stuck state.
    await this.request(
      { method: 'Interrupt' },
      (r) => r['method'] === 'Interrupt',
      this.connectionTimeoutMs,
    ).catch((err: unknown) => {
      this.logger.warn(`Interrupt failed or not acknowledged: ${String(err)}`);
    });
  }

  async getMerchants(): Promise<MerchantInfo[]> {
    const response = await this.request<Record<string, unknown>>(
      { method: 'GetMerchantList' },
      (r) => r['method'] === 'GetMerchantList' && r['error'] === false,
      this.connectionTimeoutMs,
    );
    const params = response['params'] as { merchantList?: string[] } | undefined;
    const list = params?.merchantList ?? [];
    return list.map((id) => ({ merchantId: id }));
  }

  async checkConnection(): Promise<boolean> {
    // Never ping during an active payment — it would inject a PingDevice into the
    // payment flow and could cause a timeout that flips status to 'offline'.
    if (this.saleInProgress) return this.terminalStatus === 'online';
    try {
      await this.ping();
      return this.terminalStatus === 'online';
    } catch {
      return false;
    }
  }

  getStatus(): 'online' | 'offline' {
    return this.terminalStatus;
  }
}
