import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class AddProductDto {
  @IsString()
  @IsNotEmpty()
  product_name!: string;

  @IsString()
  @IsNotEmpty()
  barcode!: string;

  @IsString()
  @IsNotEmpty()
  measure!: string;

  @IsString()
  @IsNotEmpty()
  product_code!: string;

  @IsString()
  @IsNotEmpty()
  product_name_ua!: string;

  @IsOptional()
  @IsString()
  product_name_ru?: string;

  @IsOptional()
  @IsString()
  product_description?: string;

  product_left!: string | number;

  @IsOptional()
  @IsString()
  product_image?: string;

  product_price!: string | number;

  exposition_term!: string | number;

  sale_id!: string | number;

  @IsOptional()
  @IsBoolean()
  is_VAT_Excise?: boolean;

  @IsOptional()
  @IsBoolean()
  excise_product?: boolean;

  product_category!: string | number;

  product_subcategory!: string | number;

  @IsOptional()
  @IsNumber()
  combo_id?: number | null;

  @IsOptional()
  @IsString()
  child_product_barcode?: string | null;

  @IsOptional()
  @IsBoolean()
  is_new_product?: boolean;

  @IsOptional()
  product_division?: string | number;
}
