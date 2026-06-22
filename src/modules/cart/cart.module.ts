import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { FiscalModule } from '../fiscal/fiscal.module';

@Module({
  imports: [FiscalModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
