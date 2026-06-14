import { Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { TERMINAL_STATUS_EVENT } from '../terminal/constants';
import { TerminalService } from '../terminal/terminal.service';
import { SECOND_PAYMENT_EVENT } from '../cart/cart.service';
import { PRODUCT_UPDATED_EVENT, STORE_SALE_UPDATED_EVENT } from '../store/constants';
import { RECEIPT_READY_EVENT } from '../fiscal/fiscal.service';
import { IdleSyncService } from './idle-sync.service';

/**
 * Idle sync flow:
 *  1. Admin saves product/category changes → written to temp JSON queue files
 *  2. Server polls the kiosk display every SCREEN_POLL_MS:  emit('screen-status')
 *  3. Frontend responds with screen-status { isIdleOpen: true } when screensaver is active
 *  4. Gateway triggers IdleSyncService.syncIfIdle() → queue files are flushed to DB
 *
 * The frontend can also proactively send idle-status { isIdleOpen: true } at the
 * moment it transitions to the idle screen (faster than waiting for the next poll).
 *
 * Both paths call syncIfIdle(), which has a built-in isSyncing guard so concurrent
 * triggers (poll + proactive) never run two syncs at once.
 */

const SCREEN_POLL_MS = 30_000;

@WebSocketGateway({ cors: { origin: '*' } })
export class KioskGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  private readonly server!: Server;

  private readonly logger = new Logger(KioskGateway.name);

  constructor(
    private readonly terminalService: TerminalService,
    private readonly idleSyncService: IdleSyncService,
  ) {}

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('terminal-status', { status: this.terminalService.getStatus() });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // ─── Client → Server ──────────────────────────────────────────────────────

  /**
   * Frontend proactively reports entering the idle/screensaver state.
   * Triggers sync immediately without waiting for the next poll cycle.
   */
  @SubscribeMessage('idle-status')
  async handleIdleStatus(
    @ConnectedSocket() _client: Socket,
    @MessageBody() data: { isIdleOpen?: boolean },
  ): Promise<void> {
    const isIdle = !!data?.isIdleOpen;
    this.idleSyncService.markKioskIdle(isIdle);
    if (!isIdle) return;
    this.logger.debug('Received idle-status=true — triggering sync');
    await this.idleSyncService.syncIfIdle();
  }

  /**
   * Frontend responds to the server's periodic screen-status poll.
   * If the frontend reports it is on the idle screen, triggers sync.
   */
  @SubscribeMessage('screen-status')
  async handleScreenStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { isIdleOpen?: boolean },
  ): Promise<void> {
    const isIdle = !!data?.isIdleOpen;
    this.logger.debug(`screen-status from ${client.id}: isIdleOpen=${isIdle}`);
    this.idleSyncService.markKioskIdle(isIdle);
    if (isIdle) await this.idleSyncService.syncIfIdle();
  }

  /**
   * Frontend requests current terminal status (on connect, on idle close, on interval).
   * Responds immediately with cached status, then triggers a fresh ping in the background —
   * the ping result auto-broadcasts via TERMINAL_STATUS_EVENT if the status changed.
   */
  @SubscribeMessage('check-status')
  handleCheckStatus(@ConnectedSocket() client: Socket): void {
    client.emit('terminal-status', { status: this.terminalService.getStatus() });
    this.terminalService.checkConnection().catch(() => {});
  }

  /**
   * Admin panel heartbeat — confirms the WebSocket connection is alive.
   */
  @SubscribeMessage('admin-ping')
  handleAdminPing(@ConnectedSocket() client: Socket): void {
    client.emit('admin-pong');
  }

  /**
   * Diagnostic: returns the merchant list from the terminal.
   * Trigger from browser console: socket.emit('get-merchants')
   * Listen: socket.on('merchants', d => console.log(d))
   */
  @SubscribeMessage('get-merchants')
  async handleGetMerchants(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const merchants = await this.terminalService.getMerchants();
      client.emit('merchants', { merchants });
    } catch (err) {
      client.emit('merchants', { error: String(err) });
    }
  }

  // ─── Internal EventEmitter2 → broadcast ──────────────────────────────────

  @OnEvent(TERMINAL_STATUS_EVENT)
  onTerminalStatus(payload: { status: 'online' | 'offline' }): void {
    this.server.emit('terminal-status', payload);
  }

  /**
   * Emitted by CartService right before the second terminal payment (VAT merchant).
   * The kiosk display should prompt the customer to tap their card again.
   */
  @OnEvent(SECOND_PAYMENT_EVENT)
  onSecondPayment(): void {
    this.server.emit('secondPayment');
  }

  @OnEvent(PRODUCT_UPDATED_EVENT)
  onProductUpdated(): void {
    this.server.emit('product-updated');
  }

  @OnEvent(STORE_SALE_UPDATED_EVENT)
  onStoreSaleUpdated(): void {
    this.server.emit('store-sale-updated');
  }

  /**
   * Emitted by FiscalService after a queue job completes.
   * Wraps the raw vchasno document so the frontend Reciept component
   * can render it: fiscalResponse[key] = { fiscal: rawDoc }.
   */
  @OnEvent(RECEIPT_READY_EVENT)
  onReceiptReady(payload: { withVat: boolean; raw: Record<string, unknown> }): void {
    const key = payload.withVat ? 'fiscalWithVAT' : 'fiscalNoVAT';
    this.server.emit('receipt-ready', { [key]: { fiscal: payload.raw } });
  }

  // ─── Periodic screen-status poll ─────────────────────────────────────────

  /**
   * Asks the kiosk display what screen it is currently showing.
   * The frontend responds via the 'screen-status' event.
   * If it reports isIdleOpen=true the handleScreenStatus handler triggers sync.
   */
  @Interval(SCREEN_POLL_MS)
  pollScreenStatus(): void {
    this.server.emit('screen-status');
  }
}
