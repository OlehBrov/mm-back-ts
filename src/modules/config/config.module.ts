import { Module } from '@nestjs/common';
import { ConfigStoreService } from './config.service';
import { ConfigController } from './config.controller';
import { KioskModule } from '../kiosk/kiosk.module';
import { TerminalModule } from '../terminal/terminal.module';

@Module({
  imports: [KioskModule, TerminalModule],
  controllers: [ConfigController],
  providers: [ConfigStoreService],
})
export class ConfigStoreModule {}
