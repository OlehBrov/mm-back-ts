import { Module } from '@nestjs/common';
import { FiscalService } from './fiscal.service';
import { FiscalQueueProcessor } from './fiscal-queue.processor';
import { OverdueFiscalService } from './overdue-fiscal.service';
import { ReceiptBuilderService } from './receipt-builder.service';
import { FiscalController } from './fiscal.controller';

@Module({
  controllers: [FiscalController],
  providers: [FiscalService, FiscalQueueProcessor, OverdueFiscalService, ReceiptBuilderService],
  exports: [FiscalService, ReceiptBuilderService],
})
export class FiscalModule {}
