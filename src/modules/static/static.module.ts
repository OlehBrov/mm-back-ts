import { Module } from '@nestjs/common';
import { ProductImageController, CategoryImageController } from './static-files.controller';
import { ReceiptProxyController } from './receipt-proxy.controller';

@Module({
  controllers: [ProductImageController, CategoryImageController, ReceiptProxyController],
})
export class StaticModule {}
