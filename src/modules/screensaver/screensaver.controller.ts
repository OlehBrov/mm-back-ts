import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import { ScreensaverService, VIDEO_EXTS, IMAGE_EXTS } from './screensaver.service';
import { SetScreensaverConfigDto } from './dto/screensaver-config.dto';

const ALLOWED_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

@Controller('screensaver')
export class ScreensaverController {
  constructor(private readonly screensaverService: ScreensaverService) {}

  // ── File listing ─────────────────────────────────────────────────────────────

  /** All screensaver files (images + videos). */
  @Get('files')
  listFiles() {
    return this.screensaverService.listFiles();
  }

  /** Only image files from the screensaver directory. */
  @Get('images')
  listImages() {
    return this.screensaverService.listImages();
  }

  /** Only video files from the screensaver/video directory. */
  @Get('videos')
  listVideos() {
    return this.screensaverService.listVideos();
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  /**
   * Get current screensaver config.
   * mode: 'static' | 'carousel' | 'video' | null
   * null means no config set → frontend shows default CSS screensaver.
   */
  @Get('config')
  getConfig() {
    return this.screensaverService.getConfig();
  }

  /**
   * Save screensaver config.
   * - mode 'static': filename required (image file)
   * - mode 'video':  filename required (video file)
   * - mode 'carousel': interval (seconds, default 30), filename ignored
   */
  @Post('config')
  @HttpCode(200)
  setConfig(@Body() dto: SetScreensaverConfigDto) {
    return this.screensaverService.setConfig(dto);
  }

  /** Clear screensaver config — reverts to default CSS screensaver. */
  @Delete('config')
  @HttpCode(200)
  clearConfig() {
    return this.screensaverService.clearConfig();
  }

  // ── File management ──────────────────────────────────────────────────────────

  @Delete('file/:filename')
  @HttpCode(200)
  deleteFile(@Param('filename') filename: string) {
    return this.screensaverService.deleteFile(filename);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          const baseDir = process.env.SCREENSAVER_DIR ?? 'C:/mm-images/screensavers';
          cb(null, VIDEO_EXTS.has(ext) ? path.join(baseDir, 'video') : baseDir);
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
        if (ALLOWED_EXTS.has(ext)) {
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
