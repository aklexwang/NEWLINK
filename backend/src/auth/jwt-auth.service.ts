import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';

export interface JwtPayload {
  sub: number;
  telegramId: number;
  firstName: string | null;
  username: string | null;
}

@Injectable()
export class JwtAuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  sign(user: User): string {
    const payload: JwtPayload = {
      sub: user.telegramId,
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
    };

    return this.jwtService.sign(payload);
  }

  verify(token: string): JwtPayload {
    try {
      return this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('JWT 토큰이 유효하지 않습니다.');
    }
  }
}
