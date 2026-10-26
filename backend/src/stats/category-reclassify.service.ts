import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { PENDING_CATEGORY } from '../channels/auto-expose.logic';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { LANGUAGE_POST_LIMIT } from '../channels/channel-language.logic';
import { ChannelEvent } from './channel-event.entity';
import { ChannelPost } from './channel-post.entity';
import { CategoryProposal } from './category-proposal.entity';
import {
  countTransitions,
  decideReclassify,
} from './category-reclassify.logic';
import { PublicStatsService } from './public-stats.service';
import { nextSuggestedCategory } from './category-suggestion.logic';
import { CategorySuggestionService } from './category-suggestion.service';

/** 전체 재분류 한 번에 쓸 AI 호출 상한(하루 상한과 따로). 1.5만 채널 전에 다시 정한다 */
export const RECLASSIFY_AI_LIMIT = 3000;
/** 딥시크에 동시에 보내는 수 */
export const RECLASSIFY_CONCURRENCY = 4;

type RunState = {
  batchId: string | null;
  running: boolean;
  total: number;
  processed: number;
  changed: number;
  aiCalls: number;
  startedAt: string | null;
  finishedAt: string | null;
  stopReason: string | null;
};

@Injectable()
export class CategoryReclassifyService {
  private readonly logger = new Logger(CategoryReclassifyService.name);
  private state: RunState = {
    batchId: null,
    running: false,
    total: 0,
    processed: 0,
    changed: 0,
    aiCalls: 0,
    startedAt: null,
    finishedAt: null,
    stopReason: null,
  };
  private stopRequested = false;

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    @InjectRepository(CategoryProposal)
    private readonly proposalRepository: Repository<CategoryProposal>,
    private readonly categoryAi: CategoryAiService,
    private readonly publicStats: PublicStatsService,
    private readonly suggestions: CategorySuggestionService,
  ) {}

  private async latestBatchId(): Promise<string | null> {
    if (this.state.batchId) return this.state.batchId;
    const row = await this.proposalRepository.findOne({
      where: {},
      order: { createdAt: 'DESC' },
      select: { batchId: true, createdAt: true },
    });
    return row?.batchId ?? null;
  }

  private targetWhere() {
    return { status: ChannelStatus.ACTIVE, categoryLocked: false };
  }

  /** 미리보기 상태 + 전→후 묶음 */
  async status() {
    const batchId = await this.latestBatchId();
    const targets = await this.channelRepository.count({
      where: this.targetWhere(),
    });
    if (!batchId) {
      return {
        ...this.state,
        batchId: null,
        targets,
        done: 0,
        transitions: [],
        counts: {},
      };
    }
    const rows = await this.proposalRepository.find({
      where: { batchId },
      select: {
        channelId: true,
        beforeCategory: true,
        afterCategory: true,
        status: true,
      },
    });
    const counts: Record<string, number> = {};
    for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
    const changedRows = rows.filter((row) => row.status !== 'same');
    return {
      ...this.state,
      batchId,
      targets,
      done: rows.length,
      counts,
      transitions: countTransitions(changedRows),
    };
  }

  /**
   * 미리보기 시작. resume=true 면 마지막 묶음에서 아직 안 본 채널만 이어서 본다
   * (무료 서버가 잠들어 끊겼을 때).
   */
  async start(
    resume = false,
  ): Promise<{ started: boolean; batchId: string | null; reason?: string }> {
    if (this.state.running) {
      return { started: false, batchId: this.state.batchId, reason: 'running' };
    }
    if (!this.categoryAi.isConfigured()) {
      return { started: false, batchId: null, reason: 'no_ai_key' };
    }
    let batchId = resume ? await this.latestBatchId() : null;
    let seen = new Set<string>();
    if (batchId) {
      const rows = await this.proposalRepository.find({
        where: { batchId },
        select: { channelId: true },
      });
      seen = new Set(rows.map((row) => row.channelId));
    } else {
      batchId = randomUUID();
    }
    const channels = (
      await this.channelRepository.find({
        where: this.targetWhere(),
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          linkType: true,
        },
        order: { createdAt: 'ASC' },
      })
    ).filter((channel) => !seen.has(channel.id));

    this.stopRequested = false;
    this.state = {
      batchId,
      running: true,
      total: channels.length,
      processed: 0,
      changed: 0,
      aiCalls: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      stopReason: null,
    };
    void this.run(batchId, channels).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`전체 재분류 미리보기 실패: ${message}`);
      this.state = {
        ...this.state,
        running: false,
        finishedAt: new Date().toISOString(),
        stopReason: message.slice(0, 200),
      };
    });
    return { started: true, batchId };
  }

  stop(): { stopping: boolean } {
    if (!this.state.running) return { stopping: false };
    this.stopRequested = true;
    return { stopping: true };
  }

  private async run(batchId: string, channels: Channel[]): Promise<void> {
    const budget = this.categoryAi.createBudget(RECLASSIFY_AI_LIMIT);
    const allowed = (await this.categoryAi.categoryNames()).filter(
      (name) => name !== PENDING_CATEGORY,
    );
    let next = 0;
    const worker = async () => {
      while (!this.stopRequested) {
        const index = next;
        next += 1;
        if (index >= channels.length) return;
        await this.proposeOne(batchId, channels[index], allowed, budget);
        this.state.processed += 1;
        const snap = budget.snapshot();
        this.state.aiCalls = snap.used;
        if (snap.stopped) {
          this.state.stopReason = `AI 중단: ${snap.stopReason ?? ''}`;
          this.stopRequested = true;
        }
      }
    };
    await Promise.all(
      Array.from({ length: RECLASSIFY_CONCURRENCY }, () => worker()),
    );
    this.state = {
      ...this.state,
      running: false,
      finishedAt: new Date().toISOString(),
      stopReason:
        this.state.stopReason ?? (this.stopRequested ? '관리자 중지' : null),
    };
    await this.suggestions.checkAlerts();
    this.logger.log(
      `전체 재분류 미리보기: ${this.state.processed}/${this.state.total}, 바뀜 ${this.state.changed}, AI ${this.state.aiCalls}회`,
    );
  }

  private async proposeOne(
    batchId: string,
    channel: Channel,
    allowed: string[],
    budget: ReturnType<CategoryAiService['createBudget']>,
  ): Promise<void> {
    const posts =
      channel.linkType === LinkType.GROUP
        ? []
        : await this.postRepository.find({
            where: { channelId: channel.id },
            order: { postedAt: 'DESC' },
            take: LANGUAGE_POST_LIMIT,
            select: { textExcerpt: true },
          });
    const result = await this.categoryAi.classify(
      {
        title: channel.title,
        description: channel.description,
        posts: posts
          .map((p) => p.textExcerpt)
          .filter((t): t is string => Boolean(t)),
        allowedCategories: allowed,
      },
      { force: true, budget },
    );
    const before = channel.category || PENDING_CATEGORY;
    const decision = decideReclassify({
      before,
      category: result.category,
      confidence: result.confidence,
      source: result.source,
    });
    if (decision.changed) this.state.changed += 1;
    // 새 카테고리 후보는 미리보기에서도 채널에 남긴다(카테고리 자체는 안 바뀜)
    const suggestion = nextSuggestedCategory(result);
    if (suggestion !== undefined) {
      await this.channelRepository.update(channel.id, {
        suggestedCategory: suggestion,
      });
    }
    await this.proposalRepository.insert({
      id: randomUUID(),
      batchId,
      channelId: channel.id,
      beforeCategory: before,
      afterCategory: decision.after,
      confidence: result.confidence,
      source: result.source,
      reason:
        (result.reason ?? result.skipReason ?? null)?.slice(0, 300) ?? null,
      status: decision.changed ? 'pending' : 'same',
    });
  }

  /** 바뀔 목록. from/to 로 거른다 */
  async list(options: {
    from?: string;
    to?: string;
    limit?: number;
    offset?: number;
  }) {
    const batchId = await this.latestBatchId();
    if (!batchId) return { batchId: null, total: 0, items: [] };
    const qb = this.proposalRepository
      .createQueryBuilder('p')
      .innerJoin(Channel, 'c', 'CAST(c.id AS varchar) = p.channel_id')
      .where('p.batch_id = :batchId', { batchId })
      .andWhere("p.status <> 'same'");
    if (options.from)
      qb.andWhere('p.before_category = :from', { from: options.from });
    if (options.to) qb.andWhere('p.after_category = :to', { to: options.to });
    const total = await qb.getCount();
    const raw = await qb
      .select([
        'p.id AS id',
        'p.channel_id AS "channelId"',
        'p.before_category AS "before"',
        'p.after_category AS "after"',
        'p.confidence AS confidence',
        'p.source AS source',
        'p.reason AS reason',
        'p.status AS status',
        'c.title AS title',
        'c.username AS username',
        'c.member_count AS "memberCount"',
      ])
      .orderBy('c.member_count', 'DESC', 'NULLS LAST')
      .offset(Math.max(0, options.offset ?? 0))
      .limit(Math.min(500, Math.max(1, options.limit ?? 100)))
      .getRawMany<Record<string, unknown>>();
    return { batchId, total, items: raw };
  }

  /**
   * 적용. excludeIds 로 고른 줄은 건너뛴다. 그 사이 관리자가 카테고리를 바꿨거나 잠갔으면 건너뛴다.
   */
  async apply(
    excludeIds: string[] = [],
  ): Promise<{ applied: number; skipped: number }> {
    if (this.state.running) return { applied: 0, skipped: 0 };
    const batchId = await this.latestBatchId();
    if (!batchId) return { applied: 0, skipped: 0 };
    const exclude = new Set(excludeIds);
    const rows = await this.proposalRepository.find({
      where: { batchId, status: 'pending' },
    });
    const channels = await this.channelRepository.find({
      where: { id: In(rows.map((row) => row.channelId)) },
      select: { id: true, category: true, categoryLocked: true },
    });
    const byId = new Map(channels.map((c) => [c.id, c]));
    let applied = 0;
    let skipped = 0;
    for (const row of rows) {
      const channel = byId.get(row.channelId);
      const ok =
        !exclude.has(row.id) &&
        channel &&
        !channel.categoryLocked &&
        (channel.category || PENDING_CATEGORY) === row.beforeCategory;
      if (!ok) {
        await this.proposalRepository.update(row.id, { status: 'skipped' });
        skipped += 1;
        continue;
      }
      await this.channelRepository.update(channel.id, {
        category: row.afterCategory,
        categoryConfidence: row.confidence,
      });
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'category_changed',
        before: row.beforeCategory,
        after: row.afterCategory,
        occurredAt: new Date(),
      });
      await this.proposalRepository.update(row.id, { status: 'applied' });
      applied += 1;
    }
    this.publicStats.clearPublicCaches();
    this.logger.log(`전체 재분류 적용: ${applied}개, 건너뜀 ${skipped}개`);
    return { applied, skipped };
  }
}
