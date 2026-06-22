import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SetFiscalTokensDto {
  @IsString()
  @IsNotEmpty()
  token!: string;

  @IsString()
  @IsOptional()
  tokenVat?: string | null;
}
