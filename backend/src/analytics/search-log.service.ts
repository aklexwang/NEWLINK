import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { Repository } from 'typeorm';
import { formatKstYmd } from '../stats/channel-metrics.math';
import { SearchDailyStat, SearchLog } from './analytics.entities';
import { FixedWindowRateLimiter, isBotUserAgent } from './request-actor.logic';
import { RequestActorService } from './request-actor.service';
import { buildSearchLogText } from './search-text.logic';

/** IP 하나당 1분에 기록할 수 있는 검색 수. 넘으면 조용히 기록만 건너뛴다. */
const RECORD_LIMIT_PER_MINUTE = 60;

export interface SearchRecordInput {
  query: string | null | undefined;
  resultCount: number;
  blocked: boolean;
}

/**
 * 회원 검색 기록(익명). 회원 ID·IP 는 저장하지 않는다.
 * 기록 실패는 검색 응답에 영향을 주지 않는다.
 */
@Injectable()
export class SearchLogService {
  private readonly logger = new Logger(SearchLogService.name);
  private readonly limiter = new FixedWindowRateLimiter(
    RECORD_LIMIT_PER_MINUTE,
    60_000,
  );

  constructor(
    @InjectRepository(SearchLog)
    private readonly logs: Repository<SearchLog>,
    @InjectRepository(SearchDailyStat)
    private readonly stats: Repository<SearchDailyStat>,
    private readonly actors: RequestActorService,
  ) {}

  /**
   * 요청에서 기록 여부를 판단하고 기록한다. 항상 resolve 된다(오류는 삼킨다).
   * 기록하지 않는 경우: 관리자 세션, 봇 User-Agent, 요청 과다, 이메일 모양·빈 검색어.
   * @returns 기록했으면 true
   */
  async recordFromRequest(
    req: Request,
    input: SearchRecordInput,
  ): Promise<boolean> {
    try {
      const actor = this.actors.resolve(req);
      if (actor.isAdmin) return false;
      if (isBotUserAgent(actor.userAgent)) return false;
      if (!this.limiter.allow(actor.ip || 'unknown')) return false;
      return await this.record(input);
    } catch (error) {
      this.logger.warn(
        `검색 기록 저장 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /** 판단 없이 바로 기록한다(테스트·내부용). */
  async record(input: SearchRecordInput, now: Date = new Date()): Promise<boolean> {
    const text = buildSearchLogText(input.query);
    if (!text) return false;
    const searchedOn = formatKstYmd(now);

    await this.logs.insert({
      id: randomUUID(),
      queryNormalized: text.normalized,
      queryRaw: text.raw,
      resultCount: Math.max(0, Math.floor(input.resultCount)),
      blocked: input.blocked,
      searchedOn,
      createdAt: now,
    });
    await this.bumpDaily(
      searchedOn,
      text.normalized,
      input.blocked,
      !input.blocked && input.resultCount === 0,
    );
    return true;
  }

  /**
   * 일별 집계 증가. DB 종류와 무관하게 동작하도록
   * UPDATE(+1) → 0행이면 INSERT → 동시 삽입으로 실패하면 UPDATE 한 번 더.
   */
  private async bumpDaily(
    statDate: string,
    queryNormalized: string,
    blocked: boolean,
    zero: boolean,
  ): Promise<void> {
    const increment = async (): Promise<number> => {
      const result = await this.stats
        .createQueryBuilder()
        .update(SearchDailyStat)
        .set({
          searchCount: () => 'search_count + 1',
          zeroCount: () => (zero ? 'zero_count + 1' : 'zero_count'),
          blockedCount: () => (blocked ? 'blocked_count + 1' : 'blocked_count'),
        })
        .where('stat_date = :statDate AND query_normalized = :queryNormalized', {
          statDate,
          queryNormalized,
        })
        .execute();
      return result.affected ?? 0;
    };

    if ((await increment()) > 0) return;
    try {
      await this.stats.insert({
        statDate,
        queryNormalized,
        searchCount: 1,
        zeroCount: zero ? 1 : 0,
        blockedCount: blocked ? 1 : 0,
      });
    } catch {
      await increment();
    }
  }
}
