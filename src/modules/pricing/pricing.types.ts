/** Result of pricing one unit of a product — the authoritative discount, never the client's. */
export interface UnitPricing {
  basePrice: number;
  discountFraction: number; // 0..1, blended if quantity-dependent (e.g. sale_id 8)
  priceAfterDiscount: number;
  priceDecrement: number; // basePrice - priceAfterDiscount, per unit
  saleId: number;
  saleName: string | null;
  hasLowerPrice: boolean;
  /** Where the discount came from — category/subcategory only apply when saleId is effectively 0. */
  source: 'product' | 'category' | 'subcategory' | 'threshold' | 'none';
}

/** One priced line in a cart (a product + quantity), after cart-level rules (dup, combo, threshold). */
export interface PricedCartLine extends UnitPricing {
  barcode: string;
  productId: number;
  productLot: number | null;
  quantity: number;
  lineTotal: number; // priceAfterDiscount * quantity, rounded to kopeck-safe 2dp
}

export interface CartLineInput {
  barcode: string;
  quantity: number;
}

/** Minimal shape PricingService needs from a Products row — matches the Prisma `include` used
 * in store.service.ts / pricing.service.ts. Kept separate from the generated Prisma type so
 * callers can pass partial/select-shaped results without fighting Prisma's generic types. */
export interface PriceableProduct {
  id: number;
  product_price: unknown; // Prisma.Decimal | number | string | null
  sale_id: number | null;
  combo_id: number | null;
  product_category: number | null;
  product_subcategory: number | null;
  exposition_term: number | null;
  Sales: {
    sale_custom_id: number | null;
    sale_name: string;
    sale_discount_1: unknown;
    sale_discount_2: unknown;
    sale_discount_3: unknown;
    is_active: boolean;
  } | null;
  Categories: { category_discount: unknown } | null;
  Subcategories: { subcategory_discount: unknown } | null;
  LoadProducts_Products_product_lotToLoadProducts: { id: number; load_date: Date | null } | null;
  ComboProducts_Products_combo_idToComboProducts: {
    child_product_id: number;
    Products_ComboProducts_child_product_idToProducts: { id: number; product_left: unknown } | null;
  } | null;
}
