import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export type ScreensaverMode = 'static' | 'carousel' | 'video';
export const SCREENSAVER_MODES: ScreensaverMode[] = ['static', 'carousel', 'video'];
export const DEFAULT_CAROUSEL_INTERVAL = 30;

export class SetScreensaverConfigDto {
  @IsIn(SCREENSAVER_MODES)
  mode: ScreensaverMode;

  /** Required for 'static' and 'video' modes; ignored for 'carousel'. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  filename?: string | null;

  /** Carousel slide interval in seconds. Default: 30. */
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3600)
  interval?: number;
}
