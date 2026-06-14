import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../database/prisma.service';
import { IdleSyncService } from '../kiosk/idle-sync.service';
import { PRODUCT_UPDATED_EVENT, IMAGE_EXTENSIONS } from '../store/constants';
import { AddCategoryDto, EditCategoryDto } from './dto/category.dto';
import { AddSubcategoryDto, EditSubcategoryDto, MoveSubcategoryDto } from './dto/subcategory.dto';
import { SetMerchantDto, AddStoreSaleDto, AddCategoryImageDto } from './dto/merchant.dto';
import * as fs from 'fs';
import * as path from 'path';
import { TerminalService } from '../terminal/terminal.service';

@Injectable()
export class ConfigStoreService {
  private readonly logger = new Logger(ConfigStoreService.name);
  private readonly categoryImageDir: string;
  private readonly mmHost: string;
  private readonly storeAuthId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly nestConfig: NestConfigService,
    private readonly events: EventEmitter2,
    private readonly idleSync: IdleSyncService,
    private readonly terminalService: TerminalService,
  ) {
    this.categoryImageDir = this.nestConfig.get<string>('images.categoryDir') ?? 'C:/mm-images/cat-images';
    this.mmHost = this.nestConfig.get<string>('store.host') ?? 'http://localhost:6006';
    this.storeAuthId = this.nestConfig.get<string>('store.authId') ?? '';

    if (!fs.existsSync(this.categoryImageDir)) {
      fs.mkdirSync(this.categoryImageDir, { recursive: true });
    }
  }

  // ─── GET /api/config/check-categories ────────────────────────────────────

  async checkCategories() {
    const categories = await this.prisma.categories.findMany({
      include: {
        Subcategories_Subcategories_category_ref_1CToCategories: {
          select: { subcategory_name: true, subcat_1C_id: true },
        },
      },
    });
    return { message: 'Categories checked', categories };
  }

  // ─── POST /api/config/category ────────────────────────────────────────────

  async addCategory(categoryData: AddCategoryDto[]) {
    const existingIds = (
      await this.prisma.categories.findMany({
        where: { cat_1C_id: { in: categoryData.map((c) => c.cat_1C_id) } },
        select: { cat_1C_id: true },
      })
    ).map((c) => c.cat_1C_id);

    if (existingIds.length) {
      throw new BadRequestException(`cat_1C_id already exists: ${existingIds.join(', ')}`);
    }

    for (const category of categoryData) {
      await this.idleSync.enqueueCategoryTask({
        action: 'add_category',
        cat_1C_id: category.cat_1C_id,
        category_name: category.category_name,
        category_discount: category.category_discount,
        category_image: category.category_image,
      });
    }

    await this.idleSync.syncIfCurrentlyIdle();

    return {
      message: `Queued ${categoryData.length} category/categories for deferred idle sync`,
      queued: categoryData.length,
    };
  }

  // ─── PATCH /api/config/category ───────────────────────────────────────────

  async editCategory(categoryData: EditCategoryDto[]) {
    const errorCategory: EditCategoryDto[] = [];
    let queued = 0;

    for (const updateData of categoryData) {
      if (!updateData.cat_1C_id) {
        errorCategory.push(updateData);
        continue;
      }

      const existing = await this.prisma.categories.findUnique({ where: { cat_1C_id: updateData.cat_1C_id } });
      if (!existing) {
        throw new NotFoundException(`Category ${updateData.cat_1C_id} not exists`);
      }

      await this.idleSync.enqueueCategoryTask({
        action: 'edit_category',
        cat_1C_id: updateData.cat_1C_id,
        category_name: updateData.category_name,
        category_discount: updateData.category_discount,
        category_image: updateData.category_image,
        category_priority: updateData.category_priority,
      });
      queued++;
    }

    await this.idleSync.syncIfCurrentlyIdle();

    return { message: `Queued ${queued} category update(s) for deferred idle sync`, queued, errorCategory };
  }

  // ─── POST /api/config/subcategory ─────────────────────────────────────────

  async addSubCategory(subcategoryData: AddSubcategoryDto[]) {
    const missingCatId = subcategoryData.filter((item) => !item.cat_1C_id);
    if (missingCatId.length) {
      throw new BadRequestException('cat_1C_id is required for each subcategory');
    }

    const catIds = [...new Set(subcategoryData.map((item) => item.cat_1C_id))];
    const foundCats = await this.prisma.categories.findMany({
      where: { cat_1C_id: { in: catIds } },
      select: { id: true, cat_1C_id: true },
    });
    const foundCatIds = new Set(foundCats.map((c) => c.cat_1C_id));
    const missingCats = catIds.filter((id) => !foundCatIds.has(id));
    if (missingCats.length) {
      throw new BadRequestException(`Parent category not found for cat_1C_id: ${missingCats.join(', ')}`);
    }

    const existingSubcatIds = new Set(
      (await this.prisma.subcategories.findMany({
        where: { subcat_1C_id: { in: subcategoryData.map((i) => i.subcat_1C_id) } },
        select: { subcat_1C_id: true },
      })).map((s) => s.subcat_1C_id),
    );
    const duplicates = subcategoryData.filter((i) => existingSubcatIds.has(i.subcat_1C_id));
    if (duplicates.length) {
      throw new BadRequestException(`subcat_1C_id already exists: ${duplicates.map((d) => d.subcat_1C_id).join(', ')}`);
    }

    for (const item of subcategoryData) {
      await this.idleSync.enqueueCategoryTask({
        action: 'add_subcategory',
        cat_1C_id: item.cat_1C_id,
        subcat_1C_id: item.subcat_1C_id,
        subcategory_name: item.subcategory_name,
        subcategory_discount: item.subcategory_discount,
      });
    }

    await this.idleSync.syncIfCurrentlyIdle();

    return {
      message: `Queued ${subcategoryData.length} subcategory/subcategories for deferred idle sync`,
      queued: subcategoryData.length,
    };
  }

  // ─── PATCH /api/config/subcategory ────────────────────────────────────────

  async editSubCategory(subcategoryData: EditSubcategoryDto[]) {
    const categoriesNotExist: unknown[] = [];
    let queued = 0;

    for (const item of subcategoryData) {
      if (item.new_subcat_1C_id && item.new_cat_1C_id) {
        const cats = await this.prisma.categories.findMany({ where: { cat_1C_id: { in: [item.cat_1C_id, item.new_cat_1C_id] } } });
        const oldCat = cats.find((c) => c.cat_1C_id === item.cat_1C_id);
        const newCat = cats.find((c) => c.cat_1C_id === item.new_cat_1C_id);
        if (!oldCat || !newCat) { categoriesNotExist.push(item); continue; }

        const existingSubcat = await this.prisma.subcategories.findFirst({
          where: { category_ref_1C: item.cat_1C_id, subcat_1C_id: item.subcat_1C_id },
        });
        if (!existingSubcat) { categoriesNotExist.push(item); continue; }

        const taken = await this.prisma.subcategories.findUnique({ where: { subcat_1C_id: item.new_subcat_1C_id } });
        if (taken) { categoriesNotExist.push(item); continue; }

      } else if (item.new_subcat_1C_id && !item.new_cat_1C_id) {
        const catSubcat = await this.checkCatAndSubcatExist(item.cat_1C_id, item.subcat_1C_id);
        if (!catSubcat.status) { categoriesNotExist.push(item); continue; }

        const taken = await this.prisma.subcategories.findUnique({ where: { subcat_1C_id: item.new_subcat_1C_id } });
        if (taken) { categoriesNotExist.push(item); continue; }

      } else {
        const catSubcat = await this.checkCatAndSubcatExist(item.cat_1C_id, item.subcat_1C_id);
        if (!catSubcat.status) { categoriesNotExist.push(item); continue; }
      }

      await this.idleSync.enqueueCategoryTask({
        action: 'edit_subcategory',
        cat_1C_id: item.cat_1C_id,
        subcat_1C_id: item.subcat_1C_id,
        subcategory_name: item.subcategory_name,
        subcategory_discount: item.subcategory_discount,
        new_subcat_1C_id: item.new_subcat_1C_id,
        new_cat_1C_id: item.new_cat_1C_id,
      });
      queued++;
    }

    await this.idleSync.syncIfCurrentlyIdle();

    return { message: `Queued ${queued} subcategory update(s) for deferred idle sync`, queued, categoriesNotExist };
  }

  // ─── POST /api/config/move-subcategory ────────────────────────────────────

  async moveSubCategory(items: MoveSubcategoryDto[]) {
    const willProcess: MoveSubcategoryDto[] = [];
    const error: string[] = [];

    for (const item of items) {
      const existingCat = await this.prisma.categories.findFirst({ where: { cat_1C_id: item.cat_1C_id } });
      if (!existingCat) {
        error.push(`Category ${item.cat_1C_id} not found`);
        continue;
      }
      const existingSubcat = await this.prisma.subcategories.findFirst({ where: { subcat_1C_id: item.subcat_1C_id, category_ref_1C: item.cat_1C_id } });
      if (!existingSubcat) {
        error.push(`Subcategory ${item.subcat_1C_id} not found in category ${item.cat_1C_id}`);
        continue;
      }
      const newCat = await this.prisma.categories.findFirst({ where: { cat_1C_id: item.new_cat_1C_id } });
      if (!newCat) {
        error.push(`New category ${item.new_cat_1C_id} not found`);
        continue;
      }
      willProcess.push(item);
    }

    for (const item of willProcess) {
      await this.idleSync.enqueueSubcategoryMove(item);
    }

    await this.idleSync.syncIfCurrentlyIdle();

    return { message: { willProcess, error } };
  }

  // ─── POST /api/config/store-sale ──────────────────────────────────────────

  async addStoreSale(dto: AddStoreSaleDto) {
    const catSubcat = await this.prisma.subcategories.findFirst({
      where: {
        subcat_1C_id: dto.store_sale_product_subcategory,
        category_ref_1C: dto.store_sale_product_category,
      },
    });
    if (!catSubcat) {
      throw new NotFoundException('Product category or subcategory not found');
    }

    await this.idleSync.enqueueStoreSale({
      storeAuthId: this.storeAuthId,
      store_sale_name: dto.store_sale_name,
      store_sale_title: dto.store_sale_title,
      store_sale_discount: dto.store_sale_discount,
      store_sale_product_category: dto.store_sale_product_category,
      store_sale_product_subcategory: dto.store_sale_product_subcategory,
    });

    await this.idleSync.syncIfCurrentlyIdle();

    return {
      message: `Знижка ${dto.store_sale_title} поставлена в чергу`,
      queued: 1,
    };
  }

  // ─── GET /api/config/store-sale ───────────────────────────────────────────

  async getStoreSale() {
    const store = await this.prisma.store.findUnique({ where: { auth_id: this.storeAuthId } });
    if (!store) throw new NotFoundException('Store not found');

    const saleId = store.store_sale_product_category && store.store_sale_product_subcategory ? 9 : 4;

    const [products, saleData] = await this.prisma.$transaction([
      this.prisma.products.findMany({
        where: { AND: [{ sale_id: saleId }, { product_left: { gte: 1 } }] } as never,
        include: { Sales: true },
      }),
      this.prisma.sales.findUnique({ where: { sale_custom_id: saleId } }),
    ]);

    return {
      message: saleId === 9 ? 'With default sale' : 'No default sale',
      products,
      saleData,
      discount: store.store_sale_discount,
      store_sale_title: store.store_sale_title,
    };
  }

  // ─── GET /api/config/merchant ─────────────────────────────────────────────

  async getMerchantData() {
    const merchants = { noVAT: '1', VAT: '11', defaultMerchantName: '', VATMerchantName: '', is_single_merchant: false };

    try {
      const merchantList = await this.terminalService.getMerchants();
      if (Array.isArray(merchantList) && merchantList.length) {
        merchantList.forEach((item, i) => {
          if (i === 0) { merchants.noVAT = item.merchantId; merchants.defaultMerchantName = item.merchantName ?? ''; merchants.is_single_merchant = merchantList.length === 1; }
          if (i === 1) { merchants.VAT = item.merchantId; merchants.VATMerchantName = item.merchantName ?? ''; }
        });
      }
    } catch (err) {
      this.logger.warn(`Could not fetch merchant list from terminal: ${err}`);
    }

    const store = await this.prisma.store.update({
      where: { auth_id: this.storeAuthId },
      data: {
        default_merchant: merchants.noVAT,
        VAT_excise_merchant: merchants.VAT,
        default_merchant_name: merchants.defaultMerchantName,
        VAT_merchant_name: merchants.VATMerchantName,
        is_single_merchant: merchants.is_single_merchant,
      },
    });

    return {
      status: 'success',
      defaultMerchant: store.default_merchant,
      vatExciseMerchant: store.VAT_excise_merchant,
      useVATbyDefault: store.use_VAT_by_default,
      isSingleMerchant: store.is_single_merchant,
      noVATTaxGroup: store.default_merchant_taxgrp,
      VATTaxGroup: store.VAT_merchant_taxgrp,
      VATExciseTaxGroup: store.VAT_excise_taxgrp,
    };
  }

  // ─── POST /api/config/merchant ────────────────────────────────────────────

  async setMerchantData(dto: SetMerchantDto) {
    if (!dto.isSingleMerchant && dto.useVATbyDefault) {
      throw new BadRequestException("You can't use VAT by default with multiple merchants");
    }

    const store = await this.prisma.store.findUnique({ where: { auth_id: this.storeAuthId } });
    if (!store) throw new NotFoundException('Store not found');

    const updatedStore = await this.prisma.store.update({
      where: { auth_id: this.storeAuthId },
      data: {
        default_merchant: dto.defaultMerchant,
        VAT_excise_merchant: dto.vatExciseMerchant,
        use_VAT_by_default: dto.useVATbyDefault,
        is_single_merchant: dto.isSingleMerchant,
        default_merchant_taxgrp: dto.defaultMerchantTaxgrp ?? 7,
        VAT_excise_taxgrp: dto.vatExciseMerchantTaxgrp ?? 3,
      },
    });

    return { message: 'Merchant data updated', updatedStore };
  }

  // ─── POST /api/config/category-image ─────────────────────────────────────

  async addCategoryImage(imageData: AddCategoryImageDto[]) {
    const imagesUrls: string[] = [];
    const failedExtensionFiles: AddCategoryImageDto[] = [];

    for (const item of imageData) {
      const { categoryImage, fileName, categoryId } = item;
      if (!categoryImage || !fileName || !categoryId) {
        throw new BadRequestException('Missing image data, file name, or category ID');
      }

      const extension = fileName.slice(fileName.lastIndexOf('.'));
      if (!extension) throw new BadRequestException('Bad file name, should be with extension');

      if (!IMAGE_EXTENSIONS.includes(extension as never)) {
        failedExtensionFiles.push(item);
        continue;
      }

      const categoryFileName = `category_image_${categoryId}${extension}`;
      const filePath = path.join(this.categoryImageDir, categoryFileName);

      await this.prisma.categories.update({
        where: { cat_1C_id: categoryId },
        data: { category_image: `${this.mmHost}/api/category-image/${categoryFileName}` },
      });

      const buffer = Buffer.from(categoryImage, 'base64');
      fs.writeFile(filePath, buffer, (err) => {
        if (err) this.logger.error(`Failed to write category image: ${err.message}`);
      });

      imagesUrls.push(categoryFileName);
    }

    this.events.emit(PRODUCT_UPDATED_EVENT);

    return {
      message: 'Images managed',
      imageUrl: imagesUrls,
      failedExtensionFiles,
      error: failedExtensionFiles.length ? 'Files should be .jpg, .jpeg, .webp, .png' : '',
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async checkCatAndSubcatExist(cat1C: number, subcat1C: number) {
    const cat = await this.prisma.categories.findUnique({ where: { cat_1C_id: cat1C } });
    if (!cat) return { status: false, message: 'Category not exist' };
    const subcat = await this.prisma.subcategories.findUnique({ where: { subcat_1C_id: subcat1C } });
    if (!subcat) return { status: false, message: 'Subcategory not exist' };
    return { status: true, existingCategory: cat, existingSubCategory: subcat };
  }

}
