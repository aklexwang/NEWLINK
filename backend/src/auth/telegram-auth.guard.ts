import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { TelegramInitData } from './interfaces/telegram-user.interface';
import { TelegramAuthService } from './telegram-auth.service';

export interface AuthenticatedRequest extends Request {
  telegramInitData?: TelegramInitData;
}

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(
    private readonly telegramAuthService: TelegramAuthService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const devBypass = this.configService.get('DEV_ADMIN_BYPASS') === 'true';
    const devHeader = request.headers['x-dev-admin'] === 'true';
    const adminAccessKey = this.configService.get<string>('ADMIN_ACCESS_KEY', '');
    const accessHeader = request.headers['x-admin-access-key'] as string | undefined;

    if (adminAccessKey && accessHeader && accessHeader === adminAccessKey) {
      request.telegramInitData = {
        user: {
          id: Number(this.configService.get('TELEGRAM_ADMIN_IDS', '123456789').split(',')[0]),
          first_name: 'Admin',
        },
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'admin-access',
      };
      return true;
    }

    if (devBypass && devHeader) {
      request.telegramInitData = {
        user: {
          id: Number(this.configService.get('TELEGRAM_ADMIN_IDS', '123456789').split(',')[0]),
          first_name: 'DevAdmin',
        },
        auth_date: Math.floor(Date.now() / 1000),
        hash: 'dev',
      };
      return true;
    }

    const initData =
      (request.headers['x-telegram-init-data'] as string) ??
      (request.query.initData as string);

    if (!initData) {
      throw new UnauthorizedException('Telegram initData가 필요합니다.');
    }

    request.telegramInitData =
      this.telegramAuthService.validateInitData(initData);
    return true;
  }
}