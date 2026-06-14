import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { Store } from '@prisma/client';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { AddProductDto } from './dto/add-products.dto';
import { WithdrawProductDto } from './dto/withdraw-products.dto';
import { UpdateProductDto, ALLOWED_UPDATE_KEYS } from './dto/update-products.dto';
import { SaveImageDto } from './dto/save-image.dto';
import { PRODUCT_UPDATED_EVENT, IMAGE_EXTENSIONS } from './constants';
import { updateProductLoadLots } from './utils/product-load-lots.util';
import { IdleSyncService } from '../kiosk/idle-sync.service';

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);
  private readonly imagesDir: string;
  private readonly mmHost: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly events: EventEmitter2,
    private readonly idleSync: IdleSyncService,
  ) {
    this.imagesDir = this.config.get<string>('images.dir') ?? 'C:/mm-images';
    this.mmHost = this.config.get<string>('store.host') ?? 'http://localhost:6006';

    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }
  }

  // ─── GET /api/products ─────────────────────────────────────────────────────

  async getAllStoreProducts(store: Store, query: GetProductsQueryDto) {
    const { filter, subcategory, division = '0' } = query;
    const useDivisionFilter = parseInt(division) !== 0;
    const getNewProducts = filter === '9999';
    const categoryFilter = getNewProducts ? 0 : parseInt(filter ?? '0') || 0;

    let subcategoryFilter: number[] = [];
    if (typeof subcategory === 'string') {
      subcategoryFilter = subcategory.split(',').map(Number);
    } else if (Array.isArray(subcategory)) {
      subcategoryFilter = (subcategory as string[]).map(Number);
    }

    let useSubcategoryFilter = false;
    if (subcategoryFilter.length > 0 && !(subcategoryFilter.length === 1 && subcategoryFilter[0] === 0)) {
      useSubcategoryFilter = true;
    }

    // Hide VAT/excise products entirely when the store has only one merchant
    const vatExcludeFilter =
      store.is_single_merchant && !store.use_VAT_by_default
        ? { OR: [{ is_VAT_Excise: { not: true } }, { is_VAT_Excise: null }] }
        : {};

    const baseWhere: Record<string, unknown> = {
      product_left: { not: null, gt: 0 },
      ...vatExcludeFilter,
      ...(getNewProducts && { is_new_product: true }),
      ...(useDivisionFilter && { product_division: { equals: parseInt(division) } }),
      ...(categoryFilter !== 0 && { product_category: categoryFilter }),
      ...(useSubcategoryFilter && { product_subcategory: { in: subcategoryFilter } }),
    };

    const filteredProducts = await this.prisma.products.findMany({
      where: baseWhere as never,
      include: {
        Categories: true,
        Subcategories: true,
        Sales: true,
        LoadProducts_LoadProducts_product_idToProducts: { select: { load_date: true } },
        Subcategories_Products_cat_subcat_idToSubcategories: {
          include: { Categories_Subcategories_category_ref_1CToCategories: true },
        },
        ComboProducts_Products_combo_idToComboProducts: {
          include: {
            Products_ComboProducts_child_product_idToProducts: { select: { product_left: true } },
          },
        },
        ProductsDivisions: true,
      },
    });

    if (!filteredProducts.length) {
      return { message: 'No products found for the provided filters.', status: 'none' };
    }

    const productsCount = await this.prisma.products.count({ where: baseWhere as never });

    const distinctSubcategories = await this.prisma.products.findMany({
      where: baseWhere as never,
      select: { product_subcategory: true, Subcategories: true },
      distinct: ['product_subcategory'],
    });

    let distinctCategories: unknown[] = [];
    if (!useSubcategoryFilter) {
      const rawCategories = await this.prisma.products.findMany({
        where: {
          product_left: { not: null, gt: 0 },
          ...vatExcludeFilter,
          ...(categoryFilter !== 0 && { product_category: categoryFilter }),
        } as never,
        select: { product_category: true, Categories: true },
        distinct: ['product_category'],
      });

      distinctCategories = await Promise.all(
        rawCategories.map(async (cat) => {
          const divisionData = await this.prisma.products.findMany({
            where: { product_category: cat.product_category ?? undefined } as never,
            select: {
              product_division: true,
              ProductsDivisions: { select: { division_custom_id: true, division_name: true } },
            },
            distinct: ['product_division'],
          });
          return { ...cat, divisionData };
        }),
      );
    }

    const hasNewProducts = filteredProducts.some((p) => p.sale_id === 4);

    return {
      status: 'ok',
      products: filteredProducts,
      totalProducts: productsCount,
      subcategories: distinctSubcategories,
      categories: categoryFilter !== 0 ? [] : distinctCategories,
      hasNewProducts,
    };
  }

  // ─── GET /api/products/search ──────────────────────────────────────────────

  async searchProducts(store: Store, searchQuery: string) {
    if (!searchQuery || searchQuery.length < 3) {
      return { searchResults: [] };
    }
    const vatExcludeFilter =
      store.is_single_merchant && !store.use_VAT_by_default
        ? { OR: [{ is_VAT_Excise: { not: true } }, { is_VAT_Excise: null }] }
        : {};
    const searchResults = await this.prisma.products.findMany({
      where: {
        AND: [
          { product_name: { contains: searchQuery } },
          { product_left: { not: null, gt: 0 } },
          ...(Object.keys(vatExcludeFilter).length ? [vatExcludeFilter] : []),
        ],
      } as never,
    });
    return { searchResults };
  }

  // ─── GET /api/products/product ─────────────────────────────────────────────

  async getProductById(comboId: number) {
    const comboProduct = await this.prisma.comboProducts.findUnique({
      where: { combo_id: comboId },
      include: { Products_ComboProducts_child_product_idToProducts: true },
    });
    if (!comboProduct) {
      return { message: 'No child product found' };
    }
    return { childProduct: comboProduct.Products_ComboProducts_child_product_idToProducts };
  }

  // ─── GET /api/products/single ──────────────────────────────────────────────

  async getSingleProduct(store: Store, barcode: string) {
    const vatExcludeFilter =
      store.is_single_merchant && !store.use_VAT_by_default
        ? { OR: [{ is_VAT_Excise: { not: true } }, { is_VAT_Excise: null }] }
        : {};
    const product = await this.prisma.products.findFirst({
      where: {
        OR: [
          { barcode },
          {
            AdditionalBarcodes_Products_additional_barcodesToAdditionalBarcodes: {
              OR: [
                { additional_barcode_1: barcode },
                { additional_barcode_2: barcode },
                { additional_barcode_3: barcode },
                { additional_barcode_4: barcode },
                { additional_barcode_5: barcode },
              ],
            },
          },
        ],
        product_left: { not: null, gt: 0 },
        ...vatExcludeFilter,
      } as never,
      include: {
        AdditionalBarcodes_Products_additional_barcodesToAdditionalBarcodes: true,
      },
    });

    if (!product) {
      return { message: 'No such product found', errStatus: 404 };
    }
    return { product };
  }

  // ─── POST /api/products/add ────────────────────────────────────────────────

  async addProducts(rawProducts: AddProductDto[]) {
    const now = new Date();
    const loadDateTimeStr = now.toISOString().replace('Z', '+00:00');

    // ── Required fields validation ─────────────────────────────────────────────
    const ALWAYS_REQUIRED: (keyof AddProductDto)[] = [
      'product_name', 'product_code', 'barcode', 'measure',
      'product_name_ua', 'product_category', 'product_subcategory',
      'product_left', 'product_price', 'exposition_term', 'sale_id',
    ];

    const missingFieldsProducts: { product: AddProductDto; missingFields: string[] }[] = [];
    const productsToProcess: AddProductDto[] = [];

    for (const p of rawProducts) {
      const missing: string[] = ALWAYS_REQUIRED.filter(
        (field) => p[field] === undefined || p[field] === null || p[field] === '',
      );
      if (Number(p.sale_id) === 7 && !p.child_product_barcode) {
        missing.push('child_product_barcode');
      }
      if (missing.length) {
        missingFieldsProducts.push({ product: p, missingFields: missing });
      } else {
        productsToProcess.push(p);
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    const normalizedProducts: AddProductDto[] = [];
    const abNormalProducts: AddProductDto[] = [];

    for (const p of productsToProcess) {
      const productCategory = parseInt(String(p.product_category));
      const productSubcategory = parseInt(String(p.product_subcategory));
      const productLeft = parseFloat(String(p.product_left));
      const productPrice = parseFloat(String(p.product_price));
      const saleId = parseInt(String(p.sale_id));
      const expositionTerm = parseInt(String(p.exposition_term ?? 0)) || 0;

      if (isNaN(productCategory) || isNaN(productSubcategory) || isNaN(productLeft) || isNaN(productPrice) || isNaN(saleId)) {
        abNormalProducts.push(p);
        continue;
      }
      normalizedProducts.push({
        ...p,
        product_category: productCategory,
        product_subcategory: productSubcategory,
        product_left: productLeft,
        product_price: productPrice,
        exposition_term: expositionTerm,
        sale_id: saleId,
        product_code: String(p.product_code).replace(/\s/g, ''),
      });
    }

    const validProducts: (AddProductDto & { catSubcatId: { id: number } })[] = [];
    const invalidProducts: AddProductDto[] = [];

    for (const p of normalizedProducts) {
      const catId = Number(p.product_category);
      const subcatId = Number(p.product_subcategory);
      const catSubcatId = await this.prisma.subcategories.findFirst({
        where: { AND: [{ subcat_1C_id: subcatId }, { category_ref_1C: catId }] },
      });
      if (catSubcatId) {
        validProducts.push({ ...p, catSubcatId: { id: catSubcatId.id } });
      } else {
        invalidProducts.push(p);
      }
    }

    // ── DB constraint validation ───────────────────────────────────────────────
    const dbConflicts: { product: AddProductDto; reason: string }[] = [];
    const queueReady: (AddProductDto & { catSubcatId: { id: number } })[] = [];

    const incomingBarcodes = validProducts.map((p) => String(p.barcode));
    const incomingCodes = validProducts
      .map((p) => (p.product_code ? String(p.product_code) : null))
      .filter((c): c is string => !!c);

    const [existingByBarcode, existingByCode] = await Promise.all([
      this.prisma.products.findMany({
        where: { barcode: { in: incomingBarcodes } },
        select: { barcode: true, product_code: true },
      }),
      incomingCodes.length
        ? this.prisma.products.findMany({
            where: { product_code: { in: incomingCodes } },
            select: { barcode: true, product_code: true },
          })
        : Promise.resolve([]),
    ]);

    // barcode → product_code (що є в БД для цього barcode)
    const dbCodeByBarcode = new Map<string, string | null>(
      existingByBarcode.map((r) => [r.barcode, r.product_code] as [string, string | null]),
    );
    // product_code → barcode (що є в БД для цього product_code)
    const dbBarcodeByCode = new Map<string, string>(
      existingByCode.map((r) => [r.product_code!, r.barcode] as [string, string]),
    );

    for (const p of validProducts) {
      const barcode = String(p.barcode);
      const code = p.product_code ? String(p.product_code) : null;

      // barcode існує в БД з іншим product_code
      if (dbCodeByBarcode.has(barcode)) {
        const dbCode = dbCodeByBarcode.get(barcode);
        if (code && dbCode && dbCode !== code) {
          dbConflicts.push({ product: p, reason: `barcode ${barcode} вже є в БД з product_code "${dbCode}", передано "${code}"` });
          continue;
        }
      }

      // product_code існує в БД з іншим barcode
      if (code && dbBarcodeByCode.has(code)) {
        const dbBarcode = dbBarcodeByCode.get(code);
        if (dbBarcode !== barcode) {
          dbConflicts.push({ product: p, reason: `product_code "${code}" вже є в БД з barcode ${dbBarcode}` });
          continue;
        }
      }

      queueReady.push(p);
    }
    // ──────────────────────────────────────────────────────────────────────────

    for (const p of queueReady) {
      await this.idleSync.enqueueProductUpdate({
        action: 'add',
        barcode: String(p.barcode),
        catSubcatId: p.catSubcatId.id,
        product_name: p.product_name,
        product_code: p.product_code ? String(p.product_code) : undefined,
        measure: p.measure ?? undefined,
        product_name_ru: p.product_name_ru ?? undefined,
        product_name_ua: p.product_name_ua ?? undefined,
        product_description: p.product_description ?? undefined,
        product_image: p.product_image ?? undefined,
        product_price: Number(p.product_price),
        exposition_term: Number(p.exposition_term) || 0,
        sale_id: Number(p.sale_id) || 0,
        is_VAT_Excise: p.is_VAT_Excise ?? false,
        excise_product: p.excise_product ?? false,
        product_left: Number(p.product_left),
        is_new_product: p.is_new_product ?? false,
        product_category: Number(p.product_category),
        product_subcategory: Number(p.product_subcategory),
        product_division: p.product_division ? Number(p.product_division) : undefined,
      });
    }

    await this.idleSync.syncIfCurrentlyIdle();

    return {
      message: `Queued ${queueReady.length} product(s) for deferred idle sync`,
      queued: queueReady.length,
      missingFields: missingFieldsProducts,
      invalidCategory: invalidProducts,
      notAdded: `Not added ${invalidProducts.length} products due to invalid category or subcategory`,
      failedToConvert: abNormalProducts,
      constraintViolations: dbConflicts,
    };
  }


  // ─── POST /api/products/withdraw ──────────────────────────────────────────

  async withdrawProducts(products: WithdrawProductDto[]) {
    if (!products.length) {
      return { message: 'No products provided' };
    }

    const existingProducts = await this.prisma.products.findMany({
      where: { barcode: { in: products.map((p) => p.barcode) } },
    });

    if (!existingProducts.length) {
      return { message: 'No matching products found in the database' };
    }

    const now = new Date();
    const validDateTimeStr = now.toISOString().replace('Z', '+00:00');

    const proceedProducts = existingProducts.map((dbProd) => {
      const input = products.find((p) => p.barcode === dbProd.barcode)!;
      return { ...dbProd, decrement: input.quantity, limit: input.limit ?? '' };
    });

    const productsWithQuantity = proceedProducts.filter((p) => Number(p.product_left ?? 0) > 0);
    const productsNoQuantity = proceedProducts.filter((p) => !(Number(p.product_left ?? 0) > 0));
    const productsNotExist = products.filter((p) => !existingProducts.find((e) => e.barcode === p.barcode));

    if (!productsWithQuantity.length) {
      return { message: 'All provided products have zero quantity left' };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const product of productsWithQuantity) {
        const withdrawProductLots = await tx.loadProducts.findMany({
          where: { product_id: product.id, lotIsActive: true },
          orderBy: { load_date_time: 'asc' },
        });

        const lotsUpdateData = updateProductLoadLots(
          { decrement: product.decrement as number, limit: String(product.limit ?? '') },
          withdrawProductLots as never,
        );
        if (!lotsUpdateData.length) continue;

        await Promise.all(
          lotsUpdateData.map((lot) =>
            tx.loadProducts.update({
              where: { id: lot.id },
              data: {
                product_id: lot.product_id,
                load_date: lot.load_date,
                load_quantity: lot.load_quantity as never,
                lotIsActive: lot.lotIsActive ? true : false,
                products_left: lot.products_left,
                sale_id: lot.sale_id,
                child_product_barcode: lot.child_product_barcode,
                load_date_time: lot.load_date_time,
              },
            }),
          ),
        );

        await Promise.all(
          lotsUpdateData.map((lot) =>
            tx.removeProducts.create({
              data: {
                product_id: product.id,
                remove_date: new Date(validDateTimeStr),
                remove_quantity: lot.withdrawQuantity,
                remove_type_id: 3,
                isActive: false,
                load_id: lot.id ?? null,
                remove_cost: Number(product.product_price ?? 0) * lot.withdrawQuantity,
              },
            }),
          ),
        );

        if (product.combo_id) {
          await tx.products.update({ where: { id: product.id }, data: { combo_id: null } });
          await tx.comboProducts.deleteMany({ where: { main_product_id: product.id } });
        }

        const sumData = await tx.loadProducts.aggregate({
          where: { product_id: product.id, lotIsActive: true },
          _sum: { products_left: true },
        });
        const activeLots = await tx.loadProducts.findMany({
          where: { product_id: product.id, lotIsActive: true },
          orderBy: { load_date_time: 'desc' },
        });

        await tx.products.update({
          where: { id: product.id },
          data: { product_left: sumData._sum.products_left ?? 0, product_lot: activeLots[0]?.id ?? null },
        });
      }
    });

    this.events.emit(PRODUCT_UPDATED_EVENT);

    return {
      message: 'Products processed successfully',
      updated: `Processed ${productsWithQuantity.length} products`,
      notFound: `Skipped ${productsNotExist.length} products (not found)`,
      zeroQuantity: `Skipped ${productsNoQuantity.length} products (no quantity)`,
      nonExistingProducts: productsNotExist,
    };
  }

  // ─── POST /api/products/inventarization ───────────────────────────────────

  async inventarizationWithdraw() {
    const now = new Date();
    const validDateTimeStr = now.toISOString().replace('Z', '+00:00');

    const availableProducts = await this.prisma.products.findMany({
      where: { product_left: { not: null, gt: 0 } } as never,
    });

    await this.prisma.$transaction(async (tx) => {
      for (const product of availableProducts) {
        const lots = await tx.loadProducts.findMany({
          where: { product_id: product.id, lotIsActive: true },
          orderBy: { load_date_time: 'asc' },
        });

        const lotsUpdateData = updateProductLoadLots({ decrement: 'inventarization' }, lots as never);
        if (!lotsUpdateData.length) continue;

        await Promise.all(
          lotsUpdateData.map((lot) =>
            tx.loadProducts.update({
              where: { id: lot.id },
              data: { lotIsActive: false, products_left: 0, load_date_time: lot.load_date_time },
            }),
          ),
        );

        await Promise.all(
          lotsUpdateData.map((lot) =>
            tx.removeProducts.create({
              data: {
                product_id: product.id,
                remove_date: new Date(validDateTimeStr),
                remove_quantity: lot.withdrawQuantity,
                remove_type_id: 3,
                isActive: false,
                load_id: lot.id ?? null,
                remove_cost: Number(product.product_price ?? 0) * lot.withdrawQuantity,
              },
            }),
          ),
        );

        if (product.combo_id) {
          await tx.products.update({ where: { id: product.id }, data: { combo_id: null } });
          await tx.comboProducts.deleteMany({ where: { main_product_id: product.id } });
        }

        const activeLots = await tx.loadProducts.findMany({
          where: { product_id: product.id, lotIsActive: true },
          orderBy: { load_date_time: 'desc' },
        });

        await tx.products.update({
          where: { id: product.id },
          data: { product_left: 0, product_lot: activeLots[0]?.id ?? null },
        });
      }
    });

    this.events.emit(PRODUCT_UPDATED_EVENT);
    return { message: 'All products removed' };
  }

  // ─── POST /api/products/update ─────────────────────────────────────────────

  async updateProducts(rawProducts: UpdateProductDto[]) {
    const noBarcode = rawProducts.filter((p) => !p.barcode);
    if (noBarcode.length) {
      throw new BadRequestException('Barcode must be provided for each product');
    }

    const existingProductsList = await this.prisma.products.findMany({
      where: { barcode: { in: rawProducts.map((p) => p.barcode) } },
      select: { barcode: true, cat_subcat_id: true },
    });
    const existingProductsMap = new Map(existingProductsList.map((p) => [p.barcode, p]));

    const approved: unknown[] = [];
    const rejected: unknown[] = [];

    for (const raw of rawProducts) {
      const { barcode, ...rest } = raw;
      const forbiddenKeys = Object.keys(rest).filter((k) => !ALLOWED_UPDATE_KEYS.includes(k as never));
      if (forbiddenKeys.length) {
        rejected.push({ barcode, reason: `Forbidden keys: ${forbiddenKeys.join(', ')}` });
        continue;
      }

      const parsed = this.parseProductData(rest);

      let catSubcatId: number | undefined;

      if (parsed.product_category !== undefined || parsed.product_subcategory !== undefined) {
        const catSubcat = await this.prisma.subcategories.findFirst({
          where: {
            AND: [
              { subcat_1C_id: (parsed.product_subcategory as number) ?? 0 },
              { category_ref_1C: (parsed.product_category as number) ?? 0 },
            ],
          },
        });
        if (!catSubcat) {
          rejected.push({ barcode, reason: `Category ${parsed.product_category} + subcategory ${parsed.product_subcategory} not found` });
          continue;
        }
        catSubcatId = catSubcat.id;
      }

      if (parsed.product_division !== undefined) {
        const div = await this.prisma.productsDivisions.findUnique({ where: { division_custom_id: parsed.product_division as number } });
        if (!div) parsed.product_division = 0;
      }

      if (!existingProductsMap.has(barcode)) {
        if (parsed.product_category === undefined || parsed.product_subcategory === undefined) {
          rejected.push({ barcode, reason: 'New product requires product_category and product_subcategory' });
          continue;
        }
        if (!parsed.product_image) {
          parsed.product_image = await this.resolveImageUrl(barcode);
        }
      }

      const toStr = (v: unknown): string | undefined => (v !== undefined && v !== null ? String(v) : undefined);
      const toNum = (v: unknown): number | undefined => (v !== undefined && v !== null ? Number(v) : undefined);
      const toBool = (v: unknown): boolean | undefined => (v !== undefined && v !== null ? Boolean(v) : undefined);

      const existingCatSubcatId = existingProductsMap.get(barcode)?.cat_subcat_id ?? 0;

      await this.prisma.productUpdateQueue.create({
        data: {
          action: 'update',
          barcode,
          cat_subcat_id: catSubcatId ?? existingCatSubcatId,
          product_name: toStr(parsed.product_name),
          product_code: toStr(parsed.product_code),
          measure: toStr(parsed.measure),
          product_name_ru: toStr(parsed.product_name_ru),
          product_name_ua: toStr(parsed.product_name_ua),
          product_description: toStr(parsed.product_description),
          product_image: toStr(parsed.product_image),
          product_price: toNum(parsed.product_price),
          product_discount: toNum(parsed.product_discount),
          exposition_term: toNum(parsed.exposition_term),
          sale_id: toNum(parsed.sale_id),
          discount_price_1: toNum(parsed.discount_price_1),
          discount_price_2: toNum(parsed.discount_price_2),
          discount_price_3: toNum(parsed.discount_price_3),
          is_VAT_Excise: toBool(parsed.is_VAT_Excise),
          excise_product: toBool(parsed.excise_product),
          is_new_product: toBool(parsed.is_new_product),
          product_category: toNum(parsed.product_category),
          product_subcategory: toNum(parsed.product_subcategory),
          product_division: toNum(parsed.product_division),
        },
      });

      approved.push({ barcode, data: parsed });
    }

    await this.idleSync.syncIfCurrentlyIdle();

    return { message: 'Approved data will be sent to db', approved, rejected };
  }

  // ─── POST /api/products/image ──────────────────────────────────────────────

  async saveProductImages(items: SaveImageDto[]) {
    for (const item of items) {
      const { productImage, fileName } = item;
      if (!productImage || !fileName) {
        throw new BadRequestException('Missing image data or file name');
      }
      const buffer = Buffer.from(productImage, 'base64');
      const filePath = path.join(this.imagesDir, fileName);
      fs.writeFile(filePath, buffer, (err) => {
        if (err) this.logger.error(`Failed to write image ${fileName}: ${err.message}`);
      });

      const barcode = fileName.slice(0, fileName.lastIndexOf('.'));
      if (barcode) {
        const productInDb = await this.prisma.products.findUnique({ where: { barcode } });
        if (productInDb) {
          await this.prisma.products.update({
            where: { barcode },
            data: { product_image: `${this.mmHost}/api/product-image/${fileName}` },
          });
        }
      }
    }

    this.events.emit(PRODUCT_UPDATED_EVENT);
    return { message: 'File(s) uploaded successfully' };
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private async resolveImageUrl(barcode: string): Promise<string> {
    for (const ext of IMAGE_EXTENSIONS) {
      const fullPath = path.join(this.imagesDir, `${barcode}${ext}`);
      try {
        await fsPromises.access(fullPath);
        return `${this.mmHost}/api/product-image/${barcode}${ext}`;
      } catch {
        // try next extension
      }
    }
    return `${this.mmHost}/api/product-image/default-product.jpg`;
  }

  private async resolveComboProducts<T extends AddProductDto>(products: T[]): Promise<T[]> {
    const result: T[] = [];
    for (const p of products) {
      if (p.sale_id !== 7) {
        result.push({ ...p, child_product_barcode: null });
        continue;
      }
      if (!p.child_product_barcode) {
        result.push({ ...p, sale_id: 0, child_product_barcode: null });
        continue;
      }
      const child = await this.prisma.products.findUnique({ where: { barcode: p.child_product_barcode } });
      if (!child) {
        result.push({ ...p, sale_id: 0, child_product_barcode: null });
        continue;
      }
      result.push({ ...p, child_id: child.id } as T);
    }
    return result;
  }

  private parseProductData(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'boolean') {
        result[key] = value;
        continue;
      }
      if (key === 'product_code' && value !== null && value !== undefined) {
        result[key] = String(value).replace(/\s/g, '');
        continue;
      }
      const parsed = parseFloat(value as string);
      result[key] = !isNaN(parsed) && value !== null && value !== '' ? parsed : value;
    }
    return result;
  }
}
