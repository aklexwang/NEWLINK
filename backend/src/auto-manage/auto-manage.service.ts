import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CategoriesService, DEFAULT_CATEGORIES } from '../categories/categories.service';
import { ChannelStatus, LinkType } from '../channels/channel.entity';
import { ChannelsService } from '../channels/channels.service';
import { TelegramRankingService } from '../ranking/telegram-ranking.service';
import { TgstatService } from '../ranking/tgstat.service';
import {
  ChannelImportCandidate,
  ImportCandidateStatus,
} from './channel-import-candidate.entity';
import { GoogleCseService, type GoogleSearchPreset } from './google-cse.service';
import { isKoreanChannelText } from './korean-channel.filter';

interface ExternalItem {
  title: string;
  link: string;
  category: string;
  linkType: string;
  participantsCount: number;
  avatarUrl: string | null;
  source: string;
}

/** 카테고리당 시드(텔레그램 미리보기) 수집 상한 */
const TELEGRAM_SYNC_LIMIT = 500;
/** 카테고리당 TGStat API 수집 상한 (API 요청당 최대 100) */
const TGSTAT_SYNC_LIMIT = 100;

@Injectable()
export class AutoManageService {
  constructor(
    @InjectRepository(ChannelImportCandidate)
    private readonly candidateRepository: Repository<ChannelImportCandidate>,
    private readonly channelsService: ChannelsService,
    private readonly categoriesService: CategoriesService,
    private readonly telegramRankingService: TelegramRankingService,
    private readonly tgstatService: TgstatService,
    private readonly googleCseService: GoogleCseService,
  ) {}

  getStatus() {
    const tgstatConfigured = this.tgstatService.isConfigured();
    const googleConfigured = this.googleCseService.isConfigured();
    const sources = ['telegram'];
    if (tgstatConfigured) sources.push('tgstat');
    if (googleConfigured) sources.push('google');

    return {
      sources,
      tgstatConfigured,
      googleConfigured,
      label: googleConfigured
        ? '텔레그램 시드 · TGStat · Google CSE 검색'
        : tgstatConfigured
          ? '텔레그램 시드 + TGStat API (한국어·카테고리별)'
          : '텔레그램 시드 · ranking-seeds.json (카테고리별)',
      hint: googleConfigured
        ? '주제 검색으로 Google CSE에서 t.me 공개·초대 링크를 모아 후보에 넣을 수 있습니다. API 동기화는 한글 제목 위주입니다.'
        : '동기화하면 제목에 한글이 있는 한국 채널만 수집합니다. Google CSE 키를 넣으면 주제 검색 수집이 활성화됩니다.',
      koreanOnly: true,
      telegramLimitPerCategory: TELEGRAM_SYNC_LIMIT,
      tgstatLimitPerCategory: TGSTAT_SYNC_LIMIT,
    };
  }

  async sync(category?: string) {
    const items: ExternalItem[] = [];
    const categories = await this.resolveSyncCategories(category);

    for (const cat of categories) {
      const telegramItems = await this.telegramRankingService.getRanking(cat, TELEGRAM_SYNC_LIMIT);
      items.push(
        ...telegramItems.map((item) => ({
          title: item.title,
          link: item.link,
          category: item.category,
          linkType: item.linkType,
          participantsCount: item.participantsCount,
          avatarUrl: item.avatarUrl,
          source: item.source,
        })),
      );

      if (this.tgstatService.isConfigured()) {
        try {
          const tgstatItems = await this.tgstatService.getRanking(cat, TGSTAT_SYNC_LIMIT);
          items.push(
            ...tgstatItems.map((item) => ({
              title: item.title,
              link: item.link,
              category: item.category,
              linkType: item.linkType,
              participantsCount: item.participantsCount,
              avatarUrl: item.avatarUrl,
              source: item.source,
            })),
          );
        } catch {
          // TGStat 실패 시 해당 카테고리 시드만 사용
        }
      }
    }

    const deduped = this.dedupeExternal(items);
    let created = 0;
    let updated = 0;
    let skippedNonKorean = 0;

    for (const item of deduped) {
      if (!isKoreanChannelText(item.title)) {
        skippedNonKorean += 1;
        const link = this.channelsService.normalizeTelegramLink(item.link);
        const existingCandidate = await this.candidateRepository.findOne({ where: { link } });
        if (
          existingCandidate &&
          existingCandidate.status === ImportCandidateStatus.PENDING &&
          !isKoreanChannelText(existingCandidate.title)
        ) {
          existingCandidate.status = ImportCandidateStatus.SKIPPED;
          await this.candidateRepository.save(existingCandidate);
        }
        continue;
      }

      const link = this.channelsService.normalizeTelegramLink(item.link);
      const existingChannel = await this.channelsService.findByLink(link);
      const existingCandidate = await this.candidateRepository.findOne({ where: { link } });

      if (existingChannel?.status === ChannelStatus.ACTIVE) {
        if (existingCandidate) {
          existingCandidate.status = ImportCandidateStatus.PUBLISHED;
          existingCandidate.publishedChannelId = existingChannel.id;
          existingCandidate.publishedAt = existingCandidate.publishedAt ?? new Date();
          await this.candidateRepository.save(existingCandidate);
          updated += 1;
        }
        continue;
      }

      const payload = {
        link,
        title: item.title.slice(0, 255),
        category: item.category,
        linkType: item.linkType === 'group' ? LinkType.GROUP : LinkType.CHANNEL,
        participantsCount: item.participantsCount,
        avatarUrl: await this.resolveCandidateAvatar(link, item.avatarUrl),
        source: item.source,
      };

      if (existingCandidate) {
        if (existingCandidate.status === ImportCandidateStatus.SKIPPED) continue;
        Object.assign(existingCandidate, payload);
        if (existingCandidate.status !== ImportCandidateStatus.PUBLISHED) {
          existingCandidate.status = ImportCandidateStatus.PENDING;
        }
        await this.candidateRepository.save(existingCandidate);
        updated += 1;
      } else {
        await this.candidateRepository.save(this.candidateRepository.create(payload));
        created += 1;
      }
    }

    const cleaned = await this.skipNonKoreanPending();

    return {
      created,
      updated,
      total: deduped.length,
      skippedNonKorean,
      cleanedNonKorean: cleaned,
      categoriesSynced: categories,
    };
  }

  /** Google CSE로 t.me 공개·초대 링크를 모아 후보에 저장 (한글 필터 미적용) */
  async importFromGoogleSearch(params: {
    topic: string;
    preset: GoogleSearchPreset;
    customQuery?: string;
    category: string;
    pages?: number;
  }) {
    const { query, hits, rawResultCount } = await this.googleCseService.search({
      topic: params.topic,
      preset: params.preset,
      customQuery: params.customQuery,
      pages: params.pages,
    });

    let created = 0;
    let updated = 0;
    let skippedExisting = 0;

    for (const hit of hits) {
      const link = this.channelsService.normalizeTelegramLink(hit.link);
      const existingChannel = await this.channelsService.findByLink(link);
      const existingCandidate = await this.candidateRepository.findOne({ where: { link } });

      if (existingChannel?.status === ChannelStatus.ACTIVE) {
        if (existingCandidate) {
          existingCandidate.status = ImportCandidateStatus.PUBLISHED;
          existingCandidate.publishedChannelId = existingChannel.id;
          existingCandidate.publishedAt = existingCandidate.publishedAt ?? new Date();
          await this.candidateRepository.save(existingCandidate);
        }
        skippedExisting += 1;
        continue;
      }

      const payload = {
        link,
        title: hit.title.slice(0, 255) || link,
        category: params.category,
        linkType: hit.isInvite ? LinkType.GROUP : LinkType.CHANNEL,
        participantsCount: 0,
        avatarUrl: await this.resolveCandidateAvatar(link, null),
        source: 'google',
      };

      if (existingCandidate) {
        if (existingCandidate.status === ImportCandidateStatus.SKIPPED) {
          skippedExisting += 1;
          continue;
        }
        Object.assign(existingCandidate, payload);
        if (existingCandidate.status !== ImportCandidateStatus.PUBLISHED) {
          existingCandidate.status = ImportCandidateStatus.PENDING;
        }
        await this.candidateRepository.save(existingCandidate);
        updated += 1;
      } else {
        await this.candidateRepository.save(this.candidateRepository.create(payload));
        created += 1;
      }
    }

    return {
      query,
      created,
      updated,
      skippedExisting,
      total: hits.length,
      rawResultCount,
      inviteCount: hits.filter((item) => item.isInvite).length,
      publicCount: hits.filter((item) => !item.isInvite).length,
    };
  }

  /** 대기 목록에 남아 있는 비한글 후보를 제외 처리 (Google CSE 수집분은 제외) */
  private async skipNonKoreanPending(): Promise<number> {
    const pending = await this.candidateRepository.find({
      where: { status: ImportCandidateStatus.PENDING },
    });
    let cleaned = 0;
    for (const item of pending) {
      if (item.source === 'google') continue;
      if (isKoreanChannelText(item.title)) continue;
      item.status = ImportCandidateStatus.SKIPPED;
      await this.candidateRepository.save(item);
      cleaned += 1;
    }
    return cleaned;
  }

  async list(filters?: { status?: ImportCandidateStatus; category?: string; source?: string }) {
    const qb = this.candidateRepository.createQueryBuilder('candidate');
    if (filters?.status) {
      qb.andWhere('candidate.status = :status', { status: filters.status });
    }
    if (filters?.category) {
      qb.andWhere('candidate.category = :category', { category: filters.category });
    }
    if (filters?.source) {
      qb.andWhere('candidate.source = :source', { source: filters.source });
    }
    qb.orderBy('candidate.participants_count', 'DESC');
    qb.addOrderBy('candidate.fetched_at', 'DESC');

    const items = await qb.getMany();
    const refreshed = await this.refreshCandidateAvatars(items);
    return Promise.all(
      refreshed.map(async (item) => ({
        ...item,
        alreadyOnMemberPage:
          item.status === ImportCandidateStatus.PUBLISHED ||
          Boolean(await this.channelsService.findByLink(item.link)),
      })),
    );
  }

  async getCategories() {
    const [categories, counts] = await Promise.all([
      this.categoriesService.findActive(),
      this.candidateRepository
        .createQueryBuilder('candidate')
        .select('candidate.category', 'category')
        .addSelect('COUNT(*)', 'count')
        .where('candidate.status = :status', { status: ImportCandidateStatus.PENDING })
        .groupBy('candidate.category')
        .getRawMany<{ category: string; count: string }>(),
    ]);

    const countMap = Object.fromEntries(counts.map((row) => [row.category, Number(row.count)]));
    const pendingTotal = counts.reduce((sum, row) => sum + Number(row.count), 0);

    return [
      { id: 'all', name: '전체', emoji: '📥', count: pendingTotal },
      ...categories
        .filter((category) => (countMap[category.name] ?? 0) > 0)
        .map((category) => ({
          id: category.name,
          name: category.name,
          emoji: category.emoji,
          count: countMap[category.name] ?? 0,
        })),
    ];
  }

  async publish(ids: string[]) {
    const candidates = await this.candidateRepository.find({ where: { id: In(ids) } });
    const results: { id: string; ok: boolean; message?: string }[] = [];

    for (const candidate of candidates) {
      if (candidate.status === ImportCandidateStatus.SKIPPED) {
        results.push({ id: candidate.id, ok: false, message: '제외된 항목입니다.' });
        continue;
      }

      try {
        let channel = await this.channelsService.findByLink(candidate.link);
        if (!channel) {
          channel = await this.channelsService.createByAdmin({
            title: candidate.title,
            link: candidate.link,
            linkType: candidate.linkType,
            category: candidate.category,
            description: candidate.title,
          });
        } else if (channel.status !== ChannelStatus.ACTIVE) {
          channel = await this.channelsService.approve(channel.id);
        }

        candidate.status = ImportCandidateStatus.PUBLISHED;
        candidate.publishedChannelId = channel.id;
        candidate.publishedAt = new Date();
        await this.candidateRepository.save(candidate);
        results.push({ id: candidate.id, ok: true });
      } catch (error) {
        results.push({
          id: candidate.id,
          ok: false,
          message: error instanceof Error ? error.message : '노출 실패',
        });
      }
    }

    return results;
  }

  async skip(ids: string[]) {
    await this.candidateRepository.update(ids, { status: ImportCandidateStatus.SKIPPED });
    return { ok: true, count: ids.length };
  }

  private async resolveSyncCategories(category?: string): Promise<string[]> {
    if (category && category !== 'all') {
      return [category];
    }

    const active = await this.categoriesService.findActive();
    if (active.length > 0) {
      return active.map((item) => item.name);
    }

    return DEFAULT_CATEGORIES.map((item) => item.name);
  }

  private dedupeExternal(items: ExternalItem[]): ExternalItem[] {
    const byLink = new Map<string, ExternalItem>();
    for (const item of items) {
      const key = this.channelsService.normalizeTelegramLink(item.link).toLowerCase();
      const existing = byLink.get(key);
      if (!existing || item.participantsCount > existing.participantsCount) {
        byLink.set(key, item);
      }
    }
    return [...byLink.values()];
  }

  private async resolveCandidateAvatar(link: string, avatarUrl: string | null): Promise<string | null> {
    if (!this.channelsService.isStaleAvatarUrl(avatarUrl)) {
      return avatarUrl;
    }
    return (await this.channelsService.mirrorAvatarForLink(link)) ?? avatarUrl;
  }

  private async refreshCandidateAvatars(items: ChannelImportCandidate[]) {
    const batchSize = 4;
    const refreshed: ChannelImportCandidate[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(async (item) => {
          if (!this.channelsService.isStaleAvatarUrl(item.avatarUrl)) {
            return item;
          }
          const mirrored = await this.channelsService.mirrorAvatarForLink(item.link);
          if (mirrored && mirrored !== item.avatarUrl) {
            item.avatarUrl = mirrored;
            return this.candidateRepository.save(item);
          }
          return item;
        }),
      );
      refreshed.push(...batchResults);
    }

    return refreshed;
  }
}
