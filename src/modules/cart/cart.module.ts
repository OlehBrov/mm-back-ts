import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { TerminalModule } from '../terminal/terminal.module';
import { FiscalModule } from '../fiscal/fiscal.module';

@Module({
  imports: [TerminalModule, FiscalModule],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
