import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { PRODUCT_UPDATED_EVENT, STORE_SALE_UPDATED_EVENT } from '../store/constants';

@Injectable()
export class IdleSyncService {
  private readonly logger = new Logger(IdleSyncService.name);

  /** Prevents concurrent sync runs (overlapping idle-status + screen-status poll). */
  private isSyncing = false;

  /** Last known kiosk idle state — updated by KioskGateway on every idle/screen-status event. */
  private kioskIsIdle = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  // ─── Public API ───────────────────────────────────────────────────────────

  /**
   * Called when the kiosk frontend reports being in idle/screensaver state.
   * Re-entrant calls are silently ignored.
   */
  markKioskIdle(isIdle: boolean): void {
    this.kioskIsIdle = isIdle;
  }

  async syncIfIdle(): Promise<void> {
    this.kioskIsIdle = true;
    if (this.isSyncing) return;
    this.isSyncing = true;
    try {
      await this.syncProductUpdates();
      await this.syncSubcategoryMoves();
      await this.syncCategoryTasks();
      await this.syncStoreSales();
    } finally {
      this.isSyncing = false;
    }
  }

  async syncIfCurrentlyIdle(): Promise<void> {
    if (this.kioskIsIdle) await this.syncIfIdle();
  }

  /**
   * Enqueues a product create/update for deferred processing.
   * Called by admin endpoints when the kiosk may be serving customers.
   */
  async enqueueProductUpdate(data: {
    action: 'add' | 'update';
    barcode: string;
    catSubcatId: number;
    product_name?: string;
    product_code?: string;
    measure?: string;
    product_name_ru?: string;
    product_name_ua?: string;
    product_description?: string;
    product_image?: string;
    product_price?: number;
    product_discount?: number;
    exposition_term?: number;
    discount_price_1?: number;
    discount_price_2?: number;
    discount_price_3?: number;
    is_VAT_Excise?: boolean;
    excise_product?: boolean;
    product_left?: number;
    is_new_product?: boolean;
    product_category?: number;
    product_subcategory?: number;
    product_division?: number;
    sale_id?: number;
  }): Promise<void> {
    await this.prisma.productUpdateQueue.create({
      data: {
        action: data.action,
        barcode: data.barcode,
        cat_subcat_id: data.catSubcatId,
        product_name: data.product_name,
        product_code: data.product_code,
        measure: data.measure,
        product_name_ru: data.product_name_ru,
        product_name_ua: data.product_name_ua,
        product_description: data.product_description,
        product_image: data.product_image,
        product_price: data.product_price,
        product_discount: data.product_discount,
        exposition_term: data.exposition_term,
        discount_price_1: data.discount_price_1,
        discount_price_2: data.discount_price_2,
        discount_price_3: data.discount_price_3,
        is_VAT_Excise: data.is_VAT_Excise,
        excise_product: data.excise_product,
        product_left: data.product_left,
        is_new_product: data.is_new_product,
        product_category: data.product_category,
        product_subcategory: data.product_subcategory,
        product_division: data.product_division,
        sale_id: data.sale_id,
      },
    });
  }

  /**
   * Enqueues a subcategory move for deferred processing.
   * Called by admin endpoints.
   */
  async enqueueStoreSale(data: {
    storeAuthId: string;
    store_sale_name: string;
    store_sale_title: string;
    store_sale_discount: number;
    store_sale_product_category: number;
    store_sale_product_subcategory: number;
  }): Promise<void> {
    await this.prisma.storeSaleQueue.create({
      data: {
        store_auth_id: data.storeAuthId,
        store_sale_name: data.store_sale_name,
        store_sale_title: data.store_sale_title,
        store_sale_discount: data.store_sale_discount,
        store_sale_product_category: data.store_sale_product_category,
        store_sale_product_subcategory: data.store_sale_product_subcategory,
      },
    });
  }

  async enqueueCategoryTask(data: {
    action: 'add_category' | 'edit_category' | 'add_subcategory' | 'edit_subcategory';
    cat_1C_id: number;
    category_name?: string;
    category_discount?: number | null;
    category_image?: string;
    category_priority?: number;
    subcat_1C_id?: number;
    subcategory_name?: string;
    subcategory_discount?: number | null;
    new_subcat_1C_id?: number;
    new_cat_1C_id?: number;
  }): Promise<void> {
    await this.prisma.categoryTaskQueue.create({ data });
  }

  async enqueueSubcategoryMove(data: {
    cat_1C_id: number;
    subcat_1C_id: number;
    new_cat_1C_id: number;
    subcat_name?: string;
  }): Promise<void> {
    await this.prisma.subcategoryMoveQueue.create({ data });
  }

  async syncDebug(): Promise<{ barcode: string; error: string }[]> {
    const items = await this.prisma.productUpdateQueue.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'asc' },
    });
    const errors: { barcode: string; error: string }[] = [];
    const now = new Date();
    const loadDateTimeStr = now.toISOString().replace('Z', '+00:00');
    for (const item of items) {
      try {
        const saleId = item.sale_id ?? 0;
        const incomingQty = Number(item.product_left ?? 0);
        const upserted = await this.prisma.products.upsert({
          where: { barcode: item.barcode },
          update: {
            product_name: item.product_name ?? undefined,
            product_price: item.product_price ?? undefined,
            is_VAT_Excise: item.is_VAT_Excise ?? undefined,
            excise_product: item.excise_product ?? undefined,
            is_new_product: item.is_new_product ?? undefined,
            exposition_term: item.exposition_term,
            updatedAt: now,
            ...(item.cat_subcat_id && {
              Subcategories_Products_cat_subcat_idToSubcategories: { connect: { id: item.cat_subcat_id } },
            }),
            ...(item.product_category != null && {
              Categories: { connect: { cat_1C_id: item.product_category } },
            }),
            ...(item.product_subcategory != null && {
              Subcategories: { connect: { subcat_1C_id: item.product_subcategory } },
            }),
            Sales: { connect: { sale_custom_id: saleId } },
          },
          create: {
            barcode: item.barcode,
            product_name: item.product_name,
            product_code: item.product_code,
            measure: item.measure ?? 'шт',
            product_name_ua: item.product_name_ua,
            product_price: item.product_price,
            is_VAT_Excise: item.is_VAT_Excise,
            excise_product: item.excise_product ?? false,
            product_left: incomingQty,
            is_new_product: item.is_new_product ?? false,
            exposition_term: item.exposition_term,
            updatedAt: now,
            Subcategories_Products_cat_subcat_idToSubcategories: { connect: { id: item.cat_subcat_id } },
            ...(item.product_category != null && {
              Categories: { connect: { cat_1C_id: item.product_category } },
            }),
            ...(item.product_subcategory != null && {
              Subcategories: { connect: { subcat_1C_id: item.product_subcategory } },
            }),
            Sales: { connect: { sale_custom_id: saleId } },
          },
        });
        if (incomingQty > 0) {
          await this.prisma.loadProducts.create({
            data: { product_id: upserted.id, load_date: now, load_quantity: incomingQty, lotIsActive: true, products_left: incomingQty, sale_id: saleId, load_date_time: new Date(loadDateTimeStr) },
          });
        }
        errors.push({ barcode: item.barcode, error: 'OK' });
      } catch (err) {
        errors.push({ barcode: item.barcode, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return errors;
  }

  // ─── Private processing ───────────────────────────────────────────────────

  private async syncProductUpdates(): Promise<void> {
    const items = await this.prisma.productUpdateQueue.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'asc' },
    });

    if (!items.length) return;

    let processed = 0;
    const now = new Date();
    const loadDateTimeStr = now.toISOString().replace('Z', '+00:00');

    for (const item of items) {
      try {
        const saleId = item.sale_id ?? 0;
        const incomingQty = Number(item.product_left ?? 0);

        const sharedUpdateFields = {
          product_name: item.product_name ?? undefined,
          product_code: item.product_code ?? undefined,
          measure: item.measure ?? undefined,
          product_name_ru: item.product_name_ru,
          product_name_ua: item.product_name_ua ?? undefined,
          product_description: item.product_description,
          product_image: item.product_image ?? undefined,
          product_price: item.product_price ?? undefined,
          product_discount: item.product_discount,
          exposition_term: item.exposition_term,
          discount_price_1: item.discount_price_1,
          discount_price_2: item.discount_price_2,
          discount_price_3: item.discount_price_3,
          is_VAT_Excise: item.is_VAT_Excise ?? undefined,
          excise_product: item.excise_product ?? undefined,
          is_new_product: item.is_new_product ?? undefined,
          updatedAt: now,
          ...(item.cat_subcat_id && {
            Subcategories_Products_cat_subcat_idToSubcategories: { connect: { id: item.cat_subcat_id } },
          }),
          ...(item.product_category != null && {
            Categories: { connect: { cat_1C_id: item.product_category } },
          }),
          ...(item.product_subcategory != null && {
            Subcategories: { connect: { subcat_1C_id: item.product_subcategory } },
          }),
          Sales: { connect: { sale_custom_id: saleId } },
          ...(item.product_division != null && {
            ProductsDivisions: { connect: { division_custom_id: item.product_division } },
          }),
        };

        let upserted: { id: number };

        if (item.action === 'update') {
          upserted = await this.prisma.products.update({
            where: { barcode: item.barcode },
            data: sharedUpdateFields,
          });
        } else {
          upserted = await this.prisma.products.upsert({
            where: { barcode: item.barcode },
            update: sharedUpdateFields,
            create: {
              barcode: item.barcode,
              product_name: item.product_name,
              product_code: item.product_code,
              measure: item.measure ?? 'шт',
              product_name_ru: item.product_name_ru,
              product_name_ua: item.product_name_ua,
              product_description: item.product_description,
              product_image: item.product_image,
              product_price: item.product_price,
              product_discount: item.product_discount,
              exposition_term: item.exposition_term,
              discount_price_1: item.discount_price_1,
              discount_price_2: item.discount_price_2,
              discount_price_3: item.discount_price_3,
              is_VAT_Excise: item.is_VAT_Excise,
              excise_product: item.excise_product ?? false,
              product_left: incomingQty,
              is_new_product: item.is_new_product ?? false,
              updatedAt: now,
              Subcategories_Products_cat_subcat_idToSubcategories: {
                connect: { id: item.cat_subcat_id },
              },
              Categories: { connect: { cat_1C_id: item.product_category! } },
              Subcategories: { connect: { subcat_1C_id: item.product_subcategory! } },
              Sales: { connect: { sale_custom_id: saleId } },
              ...(item.product_division != null && {
                ProductsDivisions: { connect: { division_custom_id: item.product_division } },
              }),
            },
          });
        }

        // Create a lot entry for the incoming stock and recalculate product_left from all active lots
        if (incomingQty > 0) {
          await this.prisma.loadProducts.create({
            data: {
              product_id: upserted.id,
              load_date: now,
              load_quantity: incomingQty,
              lotIsActive: true,
              products_left: incomingQty,
              sale_id: saleId,
              load_date_time: new Date(loadDateTimeStr),
            },
          });

          const [latestLot, sumResult] = await Promise.all([
            this.prisma.loadProducts.findFirst({
              where: { product_id: upserted.id, lotIsActive: true },
              orderBy: { load_date_time: { sort: 'desc', nulls: 'last' } },
            }),
            this.prisma.loadProducts.aggregate({
              where: { product_id: upserted.id, lotIsActive: true },
              _sum: { products_left: true },
            }),
          ]);

          if (latestLot) {
            await this.prisma.products.update({
              where: { id: upserted.id },
              data: {
                product_lot: latestLot.id,
                product_left: sumResult._sum.products_left ?? 0,
              },
            });
          }
        }

        await this.prisma.productUpdateQueue.update({
          where: { id: item.id },
          data: { status: 'done', processed_at: now },
        });

        processed++;
      } catch (err) {
        this.logger.error(
          `Failed to apply ProductUpdateQueue #${item.id} (barcode=${item.barcode}): ` +
            (err instanceof Error ? err.message : String(err)),
        );
        // Leave as 'pending' — will retry on the next idle cycle
      }
    }

    if (processed) {
      this.logger.log(`Applied ${processed}/${items.length} product update(s)`);
      this.events.emit(PRODUCT_UPDATED_EVENT);
    }

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.prisma.productUpdateQueue.deleteMany({
      where: { status: 'done', processed_at: { lt: cutoff } },
    });
  }

  private async syncStoreSales(): Promise<void> {
    const items = await this.prisma.storeSaleQueue.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'asc' },
    });

    if (!items.length) return;

    let processed = 0;
    const now = new Date();

    for (const item of items) {
      try {
        await this.prisma.$transaction([
          this.prisma.store.update({
            where: { auth_id: item.store_auth_id },
            data: {
              store_sale_name: item.store_sale_name,
              store_sale_title: item.store_sale_title,
              store_sale_discount: item.store_sale_discount,
              store_sale_product_category: item.store_sale_product_category,
              store_sale_product_subcategory: item.store_sale_product_subcategory,
            },
          }),
          this.prisma.sales.update({
            where: { sale_custom_id: 9 },
            data: { sale_name: item.store_sale_name, sale_discount_1: item.store_sale_discount as never },
          }),
          this.prisma.products.updateMany({
            where: {
              product_category: item.store_sale_product_category,
              product_subcategory: item.store_sale_product_subcategory,
            },
            data: { sale_id: 9, combo_id: null },
          }),
        ]);

        await this.prisma.storeSaleQueue.update({
          where: { id: item.id },
          data: { status: 'done', processed_at: now },
        });
        processed++;
      } catch (err) {
        this.logger.error(
          `Failed to apply StoreSaleQueue #${item.id}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    if (processed) {
      this.logger.log(`Applied ${processed}/${items.length} store sale update(s)`);
      this.events.emit(PRODUCT_UPDATED_EVENT);
      this.events.emit(STORE_SALE_UPDATED_EVENT);
    }

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.prisma.storeSaleQueue.deleteMany({
      where: { status: 'done', processed_at: { lt: cutoff } },
    });
  }

  private async syncCategoryTasks(): Promise<void> {
    const items = await this.prisma.categoryTaskQueue.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'asc' },
    });

    if (!items.length) return;

    let processed = 0;
    const now = new Date();

    for (const item of items) {
      try {
        switch (item.action) {
          case 'add_category': {
            const exists = await this.prisma.categories.findUnique({ where: { cat_1C_id: item.cat_1C_id } });
            if (!exists) {
              const maxPriority = await this.prisma.categories.aggregate({ _max: { category_priority: true } });
              const nextPriority = (maxPriority._max.category_priority ?? 0) + 1;
              await this.prisma.categories.create({
                data: {
                  category_name: item.category_name ?? 'Нова категорія',
                  category_discount: item.category_discount ?? null,
                  category_image: item.category_image ?? '',
                  cat_1C_id: item.cat_1C_id,
                  category_priority: nextPriority,
                },
              });
            }
            break;
          }

          case 'edit_category': {
            const current = await this.prisma.categories.findUnique({ where: { cat_1C_id: item.cat_1C_id } });
            if (!current) throw new Error(`Category ${item.cat_1C_id} not found`);

            const updateData: Record<string, unknown> = {};
            if (item.category_name != null) updateData.category_name = item.category_name;
            if (item.category_discount != null) updateData.category_discount = item.category_discount;
            if (item.category_image != null) updateData.category_image = item.category_image;
            if (Object.keys(updateData).length > 0) {
              await this.prisma.categories.update({ where: { cat_1C_id: item.cat_1C_id }, data: updateData });
            }

            if (item.category_priority != null && item.category_priority !== current.category_priority) {
              const atTarget = await this.prisma.categories.findUnique({ where: { category_priority: item.category_priority } });
              if (atTarget) {
                const oldPriority = current.category_priority!;
                await this.prisma.categories.update({ where: { cat_1C_id: atTarget.cat_1C_id }, data: { category_priority: 9999 } });
                await this.prisma.categories.update({ where: { cat_1C_id: item.cat_1C_id }, data: { category_priority: item.category_priority } });
                await this.prisma.categories.update({ where: { cat_1C_id: atTarget.cat_1C_id }, data: { category_priority: oldPriority } });
              }
            }
            break;
          }

          case 'add_subcategory': {
            if (!item.subcat_1C_id) throw new Error('subcat_1C_id is required');
            const alreadyExists = await this.prisma.subcategories.findUnique({ where: { subcat_1C_id: item.subcat_1C_id } });
            if (!alreadyExists) {
              const cat = await this.prisma.categories.findUnique({ where: { cat_1C_id: item.cat_1C_id } });
              if (!cat) throw new Error(`Category ${item.cat_1C_id} not found`);
              await this.prisma.subcategories.create({
                data: {
                  subcategory_name: item.subcategory_name ?? '',
                  subcategory_discount: item.subcategory_discount ?? null,
                  subcat_1C_id: item.subcat_1C_id,
                  Categories_Subcategories_category_ref_1CToCategories: { connect: { cat_1C_id: item.cat_1C_id } },
                  Categories: { connect: { id: cat.id } },
                },
              });
            }
            break;
          }

          case 'edit_subcategory': {
            if (!item.subcat_1C_id) throw new Error('subcat_1C_id is required');

            if (item.new_subcat_1C_id && item.new_cat_1C_id) {
              const cats = await this.prisma.categories.findMany({ where: { cat_1C_id: { in: [item.cat_1C_id, item.new_cat_1C_id] } } });
              const oldCat = cats.find((c) => c.cat_1C_id === item.cat_1C_id);
              const newCat = cats.find((c) => c.cat_1C_id === item.new_cat_1C_id);
              if (!oldCat || !newCat) throw new Error(`Category not found`);

              const existingSubcat = await this.prisma.subcategories.findFirst({
                where: { category_ref_1C: item.cat_1C_id, subcat_1C_id: item.subcat_1C_id },
              });
              if (!existingSubcat) throw new Error(`Subcategory ${item.subcat_1C_id} not found in category ${item.cat_1C_id}`);

              const taken = await this.prisma.subcategories.findUnique({ where: { subcat_1C_id: item.new_subcat_1C_id } });
              if (taken) throw new Error(`subcat_1C_id ${item.new_subcat_1C_id} already taken`);

              const newSubcategory = await this.prisma.subcategories.create({
                data: {
                  subcategory_name: item.subcategory_name?.trim() || existingSubcat.subcategory_name || '',
                  subcategory_discount: item.subcategory_discount ?? null,
                  subcat_1C_id: item.new_subcat_1C_id,
                  Categories: { connect: { id: newCat.id } },
                  Categories_Subcategories_category_ref_1CToCategories: { connect: { cat_1C_id: item.new_cat_1C_id } },
                },
              });
              await this.prisma.products.updateMany({
                where: { cat_subcat_id: existingSubcat.id },
                data: { cat_subcat_id: newSubcategory.id, product_category: newSubcategory.category_ref_1C, product_subcategory: newSubcategory.subcat_1C_id },
              });
              await this.prisma.subcategories.delete({ where: { id: existingSubcat.id } });

            } else if (item.new_subcat_1C_id && !item.new_cat_1C_id) {
              const cat = await this.prisma.categories.findUnique({ where: { cat_1C_id: item.cat_1C_id } });
              if (!cat) throw new Error(`Category ${item.cat_1C_id} not found`);

              const existingSubcat = await this.prisma.subcategories.findFirst({
                where: { category_ref_1C: item.cat_1C_id, subcat_1C_id: item.subcat_1C_id },
              });
              if (!existingSubcat) throw new Error(`Subcategory ${item.subcat_1C_id} not found`);

              const taken = await this.prisma.subcategories.findUnique({ where: { subcat_1C_id: item.new_subcat_1C_id } });
              if (taken) throw new Error(`subcat_1C_id ${item.new_subcat_1C_id} already taken`);

              const newSubcategory = await this.prisma.subcategories.create({
                data: {
                  subcategory_name: item.subcategory_name?.trim() || existingSubcat.subcategory_name || '',
                  subcategory_discount: item.subcategory_discount ?? null,
                  subcat_1C_id: item.new_subcat_1C_id,
                  Categories: { connect: { id: cat.id } },
                  Categories_Subcategories_category_ref_1CToCategories: { connect: { cat_1C_id: item.cat_1C_id } },
                },
              });
              await this.prisma.products.updateMany({
                where: { cat_subcat_id: existingSubcat.id },
                data: { cat_subcat_id: newSubcategory.id, product_category: newSubcategory.category_ref_1C, product_subcategory: newSubcategory.subcat_1C_id },
              });
              await this.prisma.subcategories.delete({ where: { id: existingSubcat.id } });

            } else {
              await this.prisma.subcategories.update({
                where: { subcat_1C_id: item.subcat_1C_id },
                data: {
                  subcategory_name: item.subcategory_name?.trim() ?? undefined,
                  subcategory_discount: item.subcategory_discount ?? undefined,
                },
              });
            }
            break;
          }

          default:
            throw new Error(`Unknown category task action: ${item.action}`);
        }

        await this.prisma.categoryTaskQueue.update({
          where: { id: item.id },
          data: { status: 'done', processed_at: now },
        });
        processed++;
      } catch (err) {
        this.logger.error(
          `Failed to apply CategoryTaskQueue #${item.id} (action=${item.action}, cat_1C_id=${item.cat_1C_id}): ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    if (processed) {
      this.logger.log(`Applied ${processed}/${items.length} category task(s)`);
      this.events.emit(PRODUCT_UPDATED_EVENT);
    }

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    await this.prisma.categoryTaskQueue.deleteMany({
      where: { status: 'done', processed_at: { lt: cutoff } },
    });
  }

  private async syncSubcategoryMoves(): Promise<void> {
    const items = await this.prisma.subcategoryMoveQueue.findMany({
      where: { status: 'pending' },
      orderBy: { created_at: 'asc' },
    });

    if (!items.length) return;

    let processed = 0;
    for (const item of items) {
      try {
        const existing = await this.prisma.subcategories.findFirst({
          where: { subcat_1C_id: item.subcat_1C_id, category_ref_1C: item.cat_1C_id },
        });
        const newName = item.subcat_name?.trim() || (existing?.subcategory_name ?? '');

        await this.prisma.subcategories.update({
          where: { subcat_1C_id: item.subcat_1C_id },
          data: {
            subcategory_name: newName,
            Categories_Subcategories_category_ref_1CToCategories: {
              connect: { cat_1C_id: item.new_cat_1C_id },
            },
          },
        });

        await this.prisma.subcategoryMoveQueue.update({
          where: { id: item.id },
          data: { status: 'done', processed_at: new Date() },
        });

        processed++;
      } catch (err) {
        this.logger.error(
          `Failed to apply SubcategoryMoveQueue #${item.id} (subcat_1C_id=${item.subcat_1C_id}): ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }

    if (processed) this.logger.log(`Applied ${processed}/${items.length} subcategory move(s)`);
  }
}
