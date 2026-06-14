import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../database/prisma.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const store = await this.prisma.store.findUnique({
      where: { auth_id: dto.login },
    });

    if (!store) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordValid = await bcrypt.compare(dto.password, store.password ?? '');
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload = { auth_id: store.auth_id, store_id: store.id };

    const token = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.accessSecret'),
      expiresIn: '24h',
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.config.get<string>('jwt.refreshSecret'),
      expiresIn: '24h',
    });

    await this.prisma.store.update({
      where: { auth_id: dto.login },
      data: { token },
    });

    return {
      message: 'success',
      store_id: store.id,
      auth_id: store.auth_id,
      token,
      refreshToken,
      role: store.role,
    };
  }

  async refreshToken(refreshToken: string) {
    let auth_id: string;
    try {
      const decoded = this.jwtService.verify<{ auth_id: string }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      auth_id = decoded.auth_id;
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const store = await this.prisma.store.findUnique({ where: { auth_id } });
    if (!store) {
      throw new UnauthorizedException('Store not authorized');
    }

    const token = this.jwtService.sign(
      { auth_id: store.auth_id, store_id: store.id },
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: '24h',
      },
    );

    await this.prisma.store.update({ where: { auth_id }, data: { token } });

    return { message: 'Token refreshed', token };
  }

  async logout(authId: string) {
    await this.prisma.store.update({
      where: { auth_id: authId },
      data: { token: '' },
    });
    return { message: 'Logout success' };
  }
}
