import { IsOptional, IsString } from 'class-validator';

export class GetProductsQueryDto {
  @IsOptional()
  @IsString()
  filter?: string;

  @IsOptional()
  @IsString()
  subcategory?: string;

  @IsOptional()
  @IsString()
  division?: string;
}
