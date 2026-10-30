import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { JwtAuthService } from '../auth/jwt-auth.service';
import { TelegramAuthService } from '../auth/telegram-auth.service';
import {
  decideMiniAppGate,
  isOpenPath,
  miniAppGateCounters,
  miniAppGateMode,
  noteUnsignedSample,
  SlidingRateLimiter,
} from './miniapp-gate.logic';

export const MINIAPP_ONLY_MESSAGE =
  '텔레그램 미니앱에서만 이용할 수 있어요. 텔레그램에서 TellLink 봇을 열어 주세요.';

/**
 * 공개 API 문지기: 텔레그램 미니앱 서명(initData) 또는 관리자 로그인이 있어야 통과.
 * 통과한 요청은 사람(텔레그램 ID, 없으면 IP)별로 1분 요청 수를 제한한다.
 */
@Injectable()
export class MiniAppGateMiddleware implements NestMiddleware {
  private readonly logger = new Logger(MiniAppGateMiddleware.name);
  private readonly limiter = new SlidingRateLimiter();
  private deniedSinceLog = 0;
  private lastLogAt = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly telegramAuth: TelegramAuthService,
    private readonly jwtAuth: JwtAuthService,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const mode = miniAppGateMode(this.config.get<string>('MINIAPP_ONLY'));
    const enabled = mode === 'block';
    const path = req.originalUrl ?? req.url ?? '';
    if (mode === 'off' || req.method === 'OPTIONS' || isOpenPath(path)) {
      next();
      return;
    }

    const isAdmin = this.hasValidAdmin(req);
    const telegramId = isAdmin ? null : this.validInitDataUser(req);
    if (isAdmin) miniAppGateCounters.admin += 1;
    else if (telegramId != null) miniAppGateCounters.signed += 1;
    else {
      miniAppGateCounters.unsigned += 1;
      noteUnsignedSample(path, req.headers['user-agent']);
    }
    if (mode === 'watch') {
      next();
      return;
    }
    const decision = decideMiniAppGate({
      enabled,
      method: req.method,
      path,
      hasValidInitData: telegramId != null,
      hasValidAdmin: isAdmin,
    });
    if (decision === 'deny') {
      miniAppGateCounters.blocked += 1;
      this.noteDenied();
      res.status(403).json({
        statusCode: 403,
        code: 'miniapp_only',
        message: MINIAPP_ONLY_MESSAGE,
      });
      return;
    }
    if (!isAdmin) {
      const key = telegramId != null ? `u:${telegramId}` : `ip:${req.ip}`;
      if (!this.limiter.allow(key)) {
        miniAppGateCounters.rateLimited += 1;
        res.status(429).json({
          statusCode: 429,
          code: 'rate_limited',
          message: '요청이 너무 많아요. 잠시 뒤에 다시 시도해 주세요.',
        });
        return;
      }
    }
    next();
  }

  private validInitDataUser(req: Request): number | null {
    const raw = req.headers['x-telegram-init-data'];
    const initData = Array.isArray(raw) ? raw[0] : raw;
    if (!initData) return null;
    try {
      const result = this.telegramAuth.validateInitData(initData);
      return result.user?.id ?? null;
    } catch {
      return null;
    }
  }

  private hasValidAdmin(req: Request): boolean {
    const tokens = [
      req.headers['x-admin-authorization'],
      req.headers.authorization,
    ]
      .map((v) => (Array.isArray(v) ? v[0] : v))
      .filter((v): v is string => typeof v === 'string')
      .map((v) => v.replace(/^Bearer\s+/i, '').trim())
      .filter(Boolean);
    for (const token of tokens) {
      try {
        this.jwtAuth.verifyAdmin(token);
        return true;
      } catch {
        /* 다음 */
      }
    }
    return false;
  }

  /** 막은 요청은 10분에 한 번 묶어서 기록 (로그 넘침 방지) */
  private noteDenied() {
    this.deniedSinceLog += 1;
    const now = Date.now();
    if (now - this.lastLogAt > 10 * 60 * 1000) {
      this.logger.log(`미니앱 밖 공개 API 요청 ${this.deniedSinceLog}건 막음`);
      this.deniedSinceLog = 0;
      this.lastLogAt = now;
    }
  }
}
