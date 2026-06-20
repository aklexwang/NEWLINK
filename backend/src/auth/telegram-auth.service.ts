import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import {
  TelegramInitData,
  TelegramUser,
} from './interfaces/telegram-user.interface';

@Injectable()
export class TelegramAuthService {
  private readonly botToken: string;
  private readonly maxAuthAgeSeconds = 86400;

  constructor(private readonly configService: ConfigService) {
    this.botToken = this.configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
  }

  validateInitData(initData: string): TelegramInitData {
    if (!initData) {
      throw new UnauthorizedException('initData가 필요합니다.');
    }

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      throw new UnauthorizedException('initData hash가 없습니다.');
    }

    params.delete('hash');

    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = createHmac('sha256', 'WebAppData')
      .update(this.botToken)
      .digest();

    const calculatedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      throw new UnauthorizedException('initData 무결성 검증에 실패했습니다.');
    }

    const authDate = Number(params.get('auth_date'));
    const now = Math.floor(Date.now() / 1000);

    if (!authDate || now - authDate > this.maxAuthAgeSeconds) {
      throw new UnauthorizedException('initData가 만료되었습니다.');
    }

    const userRaw = params.get('user');
    if (!userRaw) {
      throw new UnauthorizedException('사용자 정보가 없습니다.');
    }

    let user: TelegramUser;
    try {
      user = JSON.parse(userRaw) as TelegramUser;
    } catch {
      throw new UnauthorizedException('사용자 정보 파싱에 실패했습니다.');
    }

    return {
      user,
      auth_date: authDate,
      hash,
      query_id: params.get('query_id') ?? undefined,
      chat_instance: params.get('chat_instance') ?? undefined,
      chat_type: params.get('chat_type') ?? undefined,
      start_param: params.get('start_param') ?? undefined,
    };
  }

  isAdmin(userId: number): boolean {
    const adminIds = this.configService
      .get<string>('TELEGRAM_ADMIN_IDS', '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
      .map(Number);

    return adminIds.includes(userId);
  }
}
