import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { TelegramInitData } from './interfaces/telegram-user.interface';
import { JwtAuthService } from './jwt-auth.service';
import { TelegramAuthService } from './telegram-auth.service';

export type AuthenticatedRequest = Request & {
  telegramInitData?: TelegramInitData;
  /** 아이디·비밀번호 로그인으로 발급한 관리자 JWT */
  adminSession?: boolean;
};

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(
    private readonly telegramAuthService: TelegramAuthService,
    private readonly jwtAuthService: JwtAuthService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (this.devBypassEnabled()) {
      if (request.headers['x-dev-admin'] === 'true') {
        request.telegramInitData = this.buildConfiguredAdmin('DevAdmin', 'dev');
        return true;
      }

      const demoTelegramId = request.headers['x-demo-telegram-id'];
      if (typeof demoTelegramId === 'string' && /^\d+$/.test(demoTelegramId)) {
        request.telegramInitData = {
          user: {
            id: Number(demoTelegramId),
            first_name: 'DemoUser',
          },
          auth_date: Math.floor(Date.now() / 1000),
          hash: 'demo-user',
        };
        return true;
      }
    }

    const authorization = request.headers.authorization;
    if (typeof authorization === 'string' && authorization.startsWith('Bearer ')) {
      const token = authorization.slice('Bearer '.length).trim();
      if (token) {
        const admin = this.jwtAuthService.tryVerifyAdmin(token);
        if (admin) {
          if (!isAdminApiRequest(request)) {
            throw new UnauthorizedException('JWT 토큰이 유효하지 않습니다.');
          }
          request.adminSession = true;
          request.telegramInitData = this.buildConfiguredAdmin('Admin', 'admin-jwt');
          return true;
        }

        const payload = this.jwtAuthService.verify(token);
        request.telegramInitData = {
          user: {
            id: payload.telegramId,
            first_name: payload.firstName ?? 'User',
            username: payload.username ?? undefined,
          },
          auth_date: Math.floor(Date.now() / 1000),
          hash: 'jwt',
        };
        return true;
      }
    }

    const headerInit = request.headers['x-telegram-init-data'];
    const queryInit = request.query?.initData;
    const initData =
      (typeof headerInit === 'string' ? headerInit : undefined) ??
      (typeof queryInit === 'string' ? queryInit : undefined);

    if (!initData) {
      throw new UnauthorizedException('Telegram initData가 필요합니다.');
    }

    request.telegramInitData =
      this.telegramAuthService.validateInitData(initData);
    return true;
  }

  /**
   * X-Dev-Admin / X-Demo-Telegram-Id 는 운영에서 절대 통과하지 않는다.
   * process.env 와 설정값의 NODE_ENV 를 둘 다 확인한다.
   */
  private devBypassEnabled(): boolean {
    if (process.env.NODE_ENV === 'production') return false;
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      return false;
    }
    return this.configService.get('DEV_ADMIN_BYPASS') === 'true';
  }

  private buildConfiguredAdmin(firstName: string, hash: string): TelegramInitData {
    const raw =
      this.configService.get<string>('TELEGRAM_ADMIN_IDS', '123456789') ||
      '123456789';
    const first = raw
      .split(',')
      .map((id) => id.trim())
      .find((id) => /^\d+$/.test(id));

    return {
      user: {
        id: first ? Number(first) : 0,
        first_name: firstName,
      },
      auth_date: Math.floor(Date.now() / 1000),
      hash,
    };
  }
}

function isAdminApiRequest(request: Request): boolean {
  const raw = `${request.originalUrl ?? ''} ${request.url ?? ''}`;
  return /\/admin(\/|\?|$)/.test(raw);
}
