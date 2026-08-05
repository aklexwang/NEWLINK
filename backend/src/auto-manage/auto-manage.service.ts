import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { CategoriesService, DEFAULT_CATEGORIES } from '../categories/categories.service';
import { ChannelStatus, LinkType } from '../channels/channel.entity';
import { ChannelsService } from '../channels/channels.service';
import { TelegramRankingService } from '../ranking/telegram-ranking.service';
import { TgstatService } from '../ranking/tgstat.service';
import { CategoryAiService } from './category-ai.service';
import {
  ChannelImportCandidate,
  ImportCandidateStatus,
} from './channel-import-candidate.entity';
import { GoogleCseService, type GoogleSearchPreset } from './google-cse.service';
import { SerperSearchService } from './serper-search.service';
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
    private readonly serperSearchService: SerperSearchService,
    private readonly categoryAiService: CategoryAiService,
  ) {}

  getStatus() {
    const tgstatConfigured = this.tgstatService.isConfigured();
    const googleConfigured = this.googleCseService.isConfigured();
    const serperConfigured = this.serperSearchService.isConfigured();
    const searchConfigured = serperConfigured || googleConfigured;
    const aiConfigured = this.categoryAiService.isConfigured();
    const sources = ['telegram'];
    if (tgstatConfigured) sources.push('tgstat');
    if (serperConfigured) sources.push('serper');
    else if (googleConfigured) sources.push('google');

    return {
      sources,
      tgstatConfigured,
      googleConfigured,
      serperConfigured,
      searchConfigured,
      searchProvider: serperConfigured ? 'serper' : googleConfigured ? 'google' : null,
      aiConfigured,
      label: searchConfigured
        ? `텔레그램 시드 · TGStat · ${serperConfigured ? 'Serper' : 'Google CSE'} · AI 분류`
        : tgstatConfigured
          ? '텔레그램 시드 + TGStat API (한국어·카테고리별)'
          : '텔레그램 시드 · ranking-seeds.json (카테고리별)',
      hint: serperConfigured
        ? 'Serper로 Google 검색 결과를 모아 후보에 넣습니다. AI/키워드로 카테고리를 제안하니 관리자가 검수 후 노출하세요.'
        : searchConfigured
          ? 'Google CSE가 연결되어 있습니다. Serper(SERPER_API_KEY)를 쓰면 결제 이슈 없이 더 안정적으로 수집할 수 있습니다.'
          : '주제 검색 수집을 쓰려면 backend/.env에 SERPER_API_KEY를 넣으세요. (https://serper.dev)',
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
        categoryAiSuggested: null as string | null,
        categoryConfidence: null as number | null,
        categorySource: 'seed',
        categoryReviewed: false,
        linkType: item.linkType === 'group' ? LinkType.GROUP : LinkType.CHANNEL,
        participantsCount: item.participantsCount,
        avatarUrl: await this.resolveCandidateAvatar(link, item.avatarUrl),
        source: item.source,
      };

      if (existingCandidate) {
        if (existingCandidate.status === ImportCandidateStatus.SKIPPED) continue;
        if (existingCandidate.categoryReviewed) {
          const {
            category: _c,
            categoryAiSuggested: _a,
            categoryConfidence: _f,
            categorySource: _s,
            categoryReviewed: _r,
            ...rest
          } = payload;
          Object.assign(existingCandidate, rest);
        } else {
          Object.assign(existingCandidate, payload);
        }
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

  /** Google/Serper 검색으로 t.me 공개·초대 링크를 모아 후보에 저장 (한글 필터 미적용, AI 분류) */
  async importFromGoogleSearch(params: {
    topic: string;
    preset: GoogleSearchPreset;
    customQuery?: string;
    category?: string;
    pages?: number;
    strictTopic?: boolean;
  }) {
    const searchResult = await this.searchWeb(params);
    const { query, hits, rawResultCount, filteredOut } = searchResult;
    const provider = searchResult.provider;

    const allowed = await this.getAllowedCategoryNames();
    const forceCategory =
      params.category && params.category !== 'auto' && params.category.trim()
        ? params.category.trim()
        : null;

    let created = 0;
    let updated = 0;
    let skippedExisting = 0;
    let aiClassified = 0;

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

      const title = hit.title.slice(0, 255) || link;
      let category = forceCategory ?? '기타';
      let categoryAiSuggested: string | null = null;
      let categoryConfidence: number | null = null;
      let categorySource = 'manual';
      let categoryReviewed = Boolean(forceCategory);

      if (!forceCategory) {
        const classified = await this.categoryAiService.classify({
          title,
          snippet: hit.snippet,
          topicHint: params.topic,
          allowedCategories: allowed,
        });
        category = classified.category;
        categoryAiSuggested = classified.category;
        categoryConfidence = classified.confidence;
        categorySource = classified.source;
        categoryReviewed = false;
        aiClassified += 1;
      }

      const payload = {
        link,
        title,
        category,
        categoryAiSuggested,
        categoryConfidence,
        categorySource,
        categoryReviewed,
        linkType: hit.isInvite ? LinkType.GROUP : LinkType.CHANNEL,
        participantsCount: 0,
        avatarUrl: await this.resolveCandidateAvatar(link, null),
        source: provider,
      };

      if (existingCandidate) {
        if (existingCandidate.status === ImportCandidateStatus.SKIPPED) {
          skippedExisting += 1;
          continue;
        }
        // 관리자가 이미 검수한 항목은 카테고리 덮어쓰지 않음
        if (existingCandidate.categoryReviewed) {
          const { category: _c, categoryAiSuggested: _a, categoryConfidence: _f, categorySource: _s, categoryReviewed: _r, ...rest } =
            payload;
          Object.assign(existingCandidate, rest);
        } else {
          Object.assign(existingCandidate, payload);
        }
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
      filteredOut,
      inviteCount: hits.filter((item) => item.isInvite).length,
      publicCount: hits.filter((item) => !item.isInvite).length,
      aiClassified,
      aiConfigured: this.categoryAiService.isConfigured(),
      provider,
    };
  }

  private async searchWeb(params: {
    topic: string;
    preset: GoogleSearchPreset;
    customQuery?: string;
    pages?: number;
    strictTopic?: boolean;
  }) {
    if (this.serperSearchService.isConfigured()) {
      return this.serperSearchService.search(params);
    }
    if (this.googleCseService.isConfigured()) {
      const result = await this.googleCseService.search(params);
      return { ...result, provider: 'google' as const };
    }
    throw new ServiceUnavailableException(
      '검색 API가 없습니다. SERPER_API_KEY를 backend/.env에 넣으세요. (https://serper.dev)',
    );
  }

  async classifyCandidates(ids: string[]) {
    const candidates = await this.candidateRepository.find({ where: { id: In(ids) } });
    return this.runClassify(candidates);
  }

  async classifyPendingCandidates() {
    const pending = await this.candidateRepository.find({
      where: { status: ImportCandidateStatus.PENDING, categoryReviewed: false },
      take: 50,
      order: { fetchedAt: 'DESC' },
    });
    return this.runClassify(pending);
  }

  async updateCandidate(
    id: string,
    dto: {
      category?: string;
      categoryReviewed?: boolean;
      linkType?: 'channel' | 'group';
      title?: string;
    },
  ) {
    const candidate = await this.candidateRepository.findOne({ where: { id } });
    if (!candidate) throw new NotFoundException('후보를 찾을 수 없습니다.');

    if (dto.title !== undefined) candidate.title = dto.title.slice(0, 255);
    if (dto.linkType !== undefined) {
      candidate.linkType = dto.linkType === 'group' ? LinkType.GROUP : LinkType.CHANNEL;
    }
    if (dto.category !== undefined) {
      candidate.category = dto.category;
      candidate.categorySource = 'manual';
      candidate.categoryReviewed = true;
    }
    if (dto.categoryReviewed !== undefined) {
      candidate.categoryReviewed = dto.categoryReviewed;
    }

    return this.candidateRepository.save(candidate);
  }

  private async runClassify(candidates: ChannelImportCandidate[]) {
    const allowed = await this.getAllowedCategoryNames();
    let updated = 0;

    for (const candidate of candidates) {
      if (candidate.categoryReviewed) continue;

      let description = '';
      try {
        const lookup = await this.channelsService.lookupTelegramLink(candidate.link);
        if (lookup.title) candidate.title = lookup.title.slice(0, 255);
        description = lookup.description ?? '';
        if (lookup.memberCount != null) candidate.participantsCount = Number(lookup.memberCount) || 0;
        if (lookup.avatarUrl) {
          candidate.avatarUrl = await this.resolveCandidateAvatar(candidate.link, lookup.avatarUrl);
        }
      } catch {
        // 미리보기 실패해도 제목만으로 분류
      }

      const classified = await this.categoryAiService.classify({
        title: candidate.title,
        description,
        allowedCategories: allowed,
      });

      candidate.category = classified.category;
      candidate.categoryAiSuggested = classified.category;
      candidate.categoryConfidence = classified.confidence;
      candidate.categorySource = classified.source;
      candidate.categoryReviewed = false;
      await this.candidateRepository.save(candidate);
      updated += 1;
    }

    return {
      updated,
      total: candidates.length,
      aiConfigured: this.categoryAiService.isConfigured(),
    };
  }

  private async getAllowedCategoryNames(): Promise<string[]> {
    const active = await this.categoriesService.findActive();
    if (active.length > 0) return active.map((item) => item.name);
    return this.categoryAiService.defaultCategoryNames();
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
