import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CartLineInput, PriceableProduct, PricedCartLine, UnitPricing } from './pricing.types';

// The single source of truth for акції/знижки pricing — used by product listing
// (GET /api/products, /search, /single, combo detail) and by the cart (quote +
// final sell). Nothing here trusts a price or discount supplied by the client;
// everything is derived from the DB on every call.
//
// sale_id meaning (Sales dictionary, sale_custom_id):
//   0  no promotion
//   1  скоропорт, не повертається — tiered by days-to-expiry (product-level)
//   2  скоропорт, повертається — same tiering as 1
//   3  новинка — flat discount (product-level)
//   4  довго не продається — flat discount (product-level)
//   6  товар дня — flat discount (product-level)
//   7  комбо — flat discount, but only when bought together with its combo pair (cart-level)
//   8  дубль — flat discount on every 2nd unit of the SAME product (cart-level, quantity-dependent)
//   9  "акція дня" (категорія/підкатегорія) — flat discount (product-level, sale_id already set on
//      matching products by IdleSyncService when the category-wide sale is applied)
//   10 мінімальний чек — flat discount on lines that otherwise have NO discount, once the cart
//      subtotal reaches Sales.threshold_amount for this row (cart-level)
const TIERED_BY_EXPIRY = new Set([1, 2]);
const FLAT_PRODUCT_LEVEL = new Set([3, 4, 6, 9]);
const DUP_SALE_ID = 8;
const THRESHOLD_SALE_ID = 10;

const PRODUCT_PRICING_INCLUDE = {
  Sales: true,
  Categories: { select: { category_discount: true } },
  Subcategories: { select: { subcategory_discount: true } },
  LoadProducts_Products_product_lotToLoadProducts: { select: { id: true, load_date: true } },
  ComboProducts_Products_combo_idToComboProducts: {
    select: {
      child_product_id: true,
      Products_ComboProducts_child_product_idToProducts: { select: { id: true, product_left: true } },
    },
  },
} as const;

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Prisma `include` fragment callers should attach to their own `products.findMany`/`findFirst`
   * so `priceProduct()` has everything it needs without a second query per product. */
  static readonly INCLUDE = PRODUCT_PRICING_INCLUDE;

  private num(v: unknown, fallback = 0): number {
    if (v === null || v === undefined) return fallback;
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isNaN(n) ? fallback : n;
  }

  private daysLeft(product: PriceableProduct): number | null {
    const lot = product.LoadProducts_Products_product_lotToLoadProducts;
    if (!lot?.load_date) return null;
    const expiresAt = new Date(lot.load_date);
    expiresAt.setDate(expiresAt.getDate() + (product.exposition_term ?? 0));
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.floor((expiresAt.getTime() - Date.now()) / msPerDay);
  }

  /**
   * Per-product discount — everything that does NOT depend on the rest of the cart
   * (i.e. all types except 8 "дубль" and 10 "мінімальний чек", and excluding the
   * combo (7) pair discount itself, which only applies when bought with its pair —
   * see `applyComboAndDup`). This is what product listings show.
   *
   * Two different notions of "sale_id" are in play here, and they must NOT be
   * conflated (this bit the old frontend implementation):
   *  - `assignedSaleId` — is this product officially in some promotion's lifecycle at
   *    all? Used ONLY to decide whether category/subcategory fallback may apply.
   *    A type-1 product outside its discount window (>3 days to expiry) still counts
   *    as "assigned" here — it must NOT opportunistically fall back to a category discount.
   *  - the returned `saleId`/badge — is there something to actually SHOW the customer
   *    right now? A type-1 product outside its window, or a combo whose pair ran out
   *    of stock, has `assignedSaleId != 0` but shows NO badge at all (saleId=0 in the
   *    result), matching the old `shouldShowMarker` gating exactly.
   */
  priceProduct(product: PriceableProduct): UnitPricing {
    const basePrice = this.num(product.product_price);
    const sales = product.Sales;
    const rawSaleId = product.sale_id ?? 0;
    // A disabled promotion type behaves as if the product had no sale_id at all —
    // category/subcategory fallback below still applies.
    const assignedSaleId = sales?.is_active ? rawSaleId : 0;

    let fraction = 0;
    // Comboи (7) and dup (8) are always "eligible to show" once assigned — their
    // fraction is legitimately 0 here (7 has no listing-level discount, 8 is
    // quantity-dependent and priced at cart level) but the badge must still appear.
    let eligibleNow = assignedSaleId === 7 || assignedSaleId === 8;

    if (assignedSaleId !== 0 && sales) {
      if (TIERED_BY_EXPIRY.has(assignedSaleId)) {
        const left = this.daysLeft(product);
        if (left === 3) fraction = this.num(sales.sale_discount_1);
        else if (left === 2) fraction = this.num(sales.sale_discount_2);
        else if (left !== null && left < 2) fraction = this.num(sales.sale_discount_3);
        // left > 3 (or unknown): not in the discount window yet — no badge either.
        eligibleNow = fraction > 0;
      } else if (FLAT_PRODUCT_LEVEL.has(assignedSaleId)) {
        fraction = this.num(sales.sale_discount_1);
        eligibleNow = true;
      } else if (assignedSaleId === 7) {
        // Combo badge only while its pair is actually purchasable — mirrors the
        // sale_id reset store.service.ts already does on product add/update, but
        // checked live here too in case the child sold out since then.
        const child = product.ComboProducts_Products_combo_idToComboProducts
          ?.Products_ComboProducts_child_product_idToProducts;
        eligibleNow = !!child && this.num(child.product_left) > 0;
      }
    }

    if (eligibleNow) {
      return this.build(basePrice, fraction, rawSaleId, sales!.sale_name, 'product');
    }

    // No product-level discount applied — fall back to category/subcategory, but
    // ONLY when the product genuinely has no promotion code of its own (a type
    // outside its window, or a dead combo, still counts as "assigned" — no fallback).
    if (assignedSaleId === 0) {
      const subFraction = this.num(product.Subcategories?.subcategory_discount, 0);
      if (subFraction > 0) {
        return this.build(basePrice, subFraction, 0, 'Знижка підкатегорії', 'subcategory');
      }
      const catFraction = this.num(product.Categories?.category_discount, 0);
      if (catFraction > 0) {
        return this.build(basePrice, catFraction, 0, 'Знижка категорії', 'category');
      }
    }

    return this.build(basePrice, 0, 0, null, 'none');
  }

  private build(
    basePrice: number,
    fraction: number,
    saleId: number,
    saleName: string | null,
    source: UnitPricing['source'],
  ): UnitPricing {
    const priceAfterDiscount = fraction > 0 ? parseFloat((basePrice * (1 - fraction)).toFixed(2)) : basePrice;
    return {
      basePrice,
      discountFraction: fraction,
      priceAfterDiscount,
      priceDecrement: parseFloat((basePrice - priceAfterDiscount).toFixed(2)),
      saleId,
      saleName,
      hasLowerPrice: fraction > 0,
      source,
    };
  }

  /**
   * Combo (7) pair pricing for the dedicated combo screen — both sides of the pair get
   * the SAME discount (the parent's Sales.sale_discount_1), mirroring the old frontend
   * `comboPriceCounter`. Returns null if the pair is not (or no longer) valid — the
   * caller should treat that as "no combo available" (same as store.service already
   * resetting sale_id to 0 when the child runs out).
   */
  priceCombo(parent: PriceableProduct): { parent: UnitPricing; child: UnitPricing; childProductId: number } | null {
    const pair = parent.ComboProducts_Products_combo_idToComboProducts;
    const child = pair?.Products_ComboProducts_child_product_idToProducts;
    if (!pair || !child || this.num(child.product_left) <= 0 || !parent.Sales) return null;

    const fraction = this.num(parent.Sales.sale_discount_1);
    const parentPricing = this.build(this.num(parent.product_price), fraction, 7, parent.Sales.sale_name, 'product');
    const childPricing = this.build(this.num((child as { product_price?: unknown }).product_price), fraction, 7, parent.Sales.sale_name, 'product');
    return { parent: parentPricing, child: childPricing, childProductId: child.id };
  }

  /**
   * Cart-level pricing — the authoritative source for `POST /api/cart/price` (live quote)
   * and `POST /api/cart/sell` (final charge). Re-fetches every product fresh by barcode;
   * nothing about price or discount is taken from the caller.
   */
  async priceCart(lines: CartLineInput[]): Promise<PricedCartLine[]> {
    if (!lines.length) return [];

    const products = await this.prisma.products.findMany({
      where: { barcode: { in: lines.map((l) => l.barcode) } },
      include: PRODUCT_PRICING_INCLUDE,
    });
    const byBarcode = new Map(products.map((p) => [p.barcode as string, p as unknown as PriceableProduct]));

    const missing = lines.filter((l) => !byBarcode.has(l.barcode));
    if (missing.length) {
      throw new NotFoundException(
        `Product(s) not found: ${missing.map((l) => l.barcode).join(', ')}`,
      );
    }

    // Step 1: static per-product pricing for every line.
    const priced: PricedCartLine[] = lines.map((line) => {
      const product = byBarcode.get(line.barcode)!;
      const unit = this.priceProduct(product);
      return {
        ...unit,
        barcode: line.barcode,
        productId: product.id,
        productLot: product.LoadProducts_Products_product_lotToLoadProducts?.id ?? null,
        quantity: line.quantity,
        lineTotal: parseFloat((unit.priceAfterDiscount * line.quantity).toFixed(2)),
      };
    });

    this.applyDupDiscount(priced, byBarcode);
    this.applyComboDiscount(priced, byBarcode);
    await this.applyThresholdDiscount(priced);

    return priced;
  }

  /** sale_id = 8: every 2nd unit of the same product gets sale_discount_1 off. Blended into
   * a single per-unit discountFraction so downstream `priceDecrement * quantity` stays correct. */
  private applyDupDiscount(lines: PricedCartLine[], byBarcode: Map<string, PriceableProduct>): void {
    for (const line of lines) {
      const product = byBarcode.get(line.barcode)!;
      const saleId = product.Sales?.is_active ? (product.sale_id ?? 0) : 0;
      if (saleId !== DUP_SALE_ID || line.quantity < 2) continue;

      const fraction = this.num(product.Sales!.sale_discount_1);
      const discountedUnits = Math.floor(line.quantity / 2);
      const avgFraction = (fraction * discountedUnits) / line.quantity;
      const priceAfterDiscount = parseFloat((line.basePrice * (1 - avgFraction)).toFixed(2));

      line.discountFraction = avgFraction;
      line.priceAfterDiscount = priceAfterDiscount;
      line.priceDecrement = parseFloat((line.basePrice - priceAfterDiscount).toFixed(2));
      line.saleId = DUP_SALE_ID;
      line.saleName = product.Sales!.sale_name;
      line.hasLowerPrice = true;
      line.source = 'product';
      line.lineTotal = parseFloat((priceAfterDiscount * line.quantity).toFixed(2));
    }
  }

  /** sale_id = 7: only pays out when its paired product is ALSO in the cart. Discounts
   * apply to min(parentQty, childQty) units on each side; any surplus stays full price. */
  private applyComboDiscount(lines: PricedCartLine[], byBarcode: Map<string, PriceableProduct>): void {
    const lineByProductId = new Map(lines.map((l) => [l.productId, l]));

    for (const line of lines) {
      const product = byBarcode.get(line.barcode)!;
      const saleId = product.Sales?.is_active ? (product.sale_id ?? 0) : 0;
      if (saleId !== 7) continue;

      const combo = this.priceCombo(product);
      if (!combo) continue;
      const childLine = lineByProductId.get(combo.childProductId);
      if (!childLine) continue; // pair not in the cart — no discount, matches "must buy together"

      const pairedUnits = Math.min(line.quantity, childLine.quantity);
      this.applyPartialDiscount(line, combo.parent, pairedUnits, 7, product.Sales!.sale_name);
      this.applyPartialDiscount(childLine, combo.child, pairedUnits, 7, product.Sales!.sale_name);
    }
  }

  /** Blends a per-unit discount across only `discountedUnits` of a line's quantity. */
  private applyPartialDiscount(
    line: PricedCartLine,
    unitPricing: UnitPricing,
    discountedUnits: number,
    saleId: number,
    saleName: string,
  ): void {
    if (discountedUnits <= 0) return;
    const avgFraction = (unitPricing.discountFraction * discountedUnits) / line.quantity;
    const priceAfterDiscount = parseFloat((line.basePrice * (1 - avgFraction)).toFixed(2));

    line.discountFraction = avgFraction;
    line.priceAfterDiscount = priceAfterDiscount;
    line.priceDecrement = parseFloat((line.basePrice - priceAfterDiscount).toFixed(2));
    line.saleId = saleId;
    line.saleName = saleName;
    line.hasLowerPrice = true;
    line.source = 'product';
    line.lineTotal = parseFloat((priceAfterDiscount * line.quantity).toFixed(2));
  }

  /** sale_id = 10: once the cart subtotal (after all discounts above) reaches
   * Sales.threshold_amount, lines that still have NO discount at all ("не перебувають
   * в акції") get an extra sale_discount_1 off. Eligibility is decided on the subtotal
   * BEFORE this bonus, so the bonus itself can never push the cart over the threshold. */
  private async applyThresholdDiscount(lines: PricedCartLine[]): Promise<void> {
    const thresholdSale = await this.prisma.sales.findUnique({ where: { sale_custom_id: THRESHOLD_SALE_ID } });
    if (!thresholdSale?.is_active) return;

    const threshold = this.num(thresholdSale.threshold_amount, Infinity);
    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    if (subtotal < threshold) return;

    const fraction = this.num(thresholdSale.sale_discount_1);
    for (const line of lines) {
      if (line.source !== 'none') continue; // already discounted some other way — skip
      const priceAfterDiscount = parseFloat((line.basePrice * (1 - fraction)).toFixed(2));
      line.discountFraction = fraction;
      line.priceAfterDiscount = priceAfterDiscount;
      line.priceDecrement = parseFloat((line.basePrice - priceAfterDiscount).toFixed(2));
      line.saleId = THRESHOLD_SALE_ID;
      line.saleName = thresholdSale.sale_name;
      line.hasLowerPrice = true;
      line.source = 'threshold';
      line.lineTotal = parseFloat((priceAfterDiscount * line.quantity).toFixed(2));
    }
  }
}
