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
import {
  buildPrivatMessage,
  buildPrivatHandshake,
  parseNullTerminatedBuffer,
} from './privat-protocol.utils';
import { TERMINAL_STATUS_EVENT } from '../../constants';

// PrivatBank ECR JSON protocol:
//   - Framing:     NULL-terminated JSON (0x00 delimiter), NOT STX/LRC
//   - PingDevice:  sent with extra leading 0x00 (handshake marker)
//   - Purchase:    send → wait for ONE final response with all transaction params
//                  (no GetStatus polling, no GetLastResult — that is MonoBank SSI JSON)
//   - Cancel:      ServiceMessage { msgType: "interrupt" }
//   - Merchant list: ServiceMessage { msgType: "getMerchantList" }
//   - Default port: 2000  (configurable via terminal.port env)

interface ResponseListener {
  matcher: (data: Record<string, unknown>) => boolean;
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  resolveOnError?: boolean;
}

@Injectable()
export class PrivatBankTerminalService implements ITerminalProvider, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrivatBankTerminalService.name);
  private client!: net.Socket;
  private accumulatedBuffer = Buffer.alloc(0);
  private readonly responseListeners = new Set<ResponseListener>();
  private terminalStatus: 'online' | 'offline' = 'offline';
  private isReconnecting = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private saleInProgress = false;

  // Set to true by terminal.module factory before onModuleInit fires.
  shouldConnect = false;

  private readonly host: string;
  private readonly port: number;
  private readonly paymentTimeoutMs: number;
  private readonly connectionTimeoutMs: number;
  private readonly reconnectIntervalMs: number;

  constructor(
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
  ) {
    this.host = config.get<string>('terminal.host') ?? '127.0.0.1';
    this.port = config.get<number>('terminal.port') ?? 2000; // PrivatBank default port is 2000
    this.paymentTimeoutMs = config.get<number>('terminal.paymentTimeoutMs') ?? 60000;
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
      this.logger.log(`Connected to PrivatBank terminal at ${this.host}:${this.port}`);
      this.clearReconnect();
      // Docs recommend 1s between PingDevice response and next request — handled in ping().
      setImmediate(() => this.ping().catch(() => {}));
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
      const result = parseNullTerminatedBuffer(this.accumulatedBuffer);
      if (!result) break;

      this.accumulatedBuffer = this.accumulatedBuffer.subarray(result.consumed);

      if (Object.keys(result.parsed).length === 0) continue; // skipped garbage

      const msg = result.parsed;
      this.logger.debug(`IN <<< ${JSON.stringify(msg)}`);

      let matched = false;
      for (const listener of this.responseListeners) {
        try {
          if (listener.matcher(msg)) {
            this.responseListeners.delete(listener);
            if (!listener.resolveOnError && msg['error']) {
              listener.reject(
                new Error(
                  `Terminal error: ${(msg['errorDescription'] as string | undefined) ?? msg['method'] ?? 'unknown'}`,
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

      if (!matched) this.handleUnmatchedMessage(msg);
    }
  }

  private handleUnmatchedMessage(msg: Record<string, unknown>) {
    const params = (msg['params'] as Record<string, unknown>) ?? {};
    const msgType = params['msgType'] as string | undefined;

    if (msg['method'] === 'ServiceMessage' && msgType === 'deviceBusy') {
      this.logger.warn('Terminal is busy (ServiceMessage.deviceBusy)');
    } else if (msg['method'] === 'ServiceMessage' && msgType === 'interruptTransmitted') {
      this.logger.warn('Terminal confirmed interrupt (ServiceMessage.interruptTransmitted)');
    } else {
      this.logger.debug(`Unmatched message: ${JSON.stringify(msg)}`);
    }
  }

  // Send a regular (non-handshake) message.
  private write(data: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const buf = buildPrivatMessage(JSON.stringify(data));
      this.logger.debug(`OUT >>> ${JSON.stringify(data)}`);
      this.client.write(buf, (err) => {
        if (err) reject(new Error(`Write error: ${err.message}`));
        else resolve();
      });
    });
  }

  // Send a handshake message (PingDevice — extra leading 0x00).
  private writeHandshake(data: Record<string, unknown>): Promise<void> {
    return new Promise((resolve, reject) => {
      const buf = buildPrivatHandshake(JSON.stringify(data));
      this.logger.debug(`OUT (handshake) >>> ${JSON.stringify(data)}`);
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
    useHandshake = false,
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

      const sendFn = useHandshake ? this.writeHandshake.bind(this) : this.write.bind(this);
      sendFn(data).catch((err: Error) => {
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

  async ping(): Promise<void> {
    try {
      // PingDevice uses the handshake framing (\x00{json}\x00).
      await this.request(
        { method: 'PingDevice', step: 0 },
        (r) => r['method'] === 'PingDevice',
        this.connectionTimeoutMs,
        true, // handshake framing
      );
      // Protocol docs recommend waiting 1s after PingDevice before next request.
      await new Promise<void>((r) => setTimeout(r, 1000));
      this.setStatus('online');
    } catch {
      this.setStatus('offline');
    }
  }

  async sendPayment(req: PaymentRequest): Promise<PaymentResponse> {
    this.saleInProgress = true;
    try {
      // PrivatBank: send Purchase → wait for ONE final response containing all params.
      // amount is in kopeks in PaymentRequest; PrivatBank expects UAH decimal string.
      const amount = (req.amount / 100).toFixed(2);

      // resolveOnError=true: Purchase error responses (cancel, decline) carry params we need to
      // inspect (responseCode, trnStatus) — let sendPayment() decide how to handle them.
      const result = await this.request<Record<string, unknown>>(
        {
          method: 'Purchase',
          step: 0,
          params: { amount, merchantId: req.merchantId },
        },
        (r) => r['method'] === 'Purchase',
        this.paymentTimeoutMs,
        false, // useHandshake
        true,  // resolveOnError
      );

      const params = (result['params'] as Record<string, unknown>) ?? {};
      const trnStatus = params['trnStatus'] as string | undefined;
      const responseCode = params['responseCode'] as string | undefined;

      if (result['error'] === true || trnStatus !== '1' || responseCode !== '0000') {
        const desc =
          (params['errorDescription'] as string) ??
          `trnStatus=${trnStatus ?? '?'}, responseCode=${responseCode ?? '?'}`;

        // responseCode 1001 = user-initiated cancel (tap Cancel on terminal)
        if (responseCode === '1001') {
          const err = new Error(`Payment cancelled: ${desc}`);
          (err as NodeJS.ErrnoException).code = 'PAYMENT_CANCELLED';
          throw err;
        }

        throw new Error(`Payment declined: ${desc}`);
      }

      // Normalise date from PrivatBank "DD.MM.YYYY" → "DD/MM/YYYY" for ReceiptBuilderService
      const rawDate = (params['date'] as string | undefined) ?? '';
      const normDate = rawDate.replace(/\./g, '/');

      return { method: 'Purchase', params: { ...params, date: normDate, trnStatus: '1' } };
    } finally {
      this.saleInProgress = false;
    }
  }

  async cancelPayment(): Promise<void> {
    // PrivatBank cancel uses ServiceMessage.interrupt (not {method: "Interrupt"} — that is MonoBank).
    // Terminal responds with ServiceMessage.interruptTransmitted, then sends a Purchase
    // error response (responseCode: "1001") which rejects any active sendPayment() promise.
    await this.write({ method: 'ServiceMessage', step: 0, params: { msgType: 'interrupt' } });
  }

  async getMerchants(): Promise<MerchantInfo[]> {
    // PrivatBank returns merchants as numeric keys in params: { "3": "Payment by Parts", ... }
    const response = await this.request<Record<string, unknown>>(
      { method: 'ServiceMessage', step: 0, params: { msgType: 'getMerchantList' } },
      (r) =>
        r['method'] === 'ServiceMessage' &&
        (r['params'] as Record<string, unknown>)?.['msgType'] === 'getMerchantList',
      this.connectionTimeoutMs,
    );

    const params = (response['params'] as Record<string, string>) ?? {};
    return Object.entries(params)
      .filter(([key]) => key !== 'msgType')
      .map(([key, name]) => ({ merchantId: key, merchantName: String(name) }));
  }

  async checkConnection(): Promise<boolean> {
    // Never ping during an active payment — PingDevice would inject into the payment flow.
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
