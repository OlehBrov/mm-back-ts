import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CartProductDto {
  @IsNumber()
  id!: number;

  @IsOptional()
  @IsString()
  product_code?: string;

  @IsString()
  barcode!: string;

  @IsOptional()
  @IsString()
  mark?: string;

  @IsString()
  product_name!: string;

  @IsNumber()
  inCartQuantity!: number;

  @IsNumber()
  product_price!: number;

  @IsNumber()
  priceDecrement!: number;

  @IsOptional()
  @IsNumber()
  product_lot?: number;

  @IsOptional()
  @IsNumber()
  sale_id?: number;

  @IsOptional()
  @IsString()
  merchant?: string;

  @IsOptional()
  @IsBoolean()
  is_VAT_Excise?: boolean;

  @IsOptional()
  @IsBoolean()
  excise_product?: boolean;
}

export class CartSellDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartProductDto)
  cartProducts!: CartProductDto[];
}
