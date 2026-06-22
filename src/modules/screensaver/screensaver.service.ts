import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const ALLOWED_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

export interface ScreensaverFileInfo {
  filename: string;
  type: 'image' | 'video';
  url: string;
}

@Injectable()
export class ScreensaverService {
  private readonly logger = new Logger(ScreensaverService.name);
  readonly screensaverDir: string;
  private readonly mmHost: string;
  private readonly storeAuthId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.screensaverDir = this.config.get<string>('images.screensaverDir') ?? 'C:/mm-images/screensavers';
    this.mmHost = this.config.get<string>('store.host') ?? 'http://localhost:6006';
    this.storeAuthId = this.config.get<string>('store.authId') ?? '';

    if (!fs.existsSync(this.screensaverDir)) {
      fs.mkdirSync(this.screensaverDir, { recursive: true });
      this.logger.log(`Created screensaver directory: ${this.screensaverDir}`);
    }
  }

  private fileType(filename: string): 'image' | 'video' {
    return VIDEO_EXTS.has(path.extname(filename).toLowerCase()) ? 'video' : 'image';
  }

  private fileUrl(filename: string): string {
    return `${this.mmHost}/api/screensaver-file/${encodeURIComponent(filename)}`;
  }

  async listFiles(): Promise<{ files: ScreensaverFileInfo[] }> {
    const entries = await fsPromises.readdir(this.screensaverDir);
    const files = entries
      .filter((f) => ALLOWED_EXTS.has(path.extname(f).toLowerCase()))
      .map((filename) => ({
        filename,
        type: this.fileType(filename),
        url: this.fileUrl(filename),
      }));
    return { files };
  }

  async getActive(): Promise<{ filename: string | null; type: 'image' | 'video' | null; url: string | null }> {
    const store = await this.prisma.store.findFirst({
      where: { auth_id: this.storeAuthId },
      select: { screensaver: true },
    });

    const filename = store?.screensaver ?? null;
    if (!filename) return { filename: null, type: null, url: null };

    const filePath = path.join(this.screensaverDir, filename);
    if (!fs.existsSync(filePath)) {
      // File was deleted from disk — clear stale DB reference
      await this.prisma.store.updateMany({
        where: { auth_id: this.storeAuthId },
        data: { screensaver: null },
      });
      return { filename: null, type: null, url: null };
    }

    return { filename, type: this.fileType(filename), url: this.fileUrl(filename) };
  }

  async setActive(filename: string | null): Promise<{ filename: string | null }> {
    if (filename) {
      if (!ALLOWED_EXTS.has(path.extname(filename).toLowerCase())) {
        throw new BadRequestException('Unsupported file type');
      }
      const filePath = path.join(this.screensaverDir, filename);
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException(`File "${filename}" not found`);
      }
    }

    await this.prisma.store.updateMany({
      where: { auth_id: this.storeAuthId },
      data: { screensaver: filename },
    });

    return { filename };
  }

  async deleteFile(filename: string): Promise<{ deleted: string }> {
    const filePath = path.resolve(this.screensaverDir, filename);
    if (!filePath.startsWith(path.resolve(this.screensaverDir))) {
      throw new BadRequestException('Invalid filename');
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`File "${filename}" not found`);
    }

    await fsPromises.unlink(filePath);

    // If this file was the active screensaver — clear it
    await this.prisma.store.updateMany({
      where: { auth_id: this.storeAuthId, screensaver: filename },
      data: { screensaver: null },
    });

    return { deleted: filename };
  }
}
