import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AddCategoryDto {
  @IsString()
  category_name!: string;

  @IsNumber()
  cat_1C_id!: number;

  @IsOptional()
  @IsNumber()
  category_discount?: number | null;

  @IsOptional()
  @IsString()
  category_image?: string;
}

export class EditCategoryDto {
  @IsNumber()
  cat_1C_id!: number;

  @IsOptional()
  @IsString()
  category_name?: string;

  @IsOptional()
  @IsNumber()
  category_discount?: number | null;

  @IsOptional()
  @IsString()
  category_image?: string;

  @IsOptional()
  @IsNumber()
  category_priority?: number;
}
