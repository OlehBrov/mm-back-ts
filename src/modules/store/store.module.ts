import { Module } from '@nestjs/common';
import { StoreService } from './store.service';
import { StoreController } from './store.controller';
import { KioskModule } from '../kiosk/kiosk.module';

@Module({
  imports: [KioskModule],
  controllers: [StoreController],
  providers: [StoreService],
})
export class StoreModule {}
