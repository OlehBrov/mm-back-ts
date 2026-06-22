import { Module } from '@nestjs/common';
import { ScreensaverService } from './screensaver.service';
import { ScreensaverController } from './screensaver.controller';

@Module({
  controllers: [ScreensaverController],
  providers: [ScreensaverService],
  exports: [ScreensaverService],
})
export class ScreensaverModule {}
