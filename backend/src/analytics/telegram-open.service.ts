import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import { formatKstYmd } from '../stats/channel-metrics.math';
import { ChannelOpenDaily, TelegramOpenRecent } from './analytics.entities';
import {
  FixedWindowRateLimiter,
  isBotUserAgent,
  visitorHash,
  visitorIdentity,
} from './request-actor.logic';
import { RequestActorService } from './request-actor.service';

/** 같은 사람이 같은 채널을 이 시간 안에 다시 누르면 세지 않는다. */
export const OPEN_DEDUPE_MS = 60 * 60 * 1000;
/** IP 하나당 1분에 받아줄 요청 수. 넘으면 조용히 무시한다. */
const OPEN_LIMIT_PER_MINUTE = 60;
/** 채널 존재 확인 결과 캐시 */
const CHANNEL_CACHE_TTL_MS = 5 * 60 * 1000;
const CHANNEL_CACHE_MAX = 5000;

export type OpenSkipReason =
  | 'no_secret'
  | 'admin'
  | 'bot'
  | 'rate_limited'
  | 'invalid_channel'
  | 'duplicate';

export interface OpenRecordResult {
  counted: boolean;
  skipped?: OpenSkipReason;
}

/**
 * "텔레그램에서 열기" 이동 기록.
 * 방문자 식별은 하루 단위 솔트 해시로만 하며 IP 원문은 저장하지 않는다.
 * ANALYTICS_HASH_SECRET 이 없으면 기록만 건너뛰고(경고 로그 1회) 서버는 정상 동작한다.
 */
@Injectable()
export class TelegramOpenService {
  private readonly logger = new Logger(TelegramOpenService.name);
  private readonly limiter = new FixedWindowRateLimiter(
    OPEN_LIMIT_PER_MINUTE,
    60_000,
  );
  private readonly channelCache = new Map<
    string,
    { ok: boolean; expiresAt: number }
  >();
  private warnedMissingSecret = false;

  constructor(
    private readonly config: ConfigService,
    private readonly actors: RequestActorService,
    @InjectRepository(Channel)
    private readonly channels: Repository<Channel>,
    @InjectRepository(TelegramOpenRecent)
    private readonly recent: Repository<TelegramOpenRecent>,
    @InjectRepository(ChannelOpenDaily)
    private readonly daily: Repository<ChannelOpenDaily>,
  ) {}

  /** 항상 resolve 된다. 오류는 삼키고 호출 쪽은 204 만 돌려준다. */
  async recordFromRequest(
    req: Request,
    channelId: string,
    now: Date = new Date(),
  ): Promise<OpenRecordResult> {
    try {
      return await this.record(req, channelId, now);
    } catch (error) {
      this.logger.warn(
        `이동 기록 저장 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { counted: false };
    }
  }

  private async record(
    req: Request,
    channelId: string,
    now: Date,
  ): Promise<OpenRecordResult> {
    const secret = (
      this.config.get<string>('ANALYTICS_HASH_SECRET') ?? ''
    ).trim();
    if (!secret) {
      if (!this.warnedMissingSecret) {
        this.warnedMissingSecret = true;
        this.logger.warn(
          'ANALYTICS_HASH_SECRET 이 설정되지 않아 텔레그램 이동 기록을 건너뜁니다.',
        );
      }
      return { counted: false, skipped: 'no_secret' };
    }

    const actor = this.actors.resolve(req);
    if (actor.isAdmin) return { counted: false, skipped: 'admin' };
    if (isBotUserAgent(actor.userAgent)) {
      return { counted: false, skipped: 'bot' };
    }
    if (!this.limiter.allow(actor.ip || 'unknown', now.getTime())) {
      return { counted: false, skipped: 'rate_limited' };
    }
    if (!(await this.isCountableChannel(channelId, now.getTime()))) {
      return { counted: false, skipped: 'invalid_channel' };
    }

    const today = formatKstYmd(now);
    const hash = visitorHash(secret, today, visitorIdentity(actor));
    if (!(await this.claimWindow(channelId, hash, now))) {
      return { counted: false, skipped: 'duplicate' };
    }
    await this.bumpDaily(channelId, today);
    return { counted: true };
  }

  /**
   * 1시간 창을 원자적으로 선점한다.
   * 창이 지났으면 UPDATE 가 1행을 바꾸고, 행이 없으면 INSERT 한다.
   * 같은 순간 두 요청이 와도 한쪽만 선점에 성공한다(UPDATE 조건 / 기본키 중복).
   */
  private async claimWindow(
    channelId: string,
    hash: string,
    now: Date,
  ): Promise<boolean> {
    const threshold = new Date(now.getTime() - OPEN_DEDUPE_MS);
    const updated = await this.recent
      .createQueryBuilder()
      .update(TelegramOpenRecent)
      .set({ lastCountedAt: now })
      .where(
        'channel_id = :channelId AND visitor_hash = :hash AND last_counted_at <= :threshold',
        { channelId, hash, threshold },
      )
      .execute();
    if ((updated.affected ?? 0) > 0) return true;

    try {
      await this.recent.insert({
        channelId,
        visitorHash: hash,
        lastCountedAt: now,
      });
      return true;
    } catch {
      // 이미 최근 행이 있거나(중복) 동시에 다른 요청이 먼저 넣었다.
      return false;
    }
  }

  private async bumpDaily(channelId: string, openDate: string): Promise<void> {
    const increment = async (): Promise<number> => {
      const result = await this.daily
        .createQueryBuilder()
        .update(ChannelOpenDaily)
        .set({ openCount: () => 'open_count + 1' })
        .where('channel_id = :channelId AND open_date = :openDate', {
          channelId,
          openDate,
        })
        .execute();
      return result.affected ?? 0;
    };

    if ((await increment()) > 0) return;
    try {
      await this.daily.insert({ channelId, openDate, openCount: 1 });
    } catch {
      await increment();
    }
  }

  /** 공개 중인 채널만 센다. 결과는 5분 캐시한다. */
  private async isCountableChannel(
    channelId: string,
    nowMs: number,
  ): Promise<boolean> {
    const cached = this.channelCache.get(channelId);
    if (cached && cached.expiresAt > nowMs) return cached.ok;

    const ok = await this.channels.exist({
      where: { id: channelId, status: ChannelStatus.ACTIVE },
    });
    if (this.channelCache.size >= CHANNEL_CACHE_MAX) this.channelCache.clear();
    this.channelCache.set(channelId, {
      ok,
      expiresAt: nowMs + CHANNEL_CACHE_TTL_MS,
    });
    return ok;
  }
}
