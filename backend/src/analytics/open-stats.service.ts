import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Channel } from '../channels/channel.entity';
import { addKstDays, formatKstYmd } from '../stats/channel-metrics.math';
import { ChannelOpenDaily } from './analytics.entities';
import {
  analyticsRangeDates,
  type AnalyticsRange,
} from './analytics-range.logic';

export interface OpenRankingRow {
  channelId: string;
  title: string;
  link: string;
  category: string;
  opens: number;
}

export interface ChannelOpenSummary {
  channelId: string;
  today: number;
  last7d: number;
  last30d: number;
  /** 최근 30일 일별 이동 수(오래된 날 → 오늘, 0 인 날 포함) */
  daily: Array<{ date: string; count: number }>;
}

/** 어드민 전용: 많이 이동한 채널 순위와 채널별 이동 수 */
@Injectable()
export class OpenStatsService {
  constructor(
    @InjectRepository(ChannelOpenDaily)
    private readonly daily: Repository<ChannelOpenDaily>,
    @InjectRepository(Channel)
    private readonly channels: Repository<Channel>,
  ) {}

  async ranking(
    range: AnalyticsRange,
    limit = 50,
    now: Date = new Date(),
  ): Promise<{ range: AnalyticsRange; from: string; to: string; items: OpenRankingRow[] }> {
    const { from, to } = analyticsRangeDates(range, now);
    const safeLimit = Math.min(Math.max(Math.floor(limit) || 50, 1), 200);

    const raw = await this.daily
      .createQueryBuilder('d')
      .select('d.channelId', 'channelId')
      .addSelect('SUM(d.openCount)', 'opens')
      .where('d.openDate >= :from AND d.openDate <= :to', { from, to })
      .groupBy('d.channelId')
      .orderBy('SUM(d.openCount)', 'DESC')
      .addOrderBy('d.channelId', 'ASC')
      .limit(safeLimit)
      .getRawMany<{ channelId: string; opens: string | number }>();

    const ids = raw.map((row) => row.channelId);
    const channels = ids.length
      ? await this.channels.find({
          where: { id: In(ids) },
          select: ['id', 'title', 'link', 'category'],
        })
      : [];
    const byId = new Map(channels.map((channel) => [channel.id, channel]));

    const items: OpenRankingRow[] = [];
    for (const row of raw) {
      const channel = byId.get(row.channelId);
      if (!channel) continue; // 삭제된 채널은 순위에서 뺀다(정리 크론이 곧 지운다)
      items.push({
        channelId: row.channelId,
        title: channel.title,
        link: channel.link,
        category: channel.category,
        opens: Number(row.opens),
      });
    }
    return { range, from, to, items };
  }

  async channelSummary(
    channelId: string,
    now: Date = new Date(),
  ): Promise<ChannelOpenSummary> {
    const to = formatKstYmd(now);
    const from = addKstDays(to, -29);
    const rows = await this.daily
      .createQueryBuilder('d')
      .select('d.openDate', 'date')
      .addSelect('d.openCount', 'count')
      .where('d.channelId = :channelId', { channelId })
      .andWhere('d.openDate >= :from AND d.openDate <= :to', { from, to })
      .getRawMany<{ date: string; count: string | number }>();

    const counts = new Map(rows.map((row) => [row.date, Number(row.count)]));
    const daily: Array<{ date: string; count: number }> = [];
    for (let offset = -29; offset <= 0; offset += 1) {
      const date = offset === 0 ? to : addKstDays(to, offset);
      daily.push({ date, count: counts.get(date) ?? 0 });
    }
    const sumLast = (days: number) =>
      daily.slice(-days).reduce((sum, row) => sum + row.count, 0);
    return {
      channelId,
      today: sumLast(1),
      last7d: sumLast(7),
      last30d: sumLast(30),
      daily,
    };
  }
}
