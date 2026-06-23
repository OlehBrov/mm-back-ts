import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpsertFiscalConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchant_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  merchant_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fiscal_token?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  taxgrp?: number | null;
}
