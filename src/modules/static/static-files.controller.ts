import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { VIDEO_EXTS } from '../screensaver/screensaver.service';

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

@Controller('screensaver-file')
export class ScreensaverFileController {
  private readonly screensaverDir: string;
  private readonly videoDir: string;

  constructor(config: ConfigService) {
    this.screensaverDir = config.get<string>('images.screensaverDir') ?? 'C:/mm-images/screensavers';
    this.videoDir = path.join(this.screensaverDir, 'video');
  }

  @Get(':filename')
  serveScreensaverFile(@Param('filename') filename: string, @Res() res: Response) {
    const isVideo = VIDEO_EXTS.has(path.extname(filename).toLowerCase());
    const baseDir = isVideo ? this.videoDir : this.screensaverDir;
    const filePath = path.resolve(baseDir, filename);
    if (!filePath.startsWith(path.resolve(baseDir))) {
      throw new NotFoundException('File not found');
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`Screensaver file ${filename} not found`);
    }
    res.sendFile(filePath);
  }
}
