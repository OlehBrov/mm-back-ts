import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { ConfigStoreService } from './config.service';
import { AddCategoryDto, EditCategoryDto } from './dto/category.dto';
import { AddSubcategoryDto, EditSubcategoryDto, MoveSubcategoryDto } from './dto/subcategory.dto';
import { AddCategoryImageDto, AddStoreSaleDto, SetMerchantDto } from './dto/merchant.dto';

@Controller('config')
export class ConfigController {
  constructor(private readonly configService: ConfigStoreService) {}

  @Get('check-categories')
  checkCategories() {
    return this.configService.checkCategories();
  }

  @Post('category')
  addCategory(@Body() body: AddCategoryDto[]) {
    return this.configService.addCategory(body);
  }

  @Patch('category')
  editCategory(@Body() body: EditCategoryDto[]) {
    return this.configService.editCategory(body);
  }

  @Post('subcategory')
  addSubCategory(@Body() body: AddSubcategoryDto[]) {
    return this.configService.addSubCategory(body);
  }

  @Patch('subcategory')
  editSubCategory(@Body() body: EditSubcategoryDto[]) {
    return this.configService.editSubCategory(body);
  }

  @Post('move-subcategory')
  @HttpCode(200)
  moveSubCategory(@Body() body: MoveSubcategoryDto[]) {
    return this.configService.moveSubCategory(body);
  }

  @Post('store-sale')
  @HttpCode(201)
  addStoreSale(@Body() body: AddStoreSaleDto) {
    return this.configService.addStoreSale(body);
  }

  @Get('store-sale')
  getStoreSale() {
    return this.configService.getStoreSale();
  }

  @Get('merchant')
  getMerchantData() {
    return this.configService.getMerchantData();
  }

  @Post('merchant')
  @HttpCode(200)
  setMerchantData(@Body() body: SetMerchantDto) {
    return this.configService.setMerchantData(body);
  }

  @Post('category-image')
  @HttpCode(200)
  addCategoryImage(@Body() body: AddCategoryImageDto[]) {
    return this.configService.addCategoryImage(body);
  }
}
