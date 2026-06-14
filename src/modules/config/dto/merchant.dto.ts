import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class SetMerchantDto {
  @IsString()
  defaultMerchant!: string;

  @IsString()
  vatExciseMerchant!: string;

  @IsBoolean()
  useVATbyDefault!: boolean;

  @IsBoolean()
  isSingleMerchant!: boolean;

  @IsOptional()
  @IsNumber()
  defaultMerchantTaxgrp?: number;

  @IsOptional()
  @IsNumber()
  vatExciseMerchantTaxgrp?: number;
}

export class AddStoreSaleDto {
  @IsNumber()
  store_sale_product_category!: number;

  @IsNumber()
  store_sale_product_subcategory!: number;

  @IsString()
  store_sale_name!: string;

  @IsString()
  store_sale_title!: string;

  @IsNumber()
  store_sale_discount!: number;
}

export class AddCategoryImageDto {
  @IsString()
  categoryImage!: string;

  @IsString()
  fileName!: string;

  @IsNumber()
  categoryId!: number;
}
