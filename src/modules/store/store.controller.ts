import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  NotFoundException,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { StoreAuthGuard } from '../auth/guards/store-auth.guard';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Store } from '@prisma/client';
import { StoreService } from './store.service';
import { GetProductsQueryDto } from './dto/get-products-query.dto';
import { AddProductDto } from './dto/add-products.dto';
import { WithdrawProductDto } from './dto/withdraw-products.dto';
import { UpdateProductDto } from './dto/update-products.dto';
import { SaveImageDto } from './dto/save-image.dto';

@Controller('products')
export class StoreController {
  private readonly logger = new Logger(StoreController.name);

  constructor(private readonly storeService: StoreService) {}

  @Get()
  @UseGuards(StoreAuthGuard)
  getAllStoreProducts(@CurrentStore() store: Store, @Query() query: GetProductsQueryDto) {
    return this.storeService.getAllStoreProducts(store, query);
  }

  @Get('search')
  @UseGuards(StoreAuthGuard)
  searchProducts(@CurrentStore() store: Store, @Query('searchQuery') searchQuery: string) {
    return this.storeService.searchProducts(store, searchQuery);
  }

  @Get('product')
  getProductById(@Query('comboId') comboId: string) {
    const id = parseInt(comboId);
    if (isNaN(id)) throw new BadRequestException('Invalid comboId');
    return this.storeService.getProductById(id);
  }

  @Get('single')
  @UseGuards(StoreAuthGuard)
  async getSingleProduct(@CurrentStore() store: Store, @Query('barcode') barcode: string) {
    this.logger.log(
      `[SCAN] Incoming request: barcode=${JSON.stringify(barcode)} (type=${typeof barcode}) store_auth_id=${store?.auth_id}`,
    );
    const result = await this.storeService.getSingleProduct(store, barcode);
    if ('errStatus' in result && result.errStatus === 404) {
      this.logger.warn(`[SCAN] No product matched barcode=${JSON.stringify(barcode)}`);
      throw new NotFoundException(result.message);
    }
    this.logger.log(
      `[SCAN] Matched product: id=${result.product?.id} name=${result.product?.product_name} barcode=${result.product?.barcode} product_left=${result.product?.product_left}`,
    );
    return result;
  }

  @Post('add')
  addProducts(@Body() products: AddProductDto[]) {
    if (!Array.isArray(products)) throw new BadRequestException('Body must be an array');
    return this.storeService.addProducts(products);
  }

  @Post('withdraw')
  @HttpCode(200)
  withdrawProducts(@Body() products: WithdrawProductDto[]) {
    if (!Array.isArray(products)) throw new BadRequestException('Body must be an array');
    return this.storeService.withdrawProducts(products);
  }

  @Post('inventarization')
  @HttpCode(200)
  inventarizationWithdraw() {
    return this.storeService.inventarizationWithdraw();
  }

  @Post('image')
  @HttpCode(200)
  saveImage(@Body() items: SaveImageDto[]) {
    if (!Array.isArray(items)) throw new BadRequestException('Body must be an array');
    return this.storeService.saveProductImages(items);
  }

  @Post('update')
  @HttpCode(201)
  updateProducts(@Body() products: UpdateProductDto[]) {
    if (!Array.isArray(products)) throw new BadRequestException('Body must be an array');
    return this.storeService.updateProducts(products);
  }
}
