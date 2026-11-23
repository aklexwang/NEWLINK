import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { isInviteOnlyLink } from '../channels/telegram-username';
import { ChannelCollectorService } from './channel-collector.service';
import {
  FEED_PUBLIC_REFRESH_MS,
  feedMtprotoIntervalMs,
  isRefreshDue,
} from './feed-refresh.logic';
import { MtprotoCollectorService } from './mtproto-collector.service';
import { PublicStatsService } from './public-stats.service';
import { isPreviewBlocked } from './stats-collect.logic';

const SKIP_STATUSES = new Set([
  'merged',
  'invalid',
  'gone',
  'invite_expired',
  'restricted',
]);

/**
 * 홈 피드에 고른 방은 늦으면 안 된다 → 5분마다 차례가 된 방의 새 글을 확인한다.
 * - 웹 미리보기로 읽히는 공개 채널: 15분마다 (수집 계정 안 씀)
 * - 비공개·미리보기 막힌 방: 수집 계정으로 최근 글 10개만(요청 1번), 하루 400번 안에서 나눔(최소 30분)
 */
@Injectable()
export class FeedRefreshService {
  private readonly logger = new Logger(FeedRefreshService.name);
  private running = false;
  private readonly lastQuickAt = new Map<string, number>();

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly collector: ChannelCollectorService,
    private readonly mtproto: MtprotoCollectorService,
    private readonly publicStats: PublicStatsService,
  ) {}

  @Cron('*/5 * * * *')
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || this.running) return;
    this.running = true;
    try {
      await this.refreshDue();
    } catch (error) {
      this.logger.warn(
        `홈 피드 방 새 글 확인 실패: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.running = false;
    }
  }

  async refreshDue(
    nowMs = Date.now(),
  ): Promise<{ checked: number; changed: number }> {
    const rooms = (
      await this.channelRepository.find({
        where: { status: ChannelStatus.ACTIVE, feedPicked: true },
      })
    ).filter((c) => !SKIP_STATUSES.has(c.collectStatus ?? ''));
    const isGroup = (c: Channel) => c.linkType === LinkType.GROUP;
    const needsAccount = (c: Channel) =>
      !isGroup(c) && (isInviteOnlyLink(c.link) || isPreviewBlocked(c));
    const accountRooms = rooms.filter(needsAccount);
    const groups = rooms.filter(isGroup);
    // 그룹은 대화를 읽는 데 요청이 4번쯤 들어서 4개 몫으로 센다(최소 1시간)
    const accountInterval = feedMtprotoIntervalMs(
      accountRooms.length + groups.length * 4,
    );
    const groupInterval = Math.max(60 * 60 * 1000, accountInterval);

    let checked = 0;
    let changed = 0;
    for (const room of rooms) {
      if (isGroup(room)) {
        if (!isRefreshDue(this.lastQuickAt.get(room.id), groupInterval, nowMs))
          continue;
        this.lastQuickAt.set(room.id, nowMs);
        // 그룹 대화는 정식 수집(수집 계정)으로만 읽힌다
        const result = await this.collector.collectOne(room);
        checked += 1;
        if (result.ok) changed += 1;
      } else if (needsAccount(room)) {
        if (
          !isRefreshDue(this.lastQuickAt.get(room.id), accountInterval, nowMs)
        )
          continue;
        this.lastQuickAt.set(room.id, nowMs);
        const result = await this.mtproto.refreshRecentPosts(room);
        checked += 1;
        if (result.ok && (result.newPosts ?? 0) > 0) changed += 1;
        if (!result.ok && result.reason === 'no_access') {
          // 접근 정보가 없으면 정식 수집으로 (초대 링크 확인·가입 포함, 한도 안에서)
          const full = await this.collector.collectPublicPageNow(room);
          if (full.ok) changed += 1;
        }
      } else {
        const last = room.lastCollectedAt
          ? new Date(room.lastCollectedAt).getTime()
          : null;
        if (!isRefreshDue(last, FEED_PUBLIC_REFRESH_MS, nowMs)) continue;
        const result = await this.collector.collectPublicPageNow(room);
        checked += 1;
        if (result.ok) changed += 1;
      }
    }
    if (changed > 0) this.publicStats.clearPublicCaches();
    if (checked > 0)
      this.logger.log(`홈 피드 방 새 글 확인: ${checked}개 (바뀜 ${changed})`);
    return { checked, changed };
  }
}
