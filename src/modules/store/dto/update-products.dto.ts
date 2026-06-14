import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateProductDto {
  @IsString()
  @IsNotEmpty()
  barcode!: string;

  @IsOptional()
  @IsString()
  product_name?: string;

  @IsOptional()
  @IsString()
  product_code?: string;

  @IsOptional()
  @IsString()
  measure?: string;

  @IsOptional()
  @IsString()
  product_name_ru?: string;

  @IsOptional()
  @IsString()
  product_name_ua?: string;

  @IsOptional()
  @IsString()
  product_description?: string;

  @IsOptional()
  @IsString()
  product_image?: string;

  @IsOptional()
  product_price?: number | string;

  @IsOptional()
  product_discount?: number | string;

  @IsOptional()
  exposition_term?: number | string;

  @IsOptional()
  sale_id?: number | string;

  @IsOptional()
  discount_price_1?: number | string;

  @IsOptional()
  discount_price_2?: number | string;

  @IsOptional()
  discount_price_3?: number | string;

  @IsOptional()
  @IsNumber()
  combo_id?: number | null;

  @IsOptional()
  @IsNumber()
  product_category?: number;

  @IsOptional()
  @IsNumber()
  product_subcategory?: number;

  @IsOptional()
  @IsBoolean()
  is_VAT_Excise?: boolean;

  @IsOptional()
  @IsBoolean()
  excise_product?: boolean;

  @IsOptional()
  @IsBoolean()
  is_new_product?: boolean;

  @IsOptional()
  @IsNumber()
  product_division?: number;
}

export const ALLOWED_UPDATE_KEYS = [
  'barcode',
  'product_name',
  'product_code',
  'measure',
  'product_name_ru',
  'product_name_ua',
  'product_description',
  'product_image',
  'product_price',
  'product_discount',
  'exposition_term',
  'sale_id',
  'discount_price_1',
  'discount_price_2',
  'discount_price_3',
  'combo_id',
  'product_category',
  'product_subcategory',
  'is_VAT_Excise',
  'excise_product',
  'is_new_product',
  'product_division',
] as const;
