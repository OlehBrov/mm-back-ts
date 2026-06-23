import { IsOptional, IsString } from 'class-validator';

export class AssignMerchantsDto {
  @IsString()
  default_merchant!: string;

  @IsOptional()
  @IsString()
  vat_merchant?: string | null;
}
