import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { DataSource } from 'typeorm';
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
import {
  DailyDetailCounter,
  detailDailyLimit,
  isChannelDetailPath,
} from './detail-quota.logic';
import { MemberActivity } from '../member-activity/member-activity.entity';
import { AdminNotification } from '../notifications/admin-notification.entity';
import { User } from '../users/user.entity';

export const BLOCKED_MESSAGE =
  '이용이 제한된 계정이에요. 문의는 텔레그램 @kplay33 으로 부탁드려요.';
export const DETAIL_LIMIT_MESSAGE =
  '오늘 볼 수 있는 채널 상세(하루 100개)를 모두 봤어요. 내일 다시 이용해 주세요.';
const BLOCKED_REFRESH_MS = 60_000;

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
  private readonly detailCounter = new DailyDetailCounter();
  /** 어드민이 차단한 회원 (1분마다 DB에서 다시 읽음) */
  private blockedIds = new Set<number>();
  private blockedLoadedAt = 0;
  private blockedLoading: Promise<void> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly telegramAuth: TelegramAuthService,
    private readonly jwtAuth: JwtAuthService,
    private readonly dataSource: DataSource,
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
    const tgUser = isAdmin ? null : this.validInitDataUser(req);
    const telegramId = tgUser?.id ?? null;
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
    if (telegramId != null) {
      void this.refreshBlocked();
      if (this.blockedIds.has(telegramId)) {
        miniAppGateCounters.blocked += 1;
        res.status(403).json({
          statusCode: 403,
          code: 'account_blocked',
          message: BLOCKED_MESSAGE,
        });
        return;
      }
      if (isChannelDetailPath(path)) {
        const limit = detailDailyLimit(
          this.config.get<string>('DETAIL_DAILY_LIMIT'),
        );
        const count = this.detailCounter.hit(telegramId);
        if (count === limit + 1)
          void this.recordOveruse(telegramId, limit, tgUser);
        if (count > limit) {
          miniAppGateCounters.rateLimited += 1;
          res.status(429).json({
            statusCode: 429,
            code: 'detail_limit',
            message: DETAIL_LIMIT_MESSAGE,
          });
          return;
        }
      }
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

  private validInitDataUser(
    req: Request,
  ): { id: number; firstName: string | null; username: string | null } | null {
    const raw = req.headers['x-telegram-init-data'];
    const initData = Array.isArray(raw) ? raw[0] : raw;
    if (!initData) return null;
    try {
      const user = this.telegramAuth.validateInitData(initData).user;
      if (user?.id == null) return null;
      return {
        id: user.id,
        firstName: user.first_name ?? null,
        username: user.username ?? null,
      };
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

  private refreshBlocked(): Promise<void> {
    if (Date.now() - this.blockedLoadedAt < BLOCKED_REFRESH_MS)
      return Promise.resolve();
    if (this.blockedLoading) return this.blockedLoading;
    this.blockedLoading = this.dataSource
      .query('SELECT telegram_id FROM users WHERE is_blocked = true')
      .then((rows: Array<{ telegram_id: string | number }>) => {
        this.blockedIds = new Set(rows.map((r) => Number(r.telegram_id)));
        this.blockedLoadedAt = Date.now();
      })
      .catch((error: unknown) => {
        this.blockedLoadedAt = Date.now();
        this.logger.warn(
          `차단 회원 목록 읽기 실패: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.blockedLoading = null;
      });
    return this.blockedLoading;
  }

  /** 하루 상세 조회 상한을 처음 넘은 순간: 회원 활동에 남기고 어드민 종 알림 (하루 한 번) */
  private async recordOveruse(
    telegramId: number,
    limit: number,
    tgUser: { firstName: string | null; username: string | null } | null,
  ) {
    const day = this.detailCounter.today();
    // 로그인 안 한 사람도 어드민 회원 목록에서 바로 [차단]할 수 있게 "미가입" 회원으로 한 줄 올린다
    // (과다 조회한 사람만. 이미 있으면 그대로)
    try {
      await this.dataSource
        .createQueryBuilder()
        .insert()
        .into(User)
        .values({
          telegramId,
          firstName: tgUser?.firstName?.slice(0, 100) ?? null,
          username: tgUser?.username?.slice(0, 100) ?? null,
          isRegistered: false,
          isBlocked: false,
        })
        .orIgnore()
        .execute();
    } catch (error) {
      this.logger.warn(
        `과다 조회 회원 목록 추가 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await this.dataSource.getRepository(MemberActivity).insert({
        id: randomUUID(),
        telegramId,
        kind: 'overuse',
        channelId: null,
        keyword: null,
        category: null,
        createdAt: new Date(),
      });
    } catch (error) {
      this.logger.warn(
        `과다 조회 기록 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      await this.dataSource.getRepository(AdminNotification).insert({
        id: randomUUID(),
        key: `detail-overuse:${telegramId}:${day}`,
        type: 'member_overuse',
        title: `⚠️ 채널 상세 과다 조회 회원 (${telegramId})`,
        body: `오늘 채널 상세를 ${limit}개 넘게 열어 더 이상 못 보게 막았어요. 회원 관리에서 확인하고 필요하면 차단하세요.`,
        link: '/admin/users',
        readAt: null,
      });
    } catch {
      /* 같은 날 같은 회원 알림은 한 번만 (key 중복) */
    }
    this.logger.warn(`채널 상세 하루 ${limit}개 초과: 텔레그램 ${telegramId}`);
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
