import { Module } from '@nestjs/common';
import { ProductImageController, CategoryImageController, ScreensaverFileController } from './static-files.controller';
import { ReceiptProxyController } from './receipt-proxy.controller';

@Module({
  controllers: [ProductImageController, CategoryImageController, ScreensaverFileController, ReceiptProxyController],
})
export class StaticModule {}
