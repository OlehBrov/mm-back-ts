import { Type } from 'class-transformer';
import { IsArray, IsInt, IsString, Min, ValidateNested } from 'class-validator';

export class CartPriceLineDto {
  @IsString()
  barcode!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CartPriceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CartPriceLineDto)
  lines!: CartPriceLineDto[];
}
