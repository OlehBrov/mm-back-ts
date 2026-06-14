import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

export interface JwtPayload {
  auth_id: string;
  store_id: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('jwt.accessSecret') ?? '',
    });
  }

  async validate(payload: JwtPayload) {
    const store = await this.prisma.store.findUnique({
      where: { auth_id: payload.auth_id },
    });

    if (!store || !store.token) {
      throw new UnauthorizedException('Not authorized');
    }

    return store;
  }
}
