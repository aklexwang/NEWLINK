import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SearchDailyStat, SearchLog } from './analytics.entities';
import {
  analyticsRangeDates,
  type AnalyticsRange,
} from './analytics-range.logic';

const LIST_LIMIT = 30;

export interface SearchInsightRow {
  /** 집계 기준(정규화) 검색어 */
  query: string;
  /** 사람이 읽기 쉬운 최근 원문. 원본이 이미 지워졌으면 정규화 값 */
  sample: string;
  searchCount: number;
  zeroCount: number;
  blockedCount: number;
}

export interface SearchInsights {
  range: AnalyticsRange;
  from: string;
  to: string;
  totals: { searchCount: number; zeroCount: number; blockedCount: number };
  popular: SearchInsightRow[];
  zero: SearchInsightRow[];
  blocked: SearchInsightRow[];
}

interface RawRow {
  query: string;
  searchCount: string | number;
  zeroCount: string | number;
  blockedCount: string | number;
}

/** 어드민용 검색 인사이트: 인기·결과 0건·막힌 검색어. 일별 집계 표만 읽는다. */
@Injectable()
export class SearchInsightsService {
  constructor(
    @InjectRepository(SearchDailyStat)
    private readonly stats: Repository<SearchDailyStat>,
    @InjectRepository(SearchLog)
    private readonly logs: Repository<SearchLog>,
  ) {}

  async getInsights(
    range: AnalyticsRange,
    now: Date = new Date(),
  ): Promise<SearchInsights> {
    const { from, to } = analyticsRangeDates(range, now);

    const [popularRaw, zeroRaw, blockedRaw, totalsRaw] = await Promise.all([
      this.grouped(from, to, {
        having: 'SUM(s.searchCount) - SUM(s.blockedCount) > 0',
        order: 'SUM(s.searchCount) - SUM(s.blockedCount)',
      }),
      this.grouped(from, to, {
        having: 'SUM(s.zeroCount) > 0',
        order: 'SUM(s.zeroCount)',
      }),
      this.grouped(from, to, {
        having: 'SUM(s.blockedCount) > 0',
        order: 'SUM(s.blockedCount)',
      }),
      this.stats
        .createQueryBuilder('s')
        .select('COALESCE(SUM(s.searchCount), 0)', 'searchCount')
        .addSelect('COALESCE(SUM(s.zeroCount), 0)', 'zeroCount')
        .addSelect('COALESCE(SUM(s.blockedCount), 0)', 'blockedCount')
        .where('s.statDate >= :from AND s.statDate <= :to', { from, to })
        .getRawOne<Omit<RawRow, 'query'>>(),
    ]);

    const keys = Array.from(
      new Set([...popularRaw, ...zeroRaw, ...blockedRaw].map((r) => r.query)),
    );
    const samples = await this.latestRawSamples(keys, from);
    const toRow = (row: RawRow): SearchInsightRow => ({
      query: row.query,
      sample: samples.get(row.query) ?? row.query,
      searchCount: Number(row.searchCount),
      zeroCount: Number(row.zeroCount),
      blockedCount: Number(row.blockedCount),
    });

    return {
      range,
      from,
      to,
      totals: {
        searchCount: Number(totalsRaw?.searchCount ?? 0),
        zeroCount: Number(totalsRaw?.zeroCount ?? 0),
        blockedCount: Number(totalsRaw?.blockedCount ?? 0),
      },
      popular: popularRaw.map(toRow),
      zero: zeroRaw.map(toRow),
      blocked: blockedRaw.map(toRow),
    };
  }

  private grouped(
    from: string,
    to: string,
    options: { having: string; order: string },
  ): Promise<RawRow[]> {
    return this.stats
      .createQueryBuilder('s')
      .select('s.queryNormalized', 'query')
      .addSelect('SUM(s.searchCount)', 'searchCount')
      .addSelect('SUM(s.zeroCount)', 'zeroCount')
      .addSelect('SUM(s.blockedCount)', 'blockedCount')
      .where('s.statDate >= :from AND s.statDate <= :to', { from, to })
      .groupBy('s.queryNormalized')
      .having(options.having)
      .orderBy(options.order, 'DESC')
      .addOrderBy('s.queryNormalized', 'ASC')
      .limit(LIST_LIMIT)
      .getRawMany<RawRow>();
  }

  /** 검색어별 가장 최근 원문 1개. 원본이 보관 기간 밖이면 비어 있다. */
  private async latestRawSamples(
    keys: string[],
    from: string,
  ): Promise<Map<string, string>> {
    const samples = new Map<string, string>();
    if (keys.length === 0) return samples;
    const rows = await this.logs
      .createQueryBuilder('l')
      .select('l.queryNormalized', 'query')
      .addSelect('l.queryRaw', 'raw')
      .where('l.queryNormalized IN (:...keys)', { keys })
      .andWhere('l.searchedOn >= :from', { from })
      .orderBy('l.createdAt', 'DESC')
      .limit(2000)
      .getRawMany<{ query: string; raw: string }>();
    for (const row of rows) {
      if (!samples.has(row.query)) samples.set(row.query, row.raw);
    }
    return samples;
  }
}
