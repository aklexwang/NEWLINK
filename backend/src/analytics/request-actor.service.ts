import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthService } from '../auth/jwt-auth.service';
import { TelegramAuthService } from '../auth/telegram-auth.service';

export interface RequestActor {
  /** 관리자 세션이면 true (검색·이동 기록에서 제외) */
  isAdmin: boolean;
  /** 로그인한 회원의 텔레그램 ID. 비로그인이면 null. 저장하지 않고 해시에만 쓴다. */
  memberId: number | null;
  ip: string;
  userAgent: string;
  acceptLanguage: string;
}

function headerValue(req: Request, name: string): string {
  const value = req.headers[name];
  if (Array.isArray(value)) return (value[0] ?? '').trim();
  return (value ?? '').trim();
}

/**
 * 공개 API 에서 "선택적 로그인"을 해석한다. 토큰이 없거나 잘못돼도 오류를 던지지 않는다.
 * 검색 기록·이동 기록이 관리자 테스트 클릭으로 오염되지 않게 관리자를 가려내는 데 쓴다.
 */
@Injectable()
export class RequestActorService {
  constructor(
    private readonly jwtAuth: JwtAuthService,
    private readonly telegramAuth: TelegramAuthService,
  ) {}

  resolve(req: Request): RequestActor {
    let isAdmin = false;
    let memberId: number | null = null;

    const authorization = headerValue(req, 'authorization');
    const token = authorization.toLowerCase().startsWith('bearer ')
      ? authorization.slice(7).trim()
      : '';
    if (token) {
      if (this.jwtAuth.tryVerifyAdmin(token)) {
        isAdmin = true;
      } else {
        try {
          const payload = this.jwtAuth.verify(token);
          memberId = payload.telegramId;
          if (this.telegramAuth.isAdmin(payload.telegramId)) isAdmin = true;
        } catch {
          // 비로그인으로 취급
        }
      }
    }

    if (!isAdmin && memberId === null) {
      const initData = headerValue(req, 'x-telegram-init-data');
      if (initData) {
        try {
          const parsed = this.telegramAuth.validateInitData(initData);
          memberId = parsed.user.id;
          if (this.telegramAuth.isAdmin(parsed.user.id)) isAdmin = true;
        } catch {
          // 비로그인으로 취급
        }
      }
    }

    return {
      isAdmin,
      memberId,
      ip: (req.ip || req.socket?.remoteAddress || '').trim(),
      userAgent: headerValue(req, 'user-agent'),
      acceptLanguage: headerValue(req, 'accept-language'),
    };
  }
}
