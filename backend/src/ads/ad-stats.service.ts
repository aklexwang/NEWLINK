import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { AdBanner } from './ad-banner.entity';
import { AdDailyStat, type AdKind } from './ad-daily-stat.entity';
import { isBannerLive } from './ad-banner.logic';
import { kstYmd } from './ad-payment.logic';
import { RankAd } from './rank-ad.entity';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AdTotals = { impressions: number; clicks: number };

/** 'YYYY-MM-DD' 를 n 일 전으로 */
export function ymdDaysAgo(today: string, days: number): string {
  const t = Date.parse(`${today}T00:00:00Z`) - days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

/** 광고 성과(노출·클릭)와 광고회원 연결 */
@Injectable()
export class AdStatsService {
  private readonly logger = new Logger(AdStatsService.name);

  constructor(
    @InjectRepository(AdDailyStat)
    private readonly statRepo: Repository<AdDailyStat>,
    @InjectRepository(AdBanner)
    private readonly bannerRepo: Repository<AdBanner>,
    @InjectRepository(RankAd)
    private readonly rankAdRepo: Repository<RankAd>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /** 오늘 칸에 노출·클릭을 더한다 (있으면 더하고 없으면 만든다) */
  private async bump(
    kind: AdKind,
    adId: string,
    field: 'impressions' | 'clicks',
  ): Promise<void> {
    const day = kstYmd(new Date());
    const sqlite = this.statRepo.manager.connection.options.type
      .toString()
      .includes('sqlite');
    const p = sqlite ? ['?', '?', '?'] : ['$1', '$2', '$3'];
    const imp = field === 'impressions' ? 1 : 0;
    const clk = field === 'clicks' ? 1 : 0;
    try {
      await this.statRepo.query(
        `INSERT INTO ad_daily_stats (ad_kind, ad_id, day, impressions, clicks)
         VALUES (${p[0]}, ${p[1]}, ${p[2]}, ${imp}, ${clk})
         ON CONFLICT (ad_kind, ad_id, day)
         DO UPDATE SET ${field} = ad_daily_stats.${field} + 1`,
        [kind, adId, day],
      );
    } catch (error) {
      this.logger.debug(
        `광고 성과 기록 실패: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /** 회원 화면이 보여 준 광고들 (한 번에 최대 20개씩) */
  async recordImpressions(input: { banners?: unknown; rank?: unknown }) {
    const pick = (raw: unknown) =>
      (Array.isArray(raw) ? raw : [])
        .filter((v): v is string => typeof v === 'string' && UUID_RE.test(v))
        .slice(0, 20);
    const banners = [...new Set(pick(input.banners))];
    const rank = [...new Set(pick(input.rank))];
    for (const id of banners) await this.bump('banner', id, 'impressions');
    for (const id of rank) await this.bump('rank', id, 'impressions');
  }

  async recordClick(kind: AdKind, adId: string) {
    if (kind === 'banner') {
      await this.bannerRepo.increment({ id: adId }, 'clicks', 1);
    } else {
      await this.rankAdRepo.increment({ id: adId }, 'clicks', 1);
    }
    await this.bump(kind, adId, 'clicks');
  }

  /** 광고 하나의 최근 days 일 (빈 날은 0) */
  async daily(kind: AdKind, adId: string, days = 14) {
    const today = kstYmd(new Date());
    const from = ymdDaysAgo(today, days - 1);
    const rows = await this.statRepo.find({
      where: { adKind: kind, adId, day: MoreThanOrEqual(from) },
    });
    const byDay = new Map(rows.map((r) => [r.day, r]));
    const out: Array<{ day: string; impressions: number; clicks: number }> = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const day = ymdDaysAgo(today, i);
      const r = byDay.get(day);
      out.push({
        day,
        impressions: r?.impressions ?? 0,
        clicks: r?.clicks ?? 0,
      });
    }
    return out;
  }

  /** 광고별 누적 노출·클릭 (어드민 목록용) */
  async totals(kind: AdKind): Promise<Map<string, AdTotals>> {
    const rows = await this.statRepo
      .createQueryBuilder('s')
      .select('s.ad_id', 'adId')
      .addSelect('SUM(s.impressions)', 'impressions')
      .addSelect('SUM(s.clicks)', 'clicks')
      .where('s.ad_kind = :kind', { kind })
      .groupBy('s.ad_id')
      .getRawMany<{
        adId: string;
        impressions: string | number;
        clicks: string | number;
      }>();
    return new Map(
      rows.map((r) => [
        r.adId,
        { impressions: Number(r.impressions), clicks: Number(r.clicks) },
      ]),
    );
  }

  /**
   * 광고회원 연결 값 확인: 비우면 null, 회원이 아니면 오류 문구.
   * 연결된 회원은 광고회원으로 표시한다.
   */
  async resolveAdvertiser(
    raw: unknown,
  ): Promise<
    { ok: true; value: number | null } | { ok: false; error: string }
  > {
    if (raw === null || raw === undefined || raw === '') {
      return { ok: true, value: null };
    }
    const id = Number(raw);
    if (!Number.isSafeInteger(id) || id <= 0) {
      return { ok: false, error: '광고회원을 다시 골라 주세요.' };
    }
    const user = await this.userRepo.findOne({ where: { telegramId: id } });
    if (!user) return { ok: false, error: '그 회원을 찾을 수 없어요.' };
    if (!user.isAdvertiser) {
      user.isAdvertiser = true;
      await this.userRepo.save(user);
    }
    return { ok: true, value: id };
  }

  /** 광고회원 이름표 (어드민 목록에 붙이기) */
  async advertiserNames(ids: number[]): Promise<Map<number, string>> {
    const unique = [...new Set(ids.filter((v) => v != null))];
    if (unique.length === 0) return new Map();
    const users = await this.userRepo.find({
      where: { telegramId: In(unique) },
      select: ['telegramId', 'firstName', 'username'],
    });
    return new Map(
      users.map((u) => [
        u.telegramId,
        u.username ? `@${u.username}` : u.firstName || String(u.telegramId),
      ]),
    );
  }

  /** 회원별 광고 요약: 광고 수·진행 중·받은 USDT 합계 (회원 관리용) */
  async advertiserSummaries(): Promise<
    Record<string, { ads: number; live: number; paidUsdt: number }>
  > {
    const now = new Date();
    const out: Record<string, { ads: number; live: number; paidUsdt: number }> =
      {};
    const add = (
      id: number | null,
      live: boolean,
      usdt: number | null,
    ): void => {
      if (id == null) return;
      const key = String(id);
      const row = (out[key] ??= { ads: 0, live: 0, paidUsdt: 0 });
      row.ads += 1;
      if (live) row.live += 1;
      row.paidUsdt += usdt ?? 0;
    };
    const banners = await this.bannerRepo.find({
      select: [
        'id',
        'advertiserTelegramId',
        'isActive',
        'startsAt',
        'endsAt',
        'paidUsdt',
      ],
    });
    for (const b of banners)
      add(b.advertiserTelegramId, isBannerLive(b, now), b.paidUsdt);
    const rankAds = await this.rankAdRepo.find();
    for (const a of rankAds)
      add(a.advertiserTelegramId, isBannerLive(a, now), a.paidUsdt);
    return out;
  }
}
