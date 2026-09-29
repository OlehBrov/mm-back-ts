import { Module } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminStoreController, SalesController, FinanceController } from './admin-store.controller';
import { KioskModule } from '../kiosk/kiosk.module';

@Module({
  imports: [KioskModule],
  controllers: [AdminStoreController, SalesController, FinanceController],
  providers: [AdminService],
})
export class AdminModule {}
