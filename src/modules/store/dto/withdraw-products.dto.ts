import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class WithdrawProductDto {
  @IsString()
  @IsNotEmpty()
  barcode!: string;

  quantity!: number | string;

  @IsOptional()
  @IsString()
  limit?: string;
}
