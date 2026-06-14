import { IsNotEmpty, IsString } from 'class-validator';

export class SaveImageDto {
  @IsString()
  @IsNotEmpty()
  productImage!: string;

  @IsString()
  @IsNotEmpty()
  fileName!: string;
}
