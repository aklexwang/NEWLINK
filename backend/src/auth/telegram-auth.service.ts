import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import {
  TelegramInitData,
  TelegramUser,
} from './interfaces/telegram-user.interface';
import { TelegramLoginWidgetDto } from './dto/telegram-login-widget.dto';

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

    // Telegram 문서는 키 알파벳 순(로케일 비의존) 정렬을 요구합니다.
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
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

  /**
   * Telegram Login Widget 검증
   * @see https://core.telegram.org/widgets/login#checking-authorization
   */
  validateLoginWidget(payload: TelegramLoginWidgetDto): TelegramUser {
    const { hash, ...rest } = payload;
    if (!hash) {
      throw new UnauthorizedException('로그인 hash가 없습니다.');
    }

    const dataCheckString = Object.entries(rest)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');

    const secretKey = createHash('sha256').update(this.botToken).digest();
    const calculatedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      throw new UnauthorizedException('Telegram 로그인 검증에 실패했습니다.');
    }

    const now = Math.floor(Date.now() / 1000);
    if (!payload.auth_date || now - payload.auth_date > this.maxAuthAgeSeconds) {
      throw new UnauthorizedException('Telegram 로그인이 만료되었습니다.');
    }

    return {
      id: payload.id,
      first_name: payload.first_name,
      last_name: payload.last_name,
      username: payload.username,
      photo_url: payload.photo_url,
    };
  }

  /** BotFather Web Login Client ID (보통 봇 숫자 ID) */
  getLoginClientId(): number {
    const fromEnv = this.configService.get<string>('TELEGRAM_CLIENT_ID')?.trim();
    if (fromEnv && /^\d+$/.test(fromEnv)) {
      return Number(fromEnv);
    }
    const botId = this.botToken.split(':')[0];
    if (!botId || !/^\d+$/.test(botId)) {
      throw new UnauthorizedException('TELEGRAM_BOT_TOKEN에서 Client ID를 읽을 수 없습니다.');
    }
    return Number(botId);
  }

  /**
   * 신규 Telegram Login (OIDC) id_token 검증
   * @see https://core.telegram.org/widgets/login
   */
  async validateOidcIdToken(idToken: string): Promise<TelegramUser> {
    if (!idToken) {
      throw new UnauthorizedException('id_token이 필요합니다.');
    }

    const clientId = this.getLoginClientId();
    const JWKS = createRemoteJWKSet(
      new URL('https://oauth.telegram.org/.well-known/jwks.json'),
    );

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(idToken, JWKS, {
        issuer: 'https://oauth.telegram.org',
        audience: String(clientId),
      });
      payload = verified.payload;
    } catch {
      throw new UnauthorizedException('Telegram id_token 검증에 실패했습니다.');
    }

    const id = Number(payload.id ?? payload.sub);
    if (!Number.isFinite(id) || id <= 0) {
      throw new UnauthorizedException('Telegram 사용자 ID가 없습니다.');
    }

    const givenName =
      typeof payload.given_name === 'string'
        ? payload.given_name
        : typeof payload.name === 'string'
          ? payload.name.split(' ')[0]
          : 'User';

    return {
      id,
      first_name: givenName,
      last_name: typeof payload.family_name === 'string' ? payload.family_name : undefined,
      username:
        typeof payload.preferred_username === 'string'
          ? payload.preferred_username
          : undefined,
      photo_url: typeof payload.picture === 'string' ? payload.picture : undefined,
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
