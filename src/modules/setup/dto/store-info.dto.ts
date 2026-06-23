import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStoreInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  store_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  store_address?: string;

  @IsOptional()
  @IsString()
  active_bank?: string;

  @IsOptional()
  @IsEmail()
  alert_email?: string | null;

  @IsOptional()
  @IsEmail()
  support_email?: string | null;

  @IsOptional()
  @IsEmail()
  feedback_email?: string | null;
}
