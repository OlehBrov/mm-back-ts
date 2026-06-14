import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';

@Controller('product-image')
export class ProductImageController {
  private readonly imagesDir: string;

  constructor(config: ConfigService) {
    this.imagesDir = config.get<string>('images.dir') ?? 'C:/mm-images';
  }

  @Get(':filename')
  serveProductImage(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.resolve(this.imagesDir, filename);
    if (!filePath.startsWith(path.resolve(this.imagesDir))) {
      throw new NotFoundException('Image not found');
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Image ${filename} not found`);
    }
    res.sendFile(filePath);
  }
}

@Controller('category-image')
export class CategoryImageController {
  private readonly categoryDir: string;

  constructor(config: ConfigService) {
    this.categoryDir = config.get<string>('images.categoryDir') ?? 'C:/mm-images/cat-images';
  }

  @Get(':filename')
  serveCategoryImage(@Param('filename') filename: string, @Res() res: Response) {
    const filePath = path.resolve(this.categoryDir, filename);
    if (!filePath.startsWith(path.resolve(this.categoryDir))) {
      throw new NotFoundException('Image not found');
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Image ${filename} not found`);
    }
    res.sendFile(filePath);
  }
}
