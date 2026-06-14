import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { TerminalService } from '../terminal/terminal.service';
import { FiscalService } from '../fiscal/fiscal.service';
import { ReceiptBuilderService, CartProduct } from '../fiscal/receipt-builder.service';
import { PaymentResponse } from '../terminal/interfaces/terminal-provider.interface';
import { CartSellDto, CartProductDto } from './dto/cart-sell.dto';

/** Emitted before the second terminal payment starts (noVAT succeeded, VAT about to begin).
 *  WebSocket gateway listens to this and relays it to the kiosk display. */
export const SECOND_PAYMENT_EVENT = 'cart.secondPayment';

interface StoreConfig {
  auth_id: string;
  default_merchant: string | null;
  VAT_excise_merchant: string | null;
  default_merchant_taxgrp: number | null;
  VAT_merchant_taxgrp: number | null;
  VAT_excise_taxgrp: number | null;
}

interface EnrichedProduct extends CartProduct {
  id: number;
  product_lot?: number;
  sale_id?: number | null;
  internalCheckId: string;
}

export interface PostPaymentResult {
  status: string;
  removeProductIds: number[];
}

@Injectable()
export class CartService {
  private readonly logger = new Logger(CartService.name);
  private saleInProgress = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly terminalService: TerminalService,
    private readonly fiscalService: FiscalService,
    private readonly receiptBuilder: ReceiptBuilderService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Full purchase flow:
   *  - Split products into noVAT (default_merchant) and VAT/excise (VAT_excise_merchant) groups
   *  - Send a separate terminal payment per group (two separate merchantId transactions)
   *  - For each successful payment: save RemoveProducts + decrement stock + enqueue fiscal
   *
   * Returns:
   *  { status: 'success', fiscalResponse: { fiscalNoVAT?, fiscalWithVAT? } }
   *  { status: 'part-success', fiscalResponse: { fiscalNoVAT }, error: { target, description } }
   *    — when noVAT payment succeeded but VAT payment failed
   */
  async sellProducts(dto: CartSellDto, storeAuthId: string) {
    if (!dto.cartProducts?.length) {
      throw new BadRequestException('No products to buy');
    }

    if (this.saleInProgress) {
      throw new ForbiddenException('A sale is already in progress');
    }

    const store = await this.prisma.store.findFirst({
      where: { auth_id: storeAuthId },
      select: {
        auth_id: true,
        default_merchant: true,
        VAT_excise_merchant: true,
        default_merchant_taxgrp: true,
        VAT_merchant_taxgrp: true,
        VAT_excise_taxgrp: true,
      },
    });

    if (!store) throw new ForbiddenException('Store not found');

    // One UUID shared across all products in this session (both merchants)
    const internalCheckId = randomUUID();
    const { noVatProducts, vatProducts } = this.splitByTaxGroup(
      dto.cartProducts,
      store,
      internalCheckId,
    );

    if (vatProducts.length > 0 && !store.VAT_excise_merchant) {
      throw new BadRequestException(
        'Cart has VAT/excise products but the store has no VAT merchant configured',
      );
    }

    const hasNoVat = noVatProducts.length > 0 && !!store.default_merchant;
    const hasVat = vatProducts.length > 0 && !!store.VAT_excise_merchant;

    if (!hasNoVat && !hasVat) {
      throw new BadRequestException('No valid products to process');
    }

    this.saleInProgress = true;
    const fiscalResponse: Record<string, PostPaymentResult> = {};

    try {
      // inner try — see catch below for cancelled-payment handling
      // ── Payment 1: noVAT products → default_merchant ─────────────────────
      if (hasNoVat) {
        const amountKopeks = this.calculateAmountKopeks(noVatProducts);
        // Throws on terminal decline → caught by outer catch, sale aborted entirely
        const terminalResponse = await this.processTerminalPayment(
          amountKopeks,
          store.default_merchant!,
        );
        fiscalResponse.fiscalNoVAT = await this.processPostPayment(
          noVatProducts,
          terminalResponse,
          false,
        );
      }

      // ── Payment 2: VAT/excise products → VAT_excise_merchant ─────────────
      if (hasVat) {
        // Notify the kiosk display: first card done, tap again for second merchant
        if (hasNoVat) {
          this.events.emit(SECOND_PAYMENT_EVENT);
        }

        const amountKopeks = this.calculateAmountKopeks(vatProducts);

        let terminalResponse: PaymentResponse;
        try {
          terminalResponse = await this.processTerminalPayment(
            amountKopeks,
            store.VAT_excise_merchant!,
          );
        } catch (vatErr) {
          // noVAT already completed — return partial success, not a full error
          if (hasNoVat) {
            return {
              status: 'part-success',
              fiscalResponse,
              error: {
                target: 'vatProducts',
                description: vatErr instanceof Error ? vatErr.message : String(vatErr),
              },
            };
          }
          throw vatErr;
        }

        fiscalResponse.fiscalWithVAT = await this.processPostPayment(
          vatProducts,
          terminalResponse,
          true,
        );
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'PAYMENT_CANCELLED') {
        return { status: 'cancelled' };
      }
      throw err;
    } finally {
      this.saleInProgress = false;
    }

    return { status: 'success', fiscalResponse };
  }

  async cancelSale(): Promise<{ message: string }> {
    if (!this.saleInProgress) {
      return { message: 'No active sale' };
    }
    await this.terminalService.cancelPayment();
    return { message: 'Interrupt sent to terminal' };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Splits products into noVAT and VAT groups, assigns taxGroup per product.
   * Mirrors addProductTaxGroup.js exactly. internalCheckId is shared across both groups.
   */
  private splitByTaxGroup(
    products: CartProductDto[],
    store: StoreConfig,
    internalCheckId: string,
  ): { noVatProducts: EnrichedProduct[]; vatProducts: EnrichedProduct[] } {
    const noVatProducts: EnrichedProduct[] = [];
    const vatProducts: EnrichedProduct[] = [];

    for (const p of products) {
      const base: Omit<EnrichedProduct, 'taxGroup'> = {
        id: p.id,
        product_code: p.product_code,
        barcode: p.barcode,
        mark: p.mark,
        product_name: p.product_name,
        inCartQuantity: p.inCartQuantity,
        product_price: p.product_price,
        priceDecrement: p.priceDecrement,
        product_lot: p.product_lot,
        sale_id: p.sale_id,
        internalCheckId,
      };

      if (p.merchant === 'both') {
        if (p.is_VAT_Excise && p.excise_product) {
          vatProducts.push({ ...base, taxGroup: store.VAT_excise_taxgrp ?? 0 });
        } else if (p.is_VAT_Excise && !p.excise_product) {
          vatProducts.push({ ...base, taxGroup: store.VAT_merchant_taxgrp ?? 0 });
        } else {
          noVatProducts.push({ ...base, taxGroup: store.default_merchant_taxgrp ?? 0 });
        }
      } else if (p.merchant === 'VAT') {
        vatProducts.push({
          ...base,
          taxGroup: p.excise_product
            ? (store.VAT_excise_taxgrp ?? 0)
            : (store.VAT_merchant_taxgrp ?? 0),
        });
      } else {
        // "noVAT" or undefined → goes to default_merchant
        noVatProducts.push({ ...base, taxGroup: store.default_merchant_taxgrp ?? 0 });
      }
    }

    return { noVatProducts, vatProducts };
  }

  /** Total amount in kopeks for a product group (price × qty − discount × qty, rounded). */
  private calculateAmountKopeks(products: EnrichedProduct[]): number {
    const total = products.reduce((sum, p) => {
      return sum + p.product_price * p.inCartQuantity - p.priceDecrement * p.inCartQuantity;
    }, 0);
    return Math.round(parseFloat(total.toFixed(2)) * 100);
  }

  /**
   * Creates a TerminalOperations record before sending the payment (for audit),
   * calls the terminal service, then updates the record with the result.
   * Throws on any terminal error — caller decides how to handle it.
   */
  private async processTerminalPayment(
    amountKopeks: number,
    merchantId: string,
  ): Promise<PaymentResponse> {
    const transactionUuid = randomUUID();

    const dbOp = await this.prisma.terminalOperations.create({
      data: {
        operation_type: 'Purchase',
        amount: amountKopeks,
        merchant: merchantId,
        currency: '980',
        transaction_id: transactionUuid,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    try {
      const response = await this.terminalService.sendPayment({
        amount: amountKopeks,
        merchantId,
        currency: '980',
      });

      const params = response.params;
      await this.prisma.terminalOperations.update({
        where: { id: dbOp.id },
        data: {
          operation_date_time: this.parseTerminalDate(
            params['date'] as string | undefined,
            params['time'] as string | undefined,
          ),
          rrn: (params['rrn'] as string | null) ?? null,
          card_pan: (params['pan'] as string | null) ?? null,
          response_code: (params['responseCode'] as string | null) ?? null,
          updated_at: new Date(),
        },
      });

      return response;
    } catch (err) {
      await this.prisma.terminalOperations.update({
        where: { id: dbOp.id },
        data: {
          error_message: err instanceof Error ? err.message : String(err),
          updated_at: new Date(),
        },
      });
      throw err;
    }
  }

  /**
   * After a successful terminal payment:
   * 1. Saves RemoveProducts rows (fiscal fields null until the queue fills them)
   * 2. Decrements stock (Products + LoadProducts) in a transaction
   * 3. Enqueues fiscal receipt — processed asynchronously in chronological order
   */
  private async processPostPayment(
    products: EnrichedProduct[],
    terminalResponse: PaymentResponse,
    withVat: boolean,
  ): Promise<PostPaymentResult> {
    const params = terminalResponse.params;

    const fiscalPayload = this.receiptBuilder.build(
      { cartProducts: products },
      terminalResponse,
      withVat,
    );

    const removeDate =
      this.parseTerminalDate(
        params['date'] as string | undefined,
        params['time'] as string | undefined,
      ) ?? new Date();

    const removeIds: number[] = [];
    for (const p of products) {
      const created = await this.prisma.removeProducts.create({
        data: {
          product_id: p.id,
          remove_date: removeDate,
          remove_quantity: p.inCartQuantity,
          remove_type_id: 1,
          remove_cost: parseFloat((p.product_price * p.inCartQuantity).toFixed(2)),
          load_id: p.product_lot,
          method: terminalResponse.method,
          amount: parseFloat(params['amount'] as string),
          approvalCode: (params['approvalCode'] as string | null) ?? null,
          date: (params['date'] as string | null) ?? null,
          time: (params['time'] as string | null) ?? null,
          discount: parseFloat((p.priceDecrement * p.inCartQuantity).toFixed(2)),
          pan: (params['pan'] as string | null) ?? null,
          responseCode: (params['responseCode'] as string | null) ?? null,
          rrn: (params['rrn'] as string | null) ?? null,
          rrnExt: (params['rrnExt'] as string | null) ?? null,
          bankAcquirer: (params['bankAcquirer'] as string | null) ?? null,
          paymentSystem: (params['paymentSystem'] as string | null) ?? null,
          subMerchant: (params['subMerchant'] as string | null) ?? null,
          product_sale_id: p.sale_id ?? null,
          internal_store_check_id: p.internalCheckId,
        },
      });
      removeIds.push(created.id);
    }

    await this.updateStock(products);
    await this.fiscalService.enqueue(fiscalPayload, removeIds);

    this.logger.log(
      `Saved ${products.length} products (withVat=${withVat}), removeIds=[${removeIds.join(', ')}]`,
    );

    return { status: 'enqueued', removeProductIds: removeIds };
  }

  private async updateStock(products: EnrichedProduct[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const p of products) {
        await tx.products.update({
          where: { id: p.id },
          data: { product_left: { decrement: p.inCartQuantity } },
        });
        if (p.product_lot) {
          await tx.loadProducts.update({
            where: { id: p.product_lot },
            data: { products_left: { decrement: p.inCartQuantity } },
          });
        }
      }
    });
  }

  /** Converts terminal "DD/MM/YYYY" + "HH:mm:ss" into a JS Date. */
  private parseTerminalDate(date: string | undefined, time: string | undefined): Date | null {
    if (!date) return null;
    const parts = date.replace(/\./g, '/').split('/').map(Number);
    if (parts.length !== 3) return null;
    const [d, m, y] = parts;
    const [h = 0, min = 0, s = 0] = (time ?? '00:00:00').split(':').map(Number);
    const dt = new Date(y, m - 1, d, h, min, s);
    return isNaN(dt.getTime()) ? null : dt;
  }
}
