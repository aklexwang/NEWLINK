import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Request } from 'express';
import { In, LessThan, MoreThanOrEqual, Repository } from 'typeorm';
import { RequestActorService } from '../analytics/request-actor.service';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { Channel } from '../channels/channel.entity';
import {
  MemberActivity,
  type MemberActivityKind,
} from './member-activity.entity';
import {
  buildMemberProfile,
  MEMBER_ACTIVITY_DEDUPE_MS,
  MEMBER_ACTIVITY_RETENTION_DAYS,
  normalizeKeyword,
  type ChannelInfo,
} from './member-activity.logic';

type RecordInput = {
  channelId?: string | null;
  keyword?: string | null;
  category?: string | null;
};

@Injectable()
export class MemberActivityService {
  private readonly logger = new Logger(MemberActivityService.name);
  /** 같은 일 반복 기록 막기 (서버 메모리) */
  private readonly recent = new Map<string, number>();

  constructor(
    @InjectRepository(MemberActivity)
    private readonly repo: Repository<MemberActivity>,
    @InjectRepository(Channel)
    private readonly channelRepo: Repository<Channel>,
    private readonly actors: RequestActorService,
    private readonly ai: CategoryAiService,
  ) {}

  /** 요청한 사람이 로그인 회원이면 기록 (어드민·비로그인은 안 적음). 실패해도 화면에는 영향 없음 */
  recordFromRequest(
    req: Request,
    kind: MemberActivityKind,
    input: RecordInput,
  ) {
    try {
      const actor = this.actors.resolve(req);
      if (actor.isAdmin || actor.memberId == null) return;
      this.record(actor.memberId, kind, input);
    } catch {
      /* 기록 실패는 무시 */
    }
  }

  record(telegramId: number, kind: MemberActivityKind, input: RecordInput) {
    const keyword = normalizeKeyword(input.keyword);
    const category = normalizeKeyword(input.category);
    const channelId = input.channelId ?? null;
    if (kind === 'search' && !keyword) return;
    if (kind === 'category' && !category) return;
    if (
      (kind === 'open' || kind === 'view' || kind === 'favorite') &&
      !channelId
    )
      return;
    const key = `${telegramId}|${kind}|${channelId ?? ''}|${keyword ?? ''}|${category ?? ''}`;
    const now = Date.now();
    const last = this.recent.get(key);
    if (last && now - last < MEMBER_ACTIVITY_DEDUPE_MS) return;
    this.recent.set(key, now);
    if (this.recent.size > 20_000) {
      for (const [k, t] of this.recent) {
        if (now - t > MEMBER_ACTIVITY_DEDUPE_MS) this.recent.delete(k);
      }
    }
    void this.repo
      .insert({
        id: randomUUID(),
        telegramId,
        kind,
        channelId,
        keyword,
        category,
        createdAt: new Date(now),
      })
      .catch((error: unknown) =>
        this.logger.warn(
          `회원 활동 기록 실패: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }

  /** 어드민 회원 패널: 성향 + 최근 활동 */
  async profile(telegramId: number) {
    const since = new Date(
      Date.now() - MEMBER_ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const rows = await this.repo.find({
      where: { telegramId, createdAt: MoreThanOrEqual(since) },
      order: { createdAt: 'DESC' },
      take: 3000,
    });
    const ids = [
      ...new Set(rows.map((r) => r.channelId).filter(Boolean)),
    ] as string[];
    const channels = new Map<string, ChannelInfo>();
    if (ids.length) {
      const found = await this.channelRepo.find({
        where: { id: In(ids) },
        select: ['id', 'title', 'category', 'link', 'linkType'],
      });
      for (const c of found) {
        channels.set(c.id, {
          id: c.id,
          title: c.title,
          category: c.category,
          link: c.link,
          linkType: String(c.linkType),
        });
      }
    }
    const profile = buildMemberProfile(rows, channels);
    const recent = rows.slice(0, 60).map((r) => {
      const ch = r.channelId ? channels.get(r.channelId) : undefined;
      return {
        kind: r.kind,
        at: r.createdAt,
        keyword: r.keyword,
        category: r.category ?? ch?.category ?? null,
        channelId: r.channelId,
        title: ch?.title ?? null,
        link: ch?.link ?? null,
      };
    });
    return { profile, recent };
  }

  /** [AI 요약] 버튼: 성향을 한두 문장으로 (AI 하루 한도 사용) */
  async aiSummary(
    telegramId: number,
  ): Promise<{ summary: string | null; reason?: string }> {
    const { profile } = await this.profile(telegramId);
    if (profile.total < 3)
      return { summary: null, reason: '활동이 너무 적어요(3건 미만).' };
    const system =
      '너는 텔레그램 채널 디렉터리 사이트의 운영자를 돕는다. 한 회원의 사이트 이용 기록 요약을 보고, ' +
      '이 회원의 관심사와 이용 성향을 한국어 2~3문장으로 담백하게 설명해라. 추측은 "~로 보임"처럼 표현하고, ' +
      '실명·연락처 같은 개인 식별 추정은 하지 마라. 운영에 쓸 만한 한 줄(추천할 만한 카테고리 등)을 마지막에 붙여라.';
    const user = JSON.stringify({
      categories: profile.categories,
      keywords: profile.keywords,
      topRooms: profile.topRooms.map((r) => ({
        title: r.title,
        category: r.category,
        opens: r.opens,
      })),
      nightShare: profile.hours,
      privateShare: profile.privateShare,
      labels: profile.labels,
      activityCount: profile.total,
    });
    const summary = await this.ai.summarizeKorean(system, user);
    return summary
      ? { summary }
      : { summary: null, reason: 'AI 키가 없거나 오늘 AI 한도를 다 썼어요.' };
  }

  async deleteForUser(telegramId: number): Promise<void> {
    await this.repo.delete({ telegramId });
  }

  /** 매일 04:40(KST): 90일 지난 기록 삭제 */
  @Cron('40 4 * * *', { timeZone: 'Asia/Seoul' })
  async prune(): Promise<number> {
    const cutoff = new Date(
      Date.now() - MEMBER_ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const result = await this.repo.delete({ createdAt: LessThan(cutoff) });
    const n = result.affected ?? 0;
    if (n > 0) this.logger.log(`90일 지난 회원 활동 ${n}건 삭제`);
    return n;
  }
}
