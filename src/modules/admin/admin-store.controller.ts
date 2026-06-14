import { Body, Controller, Delete, Get, HttpCode, Patch, Post, Query } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ConfigService } from '@nestjs/config';

@Controller('admin/store')
export class AdminStoreController {
  constructor(
    private readonly adminService: AdminService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  getAllStores() {
    return this.adminService.getAllStores();
  }

  @Get('config')
  getSingleStore() {
    const authId = this.config.get<string>('store.authId') ?? '';
    return this.adminService.getSingleStore(authId);
  }

  @Get('withdraws')
  getWithdraws() {
    return this.adminService.getWithdraws();
  }

  @Post()
  @HttpCode(200)
  putProductsInStore(@Body() body: { store_id: number; productsToAdd: { product_id: number; quantity: number; discount?: number }[] }) {
    return this.adminService.putProductsInStore(body.store_id, body.productsToAdd);
  }

  @Post('create')
  createStore(@Body() body: { name: string; location: string; auth_id: string; password: string }) {
    return this.adminService.createStore(body.name, body.location, body.auth_id, body.password);
  }

  @Get('products')
  getAllProducts() {
    return this.adminService.getAllProducts();
  }

  @Post('products')
  addProducts(@Body() body: { product_name: string; barcode: string; image?: string; description?: string; price: number; total: number; category?: number[] }[]) {
    return this.adminService.addAdminProducts(body);
  }

  @Patch('products')
  updateProducts(@Body() body: { product_id: number; [key: string]: unknown }[]) {
    return this.adminService.updateAdminProducts(body as never);
  }
}

@Controller('sales')
export class SalesController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  getSalesList() {
    return this.adminService.getSalesList();
  }

  @Post('add')
  addSale(@Body() body: { sale_name: string; sale_custom_id: number; sale_discount_1?: number; sale_discount_2?: number; sale_discount_3?: number; sale_description?: string }) {
    return this.adminService.addSale(body);
  }

  @Post('edit')
  @HttpCode(200)
  editSale(@Body() body: { sale_custom_id: number; [key: string]: unknown }) {
    return this.adminService.editSale(body);
  }

  @Delete('delete')
  removeSale(@Body() body: { sale_custom_id: number }) {
    return this.adminService.removeSale(body.sale_custom_id);
  }
}

@Controller('finance')
export class FinanceController {
  constructor(private readonly adminService: AdminService) {}

  @Post()
  @HttpCode(200)
  getPaymentsByPeriod(@Body() body: { start: string; end: string; type?: number }) {
    return this.adminService.getPaymentsByPeriod(body.start, body.end, body.type);
  }
}
