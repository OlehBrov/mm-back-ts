import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { ScreensaverService } from './screensaver.service';

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm', '.mov'];

@Controller('screensaver')
export class ScreensaverController {
  constructor(private readonly screensaverService: ScreensaverService) {}

  @Get('files')
  listFiles() {
    return this.screensaverService.listFiles();
  }

  @Get('active')
  getActive() {
    return this.screensaverService.getActive();
  }

  @Put('active')
  setActive(@Body() body: { filename: string | null }) {
    return this.screensaverService.setActive(body.filename ?? null);
  }

  @Delete(':filename')
  @HttpCode(200)
  deleteFile(@Param('filename') filename: string) {
    return this.screensaverService.deleteFile(filename);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          // Uses the same env var as ScreensaverService — directory is guaranteed to exist
          cb(null, process.env.SCREENSAVER_DIR ?? 'C:/mm-images/screensavers');
        },
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          const base = path
            .basename(file.originalname, path.extname(file.originalname))
            .replace(/[^\w\-]/g, '_')
            .slice(0, 80);
          cb(null, `${base}${ext}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ALLOWED_EXTS.includes(ext)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`File type "${ext}" is not allowed`), false);
        }
      },
      limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
    }),
  )
  uploadFile(@UploadedFile() file: { filename: string; size: number }) {
    if (!file) throw new BadRequestException('No file uploaded');
    return { filename: file.filename, size: file.size };
  }
}
