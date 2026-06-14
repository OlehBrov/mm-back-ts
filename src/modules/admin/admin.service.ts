import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Stores ───────────────────────────────────────────────────────────────

  async getAllStores() {
    const data = await this.prisma.store.findMany();
    return { data };
  }

  async getSingleStore(authId: string) {
    const store = await this.prisma.store.findFirst({ where: { auth_id: authId } });
    const products = await this.prisma.products.findMany({
      include: { Categories: true, Subcategories: true },
    });
    return { message: 'Store found', store, products };
  }

  async getWithdraws() {
    const withdrawData = await this.prisma.removeProducts.findMany({});
    return { message: 'Store found', withdrawData };
  }

  async putProductsInStore(_store_id: number, _productsToAdd: unknown[]) {
    // ProductsOnStore is not in the current schema
    return { message: 'Not implemented in current schema' };
  }

  async createStore(name: string, location: string, auth_id: string, password: string) {
    const existing = await this.prisma.store.findUnique({ where: { auth_id } });
    if (existing) throw new ConflictException('auth_id is already in use');

    const hashPassword = await bcrypt.hash(password, 10);
    const newStore = await this.prisma.store.create({
      data: { store_name: name, store_address: location, auth_id, password: hashPassword },
      select: { auth_id: true, id: true },
    });

    return { status: 'success', code: 201, data: { message: 'Registration successful', auth_id: newStore.auth_id } };
  }

  // ─── Products (admin) ─────────────────────────────────────────────────────

  async getAllProducts() {
    const [allProducts, qty] = await this.prisma.$transaction([
      this.prisma.products.findMany({
        include: {
          Categories: true,
          Subcategories: true,
          Sales: true,
          LoadProducts_LoadProducts_product_idToProducts: { select: { load_date: true } },
          ComboProducts_Products_combo_idToComboProducts: {
            include: {
              Products_ComboProducts_child_product_idToProducts: { select: { product_left: true } },
            },
          },
        },
      }),
      this.prisma.products.count(),
    ]);

    if (!allProducts.length) throw new NotFoundException('No products found');
    return { data: allProducts, qty };
  }

  async addAdminProducts(products: { product_name: string; barcode: string; image?: string; description?: string; price: number; total: number; category?: number[] }[]) {
    const existing = await this.prisma.products.findMany({ where: { barcode: { in: products.map((p) => p.barcode) } } });
    const existingBarcodes = new Set(existing.map((p) => p.barcode));
    const toCreate = products.filter((p) => !existingBarcodes.has(p.barcode));
    const toUpdate = products.filter((p) => existingBarcodes.has(p.barcode));

    await Promise.all(
      toCreate.map((p) =>
        this.prisma.products.create({
          data: { product_name: p.product_name, barcode: p.barcode, product_image: p.image, product_description: p.description, product_price: p.price, product_left: p.total },
        }),
      ),
    );

    return {
      message: 'Products processed successfully',
      existing: { message: `Found ${toUpdate.length} already existing products, not added`, data: toUpdate },
      created: { message: `Added ${toCreate.length} products` },
    };
  }

  async updateAdminProducts(products: { product_id: number; product_name?: string; image?: string; barcode?: string; description?: string; price?: number; total?: number; category?: number[] }[]) {
    await Promise.all(
      products.map(async (p) => {
        await this.prisma.products.update({
          where: { id: p.product_id },
          data: {
            product_name: p.product_name ?? undefined,
            product_image: p.image ?? undefined,
            barcode: p.barcode ?? undefined,
            product_description: p.description ?? undefined,
            product_price: p.price ?? undefined,
            product_left: p.total ?? undefined,
          },
        });
      }),
    );
    return { message: 'Products updated successfully' };
  }

  // ─── Sales ─────────────────────────────────────────────────────────────────

  async getSalesList() {
    const data = await this.prisma.sales.findMany();
    if (!data.length) return { message: 'No sales available' };
    return { message: 'success', data };
  }

  async addSale(saleData: { sale_name: string; sale_custom_id: number; sale_discount_1?: number; sale_discount_2?: number; sale_discount_3?: number; sale_description?: string }) {
    const existing = await this.prisma.sales.findUnique({ where: { sale_custom_id: saleData.sale_custom_id } });
    if (existing) throw new ConflictException(`Sale with id ${saleData.sale_custom_id} already exists`);

    const sale = await this.prisma.sales.create({
      data: {
        sale_name: saleData.sale_name,
        sale_discount_1: saleData.sale_discount_1 as never ?? null,
        sale_discount_2: saleData.sale_discount_2 as never ?? null,
        sale_discount_3: saleData.sale_discount_3 as never ?? null,
        sale_description: saleData.sale_description ?? 'No description provided',
        sale_custom_id: saleData.sale_custom_id,
      },
    });
    return { message: 'Sale added', sale };
  }

  async editSale(updateData: { sale_custom_id: number; [key: string]: unknown }) {
    if (!updateData.sale_custom_id) throw new BadRequestException("Field 'sale_custom_id' must be provided");
    const { sale_custom_id, ...newData } = updateData;
    const sale = await this.prisma.sales.findUnique({ where: { sale_custom_id } });
    if (!sale) throw new NotFoundException(`No such sale with id ${sale_custom_id}`);

    const { id, ...oldData } = sale;
    const mergedData = { ...oldData, ...newData };
    const updated = await this.prisma.sales.update({ where: { sale_custom_id }, data: mergedData as never });
    return { message: `Sale ${sale_custom_id} updated`, data: updated };
  }

  async removeSale(sale_custom_id: number) {
    if (!sale_custom_id) throw new BadRequestException("Field 'sale_custom_id' must be provided");
    const sale = await this.prisma.sales.findUnique({ where: { sale_custom_id } });
    if (!sale) throw new NotFoundException(`No such sale with id ${sale_custom_id}`);
    const deleted = await this.prisma.sales.delete({ where: { sale_custom_id } });
    return { message: `Sale ${sale_custom_id} deleted`, data: deleted };
  }

  // ─── Finance ──────────────────────────────────────────────────────────────

  async getPaymentsByPeriod(start: string, end: string, type = 1) {
    if (!start || !end) throw new BadRequestException(`Invalid start (${start}) or end (${end}) dates`);
    const result = await this.prisma.removeProducts.findMany({
      where: {
        AND: [
          { remove_date: { gte: new Date(start) } },
          { remove_date: { lte: new Date(end) } },
          { remove_type_id: { equals: parseInt(String(type)) } },
        ],
      } as never,
      include: { Products: { select: { barcode: true } } },
    });
    return { message: 'ok', result, qty: result.length };
  }
}
