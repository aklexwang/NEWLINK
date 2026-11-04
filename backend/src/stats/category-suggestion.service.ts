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
  /** [AI로 분류하기] 진행 상황 (서버 메모리) */
  private categoryRun: {
    running: boolean;
    name: string;
    done: number;
    total: number;
    changed: number;
    error: string | null;
    finishedAt: string | null;
  } = {
    running: false,
    name: '',
    done: 0,
    total: 0,
    changed: 0,
    error: null,
    finishedAt: null,
  };

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
    this.categoryRun = {
      running: true,
      name,
      done: 0,
      total: channels.length,
      changed: 0,
      error: null,
      finishedAt: null,
    };
    let failed = 0;
    let lastError: string | null = null;
    for (const channel of channels) {
      this.categoryRun.done += 1;
      const before = channel.category;
      // 한 방에서 오류가 나도 전체를 멈추지 않고 다음 방으로 (오류는 기록만)
      try {
        const next = await this.channelCategory.classifyOne(channel, {
          force: true,
          // 어드민이 분류대기에서 직접 누른 경우만 50% 확신이면 옮긴다(자동 분류는 70% 그대로)
          minConfidence:
            name === PENDING_CATEGORY_NAME
              ? MANUAL_PENDING_MIN_CONFIDENCE
              : undefined,
        });
        if (next.category !== before) {
          changed.push({
            title: channel.title,
            from: before,
            to: next.category,
          });
        }
      } catch (error) {
        failed += 1;
        lastError = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `AI 재확인 실패 (${channel.username ?? channel.id}): ${lastError}`,
        );
        // 연속으로 다 실패하면(설정·DB 문제) 더 돌지 않는다
        if (
          failed >= 5 &&
          changed.length === 0 &&
          failed === this.categoryRun.done
        ) {
          throw new Error(`연속 실패: ${lastError}`);
        }
      }
    }
    if (failed > 0) {
      this.logger.warn(
        `카테고리 "${name}" AI 재확인 중 ${failed}개 실패 (마지막: ${lastError})`,
      );
    }
    if (changed.length) {
      this.publicStats.clearPublicCaches();
      this.channelsService.clearRankingCountsCache();
    }
    this.logger.log(
      `카테고리 "${name}" AI 재확인: ${changed.length}/${channels.length} 바뀜`,
    );
    this.categoryRun = {
      ...this.categoryRun,
      running: false,
      changed: changed.length,
      finishedAt: new Date().toISOString(),
    };
    return { total: channels.length, changed };
  }

  /** 자동 재분류에서 최근에 해 본 방 (서버 메모리, 같은 방을 매번 다시 묻지 않게) */
  private readonly autoTried = new Map<string, number>();

  /**
   * light 수집 끝에 분류대기 방을 조금씩 AI 로 분류한다 (자동 기준 70% 확신).
   * - 한 번에 최대 max 개, 같은 방은 retryAfterMs 동안 다시 묻지 않음
   * - 오늘 AI 한도에서 reserve 개는 새로 들어오는 방 몫으로 남김
   */
  async autoReclassifyPending(options?: {
    max?: number;
    retryAfterMs?: number;
    reserve?: number;
    deadlineMs?: number;
  }): Promise<{ tried: number; moved: number }> {
    const max = options?.max ?? 30;
    const retryAfterMs = options?.retryAfterMs ?? 3 * 24 * 60 * 60 * 1000;
    const reserve = options?.reserve ?? 150;
    if (this.categoryRun.running) return { tried: 0, moved: 0 };
    const ai = this.categoryAi.status();
    if (!ai.configured || ai.stopped) return { tried: 0, moved: 0 };
    const room = Math.min(max, ai.dailyMax - ai.today - reserve);
    if (room <= 0) return { tried: 0, moved: 0 };
    const now = Date.now();
    for (const [id, at] of this.autoTried) {
      if (now - at > retryAfterMs) this.autoTried.delete(id);
    }
    const candidates = await this.channelRepository.find({
      where: {
        status: ChannelStatus.ACTIVE,
        categoryLocked: false,
        category: PENDING_CATEGORY_NAME,
      },
      order: { createdAt: 'ASC' },
      take: 300,
    });
    const picked = candidates
      .filter((c) => !this.autoTried.has(c.id))
      .slice(0, room);
    let moved = 0;
    for (const channel of picked) {
      if (options?.deadlineMs && Date.now() > options.deadlineMs) break;
      this.autoTried.set(channel.id, Date.now());
      try {
        const next = await this.channelCategory.classifyOne(channel, {
          force: true,
        });
        if (next.category !== PENDING_CATEGORY_NAME) moved += 1;
      } catch (error) {
        this.logger.warn(
          `분류대기 자동 AI 실패 (${channel.username ?? channel.id}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (moved > 0) {
      this.publicStats.clearPublicCaches();
      this.channelsService.clearRankingCountsCache();
    }
    if (picked.length > 0) {
      this.logger.log(`분류대기 자동 AI: ${moved}/${picked.length} 옮김`);
    }
    return { tried: picked.length, moved };
  }

  /** 진행 상황 보기용: 백그라운드로 시작만 하고 바로 돌려준다 */
  startReclassifyCategory(name: string): { started: boolean } {
    if (this.categoryRun.running) return { started: false };
    this.categoryRun = {
      running: true,
      name,
      done: 0,
      total: 0,
      changed: 0,
      error: null,
      finishedAt: null,
    };
    void this.reclassifyCategory(name).catch((error: unknown) => {
      this.categoryRun = {
        ...this.categoryRun,
        running: false,
        error: error instanceof Error ? error.message : String(error),
        finishedAt: new Date().toISOString(),
      };
    });
    return { started: true };
  }

  reclassifyCategoryProgress() {
    return { ...this.categoryRun };
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
