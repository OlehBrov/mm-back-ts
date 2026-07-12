import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import {
  SetScreensaverConfigDto,
  ScreensaverMode,
  DEFAULT_CAROUSEL_INTERVAL,
} from './dto/screensaver-config.dto';

export const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
export const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov']);
const ALLOWED_EXTS = new Set([...IMAGE_EXTS, ...VIDEO_EXTS]);

export interface ScreensaverFileInfo {
  filename: string;
  type: 'image' | 'video';
  url: string;
}

export interface ScreensaverConfig {
  /** null means no config set → frontend shows default CSS screensaver */
  mode: ScreensaverMode | null;
  /** Active filename for 'static' and 'video' modes. null for 'carousel' or when unset. */
  filename: string | null;
  /** Carousel slide interval in seconds. */
  interval: number;
  /** Resolved file info. null if mode is 'carousel', not set, or file missing on disk. */
  file: ScreensaverFileInfo | null;
}

@Injectable()
export class ScreensaverService {
  private readonly logger = new Logger(ScreensaverService.name);
  readonly screensaverDir: string;
  readonly videoDir: string;
  private readonly mmHost: string;
  private readonly storeAuthId: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.screensaverDir = this.config.get<string>('images.screensaverDir') ?? 'C:/mm-images/screensavers';
    this.videoDir = path.join(this.screensaverDir, 'video');
    this.mmHost = this.config.get<string>('store.host') ?? 'http://localhost:6006';
    this.storeAuthId = this.config.get<string>('store.authId') ?? '';

    for (const dir of [this.screensaverDir, this.videoDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        this.logger.log(`Created screensaver directory: ${dir}`);
      }
    }
  }

  // ── Directory / path helpers ────────────────────────────────────────────────

  /** Returns the directory where this file lives based on its extension. */
  dirForFile(filename: string): string {
    return VIDEO_EXTS.has(path.extname(filename).toLowerCase())
      ? this.videoDir
      : this.screensaverDir;
  }

  /** Returns the full absolute path to a screensaver file. */
  fullPath(filename: string): string {
    return path.join(this.dirForFile(filename), filename);
  }

  private fileType(filename: string): 'image' | 'video' {
    return VIDEO_EXTS.has(path.extname(filename).toLowerCase()) ? 'video' : 'image';
  }

  private fileUrl(filename: string): string {
    return `${this.mmHost}/api/screensaver-file/${encodeURIComponent(filename)}`;
  }

  private toFileInfo(filename: string): ScreensaverFileInfo {
    return { filename, type: this.fileType(filename), url: this.fileUrl(filename) };
  }

  // ── File listing ─────────────────────────────────────────────────────────────

  async listFiles(): Promise<{ files: ScreensaverFileInfo[] }> {
    const [images, videos] = await Promise.all([this.listImages(), this.listVideos()]);
    return { files: [...images.files, ...videos.files] };
  }

  async listImages(): Promise<{ files: ScreensaverFileInfo[] }> {
    const entries = await fsPromises.readdir(this.screensaverDir);
    const files = entries
      .filter(f => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
      .map(filename => this.toFileInfo(filename));
    return { files };
  }

  async listVideos(): Promise<{ files: ScreensaverFileInfo[] }> {
    const entries = await fsPromises.readdir(this.videoDir);
    const files = entries
      .filter(f => VIDEO_EXTS.has(path.extname(f).toLowerCase()))
      .map(filename => this.toFileInfo(filename));
    return { files };
  }

  // ── Config ──────────────────────────────────────────────────────────────────

  async getConfig(): Promise<ScreensaverConfig> {
    const store = await this.prisma.store.findFirst({
      where: { auth_id: this.storeAuthId },
      select: { screensaver: true, screensaver_mode: true, screensaver_interval: true },
    });

    const mode = (store?.screensaver_mode as ScreensaverMode | null) ?? null;
    const filename = store?.screensaver ?? null;
    const interval = store?.screensaver_interval ?? DEFAULT_CAROUSEL_INTERVAL;

    const file = this.resolveFileInfo(mode, filename);
    return { mode, filename, interval, file };
  }

  async setConfig(dto: SetScreensaverConfigDto): Promise<ScreensaverConfig> {
    const filename = dto.mode === 'carousel' ? null : (dto.filename ?? null);
    const interval = dto.interval ?? DEFAULT_CAROUSEL_INTERVAL;

    if (dto.mode !== 'carousel') {
      if (!filename) {
        throw new BadRequestException(`filename is required for mode "${dto.mode}"`);
      }
      if (!ALLOWED_EXTS.has(path.extname(filename).toLowerCase())) {
        throw new BadRequestException('Unsupported file type');
      }
      if (dto.mode === 'video' && !VIDEO_EXTS.has(path.extname(filename).toLowerCase())) {
        throw new BadRequestException('Video mode requires a video file (.mp4, .webm, .mov)');
      }
      if (dto.mode === 'static' && !IMAGE_EXTS.has(path.extname(filename).toLowerCase())) {
        throw new BadRequestException('Static mode requires an image file');
      }
      if (!fs.existsSync(this.fullPath(filename))) {
        throw new NotFoundException(`File "${filename}" not found`);
      }
    }

    await this.prisma.store.updateMany({
      where: { auth_id: this.storeAuthId },
      data: {
        screensaver_mode: dto.mode,
        screensaver: filename,
        screensaver_interval: interval,
      },
    });

    const file = this.resolveFileInfo(dto.mode, filename);
    return { mode: dto.mode, filename, interval, file };
  }

  async clearConfig(): Promise<{ cleared: true }> {
    await this.prisma.store.updateMany({
      where: { auth_id: this.storeAuthId },
      data: { screensaver_mode: null, screensaver: null, screensaver_interval: null },
    });
    return { cleared: true };
  }

  // ── File management ──────────────────────────────────────────────────────────

  async deleteFile(filename: string): Promise<{ deleted: string }> {
    const fileDir = this.dirForFile(filename);
    const filePath = path.resolve(fileDir, filename);
    if (!filePath.startsWith(path.resolve(fileDir))) {
      throw new BadRequestException('Invalid filename');
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException(`File "${filename}" not found`);
    }

    await fsPromises.unlink(filePath);

    // If this file was the active screensaver — clear it from config
    await this.prisma.store.updateMany({
      where: { auth_id: this.storeAuthId, screensaver: filename },
      data: { screensaver: null, screensaver_mode: null },
    });

    return { deleted: filename };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private resolveFileInfo(mode: ScreensaverMode | null, filename: string | null): ScreensaverFileInfo | null {
    if (!mode || mode === 'carousel' || !filename) return null;
    if (!fs.existsSync(this.fullPath(filename))) return null;
    return this.toFileInfo(filename);
  }
}
