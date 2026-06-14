export interface LoadLot {
  id: number;
  product_id: number | null;
  load_date: Date | null;
  load_quantity: unknown;
  lotIsActive: boolean | null;
  products_left: number | null;
  sale_id: number | null;
  child_product_barcode: string | null;
  load_date_time: Date | null;
}

export interface ModifiedLot extends LoadLot {
  originalProductsLeft: number;
  decrementAmount: number;
  withdrawQuantity: number;
}

export function updateProductLoadLots(
  withdrawProduct: { decrement: number | 'all' | 'inventarization'; limit?: string },
  loadLots: LoadLot[],
): ModifiedLot[] {
  if (withdrawProduct.decrement === 'inventarization') {
    return clearAllLots(loadLots);
  }
  if (withdrawProduct.decrement === 'all' && withdrawProduct.limit === '') {
    return clearAllLots(loadLots);
  }
  if (withdrawProduct.decrement === 'all' && withdrawProduct.limit === 'not-last') {
    return clearAllExceptLast(loadLots);
  }

  let remainingQuantity = parseFloat(String(withdrawProduct.decrement));
  const modifiedLots: ModifiedLot[] = [];

  for (const lot of loadLots) {
    if (remainingQuantity === 0) break;
    if (lot.products_left && lot.products_left > 0) {
      const decrementAmount = Math.min(remainingQuantity, lot.products_left);
      const originalProductsLeft = lot.products_left;
      lot.products_left -= decrementAmount;
      remainingQuantity -= decrementAmount;
      if (lot.products_left === 0) {
        lot.lotIsActive = false;
      }
      modifiedLots.push({ ...lot, originalProductsLeft, decrementAmount, withdrawQuantity: decrementAmount });
    }
  }

  return modifiedLots;
}

function clearAllLots(lots: LoadLot[]): ModifiedLot[] {
  if (!Array.isArray(lots) || lots.length === 0) return [];
  return lots.map((lot) => ({
    ...lot,
    originalProductsLeft: lot.products_left ?? 0,
    decrementAmount: lot.products_left ?? 0,
    products_left: 0,
    lotIsActive: false,
    withdrawQuantity: lot.products_left ?? 0,
  }));
}

function clearAllExceptLast(lots: LoadLot[]): ModifiedLot[] {
  if (!Array.isArray(lots) || lots.length < 1) return [];
  return lots.slice(0, -1).map((lot) => ({
    ...lot,
    originalProductsLeft: lot.products_left ?? 0,
    decrementAmount: lot.products_left ?? 0,
    products_left: 0,
    lotIsActive: false,
    withdrawQuantity: lot.products_left ?? 0,
  }));
}
