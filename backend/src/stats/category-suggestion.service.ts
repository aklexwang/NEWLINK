import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CategoryEntity } from '../categories/category.entity';
import { ChannelsService } from '../channels/channels.service';
import { ChannelEvent } from './channel-event.entity';
import { PublicStatsService } from './public-stats.service';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import { AdminNotificationService } from '../notifications/admin-notification.service';
import { ChannelCategoryService } from './channel-category.service';
import {
  suggestionAlertKey,
  suggestionsToAlert,
  type SuggestionRow,
} from './category-suggestion.logic';

/** 새 카테고리 후보(AI 가 "목록에 맞는 게 없다"며 제안한 이름) 모아 보기·알림·다시 분류 */
const PENDING_CATEGORY_NAME = '분류대기';
/** 분류대기 [AI로 분류하기] 버튼: 이 확신 이상이면 AI 추측 카테고리로 옮긴다 */
const MANUAL_PENDING_MIN_CONFIDENCE = 0.5;

@Injectable()
export class CategorySuggestionService {
  private readonly logger = new Logger(CategorySuggestionService.name);

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly channelCategory: ChannelCategoryService,
    private readonly categoryAi: CategoryAiService,
    private readonly notifications: AdminNotificationService,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    private readonly channelsService: ChannelsService,
    private readonly publicStats: PublicStatsService,
  ) {}

  /**
   * 후보 이름으로 묶인 채널을 그 이름의 카테고리로 바로 옮긴다(AI 다시 묻지 않음).
   * AI 가 이미 이 이름을 제안했으므로 그대로 따른다. 카테고리가 있어야 한다.
   */
  async moveByName(name: string): Promise<{ moved: number }> {
    const category = await this.categoryRepository.findOne({ where: { name } });
    if (!category) return { moved: 0 };
    const channels = await this.channelRepository.find({
      where: {
        status: ChannelStatus.ACTIVE,
        categoryLocked: false,
        suggestedCategory: name,
      },
      select: ['id', 'category'],
    });
    if (channels.length === 0) return { moved: 0 };
    const ids = channels.map((c) => c.id);
    await this.channelRepository.update(
      { id: In(ids) },
      { category: name, suggestedCategory: null },
    );
    const now = new Date();
    await this.eventRepository.save(
      channels
        .filter((c) => c.category !== name)
        .map((c) => ({
          channelId: c.id,
          type: 'category_changed',
          before: c.category,
          after: name,
          occurredAt: now,
        })),
      { chunk: 200 },
    );
    this.publicStats.clearPublicCaches();
    this.channelsService.clearRankingCountsCache();
    this.logger.log(`새 카테고리 "${name}"(으)로 ${ids.length}개 옮김`);
    return { moved: ids.length };
  }

  /**
   * 한 카테고리 안의 방들을 AI 로 다시 확인한다(잘못 들어간 방 고치기). 최대 300개.
   * 관리자가 직접 고정한 방(category_locked)은 건드리지 않는다.
   */
  async reclassifyCategory(name: string): Promise<{
    total: number;
    changed: Array<{ title: string; from: string; to: string }>;
  }> {
    this.categoryAi.clearCategoryNamesCache();
    const channels = await this.channelRepository.find({
      where: {
        status: ChannelStatus.ACTIVE,
        categoryLocked: false,
        category: name,
      },
      take: 300,
    });
    const changed: Array<{ title: string; from: string; to: string }> = [];
    for (const channel of channels) {
      const before = channel.category;
      const next = await this.channelCategory.classifyOne(channel, {
        force: true,
        // 어드민이 분류대기에서 직접 누른 경우만 50% 확신이면 옮긴다(자동 분류는 70% 그대로)
        minConfidence:
          name === PENDING_CATEGORY_NAME
            ? MANUAL_PENDING_MIN_CONFIDENCE
            : undefined,
      });
      if (next.category !== before) {
        changed.push({ title: channel.title, from: before, to: next.category });
      }
    }
    if (changed.length) {
      this.publicStats.clearPublicCaches();
      this.channelsService.clearRankingCountsCache();
    }
    this.logger.log(
      `카테고리 "${name}" AI 재확인: ${changed.length}/${channels.length} 바뀜`,
    );
    return { total: channels.length, changed };
  }

  /** 카테고리별 채널 수: 등록된 전체(활성) / 회원 화면에 보이는 수 */
  async categoryCounts(): Promise<
    Record<string, { total: number; visible: number }>
  > {
    const rows = await this.channelRepository
      .createQueryBuilder('c')
      .select('c.category', 'name')
      .addSelect('COUNT(*)', 'count')
      .where('c.status = :status', { status: ChannelStatus.ACTIVE })
      .groupBy('c.category')
      .getRawMany<{ name: string; count: string | number }>();
    const visible = await this.channelsService.getRankingCounts();
    const out: Record<string, { total: number; visible: number }> = {};
    for (const row of rows) {
      out[row.name] = {
        total: Number(row.count),
        visible: visible[row.name] ?? 0,
      };
    }
    return out;
  }

  private baseQuery() {
    return this.channelRepository
      .createQueryBuilder('c')
      .where('c.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('c.category_locked = :locked', { locked: false })
      .andWhere('c.suggested_category IS NOT NULL');
  }

  /** 후보 이름별 채널 수(많은 순)와 예시 채널 3개 */
  async summary(): Promise<
    Array<
      SuggestionRow & {
        samples: Array<{
          title: string;
          username: string | null;
          category: string;
        }>;
      }
    >
  > {
    const rows = await this.baseQuery()
      .select('c.suggested_category', 'name')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.suggested_category')
      .orderBy('COUNT(*)', 'DESC')
      .limit(50)
      .getRawMany<{ name: string; count: string | number }>();
    const result = [];
    for (const row of rows) {
      const samples = await this.baseQuery()
        .andWhere('c.suggested_category = :name', { name: row.name })
        .select(['c.title', 'c.username', 'c.category'])
        .orderBy('c.member_count', 'DESC', 'NULLS LAST')
        .take(3)
        .getMany();
      result.push({
        name: row.name,
        count: Number(row.count),
        samples: samples.map((c) => ({
          title: c.title,
          username: c.username,
          category: c.category,
        })),
      });
    }
    return result;
  }

  /** 5개 이상 모인 후보를 어드민 알림으로(이름마다 한 번) */
  async checkAlerts(): Promise<number> {
    try {
      const rows = suggestionsToAlert(
        (await this.summary()).map((row) => ({
          name: row.name,
          count: row.count,
        })),
      );
      let created = 0;
      for (const row of rows) {
        const made = await this.notifications.notifyOnce({
          key: suggestionAlertKey(row.name),
          type: 'category_suggestion',
          title: `새 카테고리 후보 "${row.name}"`,
          body: `맞는 카테고리가 없어 AI 가 "${row.name}"을(를) 제안한 채널이 ${row.count}개 모였어요.`,
          link: '/admin/categories',
        });
        if (made) created += 1;
      }
      return created;
    } catch (error) {
      this.logger.warn(
        `새 카테고리 후보 알림 확인 실패: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    }
  }

  /**
   * 후보 이름으로 묶인 채널을 지금 다시 분류한다(그 이름의 카테고리를 만든 뒤 누름).
   * 한 번에 최대 300개.
   */
  async reclassifyByName(
    name: string,
  ): Promise<{ total: number; changed: number }> {
    this.categoryAi.clearCategoryNamesCache();
    const channels = await this.channelRepository.find({
      where: {
        status: ChannelStatus.ACTIVE,
        categoryLocked: false,
        suggestedCategory: name,
      },
      take: 300,
    });
    let changed = 0;
    for (const channel of channels) {
      const before = channel.category;
      const next = await this.channelCategory.classifyOne(channel, {
        force: true,
      });
      if (next.category !== before) changed += 1;
    }
    this.logger.log(
      `새 카테고리 후보 "${name}" 다시 분류: ${changed}/${channels.length}`,
    );
    return { total: channels.length, changed };
  }
}
