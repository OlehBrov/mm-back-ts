import { Module } from '@nestjs/common';
import { FiscalService } from './fiscal.service';
import { FiscalQueueProcessor } from './fiscal-queue.processor';
import { ReceiptBuilderService } from './receipt-builder.service';

@Module({
  providers: [FiscalService, FiscalQueueProcessor, ReceiptBuilderService],
  exports: [FiscalService, ReceiptBuilderService],
})
export class FiscalModule {}
