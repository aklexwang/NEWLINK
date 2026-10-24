import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';

export const ADMIN_JWT_AUDIENCE = 'admin';
const ADMIN_JWT_EXPIRES_IN = '12h';

export interface JwtPayload {
  sub: number;
  telegramId: number;
  firstName: string | null;
  username: string | null;
}

export interface AdminJwtPayload {
  sub: string;
  role: 'admin';
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

  /** 브라우저 관리자 로그인. 회원 JWT 와 audience 로 구분한다. */
  signAdmin(username: string): string {
    const payload: AdminJwtPayload = {
      sub: username,
      role: 'admin',
    };

    return this.jwtService.sign(payload, {
      expiresIn: ADMIN_JWT_EXPIRES_IN,
      audience: ADMIN_JWT_AUDIENCE,
    });
  }

  verify(token: string): JwtPayload {
    let payload: JwtPayload & { role?: string; aud?: string | string[] };
    try {
      payload = this.jwtService.verify<
        JwtPayload & { role?: string; aud?: string | string[] }
      >(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('JWT 토큰이 유효하지 않습니다.');
    }

    if (this.isAdminAudience(payload.aud) || payload.role === 'admin') {
      throw new UnauthorizedException('JWT 토큰이 유효하지 않습니다.');
    }
    if (typeof payload.telegramId !== 'number') {
      throw new UnauthorizedException('JWT 토큰이 유효하지 않습니다.');
    }

    return payload;
  }

  verifyAdmin(token: string): AdminJwtPayload {
    let payload: AdminJwtPayload;
    try {
      payload = this.jwtService.verify<AdminJwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        audience: ADMIN_JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException('JWT 토큰이 유효하지 않습니다.');
    }

    if (payload.role !== 'admin' || typeof payload.sub !== 'string' || !payload.sub) {
      throw new UnauthorizedException('JWT 토큰이 유효하지 않습니다.');
    }

    return payload;
  }

  tryVerifyAdmin(token: string): AdminJwtPayload | null {
    try {
      return this.verifyAdmin(token);
    } catch {
      return null;
    }
  }

  private isAdminAudience(audience: string | string[] | undefined): boolean {
    if (audience === ADMIN_JWT_AUDIENCE) return true;
    return Array.isArray(audience) && audience.includes(ADMIN_JWT_AUDIENCE);
  }
}
