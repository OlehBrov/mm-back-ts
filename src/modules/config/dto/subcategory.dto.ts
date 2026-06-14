import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AddSubcategoryDto {
  @IsNumber()
  cat_1C_id!: number;

  @IsNumber()
  subcat_1C_id!: number;

  @IsString()
  subcategory_name!: string;

  @IsOptional()
  @IsNumber()
  subcategory_discount?: number | null;
}

export class EditSubcategoryDto {
  @IsNumber()
  cat_1C_id!: number;

  @IsNumber()
  subcat_1C_id!: number;

  @IsOptional()
  @IsString()
  subcategory_name?: string;

  @IsOptional()
  @IsNumber()
  subcategory_discount?: number | null;

  @IsOptional()
  @IsNumber()
  new_subcat_1C_id?: number;

  @IsOptional()
  @IsNumber()
  new_cat_1C_id?: number;
}

export class MoveSubcategoryDto {
  @IsNumber()
  cat_1C_id!: number;

  @IsNumber()
  subcat_1C_id!: number;

  @IsNumber()
  new_cat_1C_id!: number;

  @IsOptional()
  @IsString()
  subcat_name?: string;
}
