import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { StoreAuthGuard } from './guards/store-auth.guard';
import { CurrentStore } from '../../common/decorators/current-store.decorator';
import { Store } from '@prisma/client';

@Controller('auth/store')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh-token')
  refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @UseGuards(StoreAuthGuard)
  @Post('logout')
  logout(@CurrentStore() store: Store) {
    return this.authService.logout(store.auth_id);
  }
}
