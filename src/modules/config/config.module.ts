import { Module } from '@nestjs/common';
import { ConfigStoreService } from './config.service';
import { ConfigController } from './config.controller';
import { KioskModule } from '../kiosk/kiosk.module';

@Module({
  imports: [KioskModule],
  controllers: [ConfigController],
  providers: [ConfigStoreService],
})
export class ConfigStoreModule {}
