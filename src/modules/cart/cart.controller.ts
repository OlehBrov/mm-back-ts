import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { StoreAuthGuard } from '../auth/guards/store-auth.guard';
import { CartService } from './cart.service';
import { CartSellDto } from './dto/cart-sell.dto';

interface StoreRequest extends Request {
  user: { auth_id: string };
}

@Controller('cart')
@UseGuards(StoreAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('sell')
  @HttpCode(HttpStatus.OK)
  sell(@Req() req: StoreRequest, @Body() dto: CartSellDto) {
    return this.cartService.sellProducts(dto, req.user.auth_id);
  }

  @Delete('cancel')
  @HttpCode(HttpStatus.OK)
  cancel() {
    return this.cartService.cancelSale();
  }
}
