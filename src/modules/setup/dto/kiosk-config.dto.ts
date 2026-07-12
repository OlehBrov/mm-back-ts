import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class KioskFiscalMerchantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  merchantId: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  merchantName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  merchantCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  token?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  taxgrp?: number;
}

export class KioskTerminalDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  terminalId?: string;
}

export class KioskFiscalDto {
  @ValidateNested()
  @Type(() => KioskFiscalMerchantDto)
  noVat: KioskFiscalMerchantDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => KioskFiscalMerchantDto)
  vat?: KioskFiscalMerchantDto | null;
}

export class SetKioskConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  storeName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  storeAddress?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  bank: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => KioskTerminalDto)
  terminal?: KioskTerminalDto;

  @ValidateNested()
  @Type(() => KioskFiscalDto)
  fiscal: KioskFiscalDto;
}
