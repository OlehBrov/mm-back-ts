import { Module } from '@nestjs/common';
import { KioskGateway } from './kiosk.gateway';
import { KioskController } from './kiosk.controller';
import { IdleSyncService } from './idle-sync.service';
import { FiscalModule } from '../fiscal/fiscal.module';

@Module({
  imports: [FiscalModule],
  controllers: [KioskController],
  providers: [KioskGateway, IdleSyncService],
  exports: [IdleSyncService],
})
export class KioskModule {}
