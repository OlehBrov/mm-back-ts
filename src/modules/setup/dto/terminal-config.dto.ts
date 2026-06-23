import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class UpsertTerminalConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;
}
