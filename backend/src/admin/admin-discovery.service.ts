import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { Channel, LinkType } from '../channels/channel.entity';
import { ChannelsService } from '../channels/channels.service';
import { PUBLIC_INSPECT_GAP_MS } from '../stats/public-channel-inspect.logic';
import { ChannelDiscoveryService } from '../stats/channel-discovery.service';
import { DISCOVERY_MAX_PER_DAY } from '../stats/channel-discovery.logic';
import { DiscoveryKeyword } from '../stats/discovery-keyword.entity';
import { DiscoveredUsername } from '../stats/discovered-username.entity';
import { KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT } from '../stats/mtproto-budget.logic';
import { RESOLVE_DAILY_LIMIT_DEFAULT } from '../stats/mtproto-access.logic';
import { StatsJobService } from '../stats/stats-job.service';
import {
  assertDiscoveryUsernames,
  DISCOVERY_QUEUE_PAGE_SIZE,
  discoveryQueueSkip,
  discoveryResultLabel,
  discoverySourceLabel,
  parseDiscoveryQueueFilter,
} from './admin-discovery.logic';

@Injectable()
export class AdminDiscoveryService {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly categoryAi: CategoryAiService,
    private readonly discovery: ChannelDiscoveryService,
    private readonly statsJob: StatsJobService,
    @InjectRepository(DiscoveredUsername)
    private readonly discoveredRepository: Repository<DiscoveredUsername>,
    @InjectRepository(DiscoveryKeyword)
    private readonly keywordRepository: Repository<DiscoveryKeyword>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
  ) {}

  async listQueue(input: { filter?: string; source?: string; page?: number }) {
    const filter = parseDiscoveryQueueFilter(input.filter);
    const { page, skip, take } = discoveryQueueSkip(Number(input.page ?? 1));
    const qb = this.discoveredRepository
      .createQueryBuilder('row')
      .orderBy('row.checked_at', 'DESC');
    if (filter !== 'all') {
      qb.andWhere('row.result = :result', { result: filter });
    }
    if (
      input.source === 'snowball' ||
      input.source === 'keyword' ||
      input.source === 'linked'
    ) {
      qb.andWhere('row.source = :source', { source: input.source });
    } else if (input.source === 'other') {
      qb.andWhere('(row.source IS NULL OR row.source = :other)', {
        other: 'other',
      });
    }
    const total = await qb.clone().getCount();
    const rows = await qb.skip(skip).take(take).getMany();
    const extras = await this.loadExtras(rows.map((row) => row.username));
    return {
      page,
      pageSize: DISCOVERY_QUEUE_PAGE_SIZE,
      total,
      items: rows.map((row) => {
        const extra = extras.get(row.username.toLowerCase());
        return {
          username: row.username,
          result: row.result,
          resultLabel: discoveryResultLabel(row.result),
          source: row.source,
          sourceLabel: discoverySourceLabel(row.source),
          checkedAt: row.checkedAt,
          mentionCount: row.mentionCount,
          title: extra?.title ?? null,
          memberCount: extra?.memberCount ?? null,
        };
      }),
    };
  }

  async usage() {
    const mtproto = this.statsJob.getStatus().mtproto;
    return {
      snowball: {
        today: await this.discovery.countSnowballToday(),
        dailyMax: DISCOVERY_MAX_PER_DAY,
      },
      keywordSearch: {
        today: mtproto.searchesToday,
        dailyMax: KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
      },
      resolve: {
        today: mtproto.resolvesToday,
        dailyMax: RESOLVE_DAILY_LIMIT_DEFAULT,
      },
      queuedInspect: {
        today: await this.discovery.countQueuedInspectToday(),
        dailyMax: this.discovery.queuedDailyMax(),
      },
    };
  }

  async registerMany(usernames: string[], category?: string) {
    const unique = this.parseNames(usernames);
    const results: Array<{ username: string; ok: boolean; message?: string }> =
      [];
    for (let i = 0; i < unique.length; i += 1) {
      const username = unique[i];
      try {
        await this.registerOne(username, category);
        results.push({ username, ok: true });
      } catch (error) {
        results.push({
          username,
          ok: false,
          message:
            error instanceof Error ? error.message : '등록에 실패했습니다.',
        });
      }
      if (i < unique.length - 1) await sleep(PUBLIC_INSPECT_GAP_MS);
    }
    return { results };
  }

  async discardMany(usernames: string[]) {
    const unique = this.parseNames(usernames);
    await this.discoveredRepository.update(
      { username: In(unique) },
      { result: 'discarded', checkedAt: new Date() },
    );
    return { count: unique.length };
  }

  async listKeywords(sort?: string) {
    const order =
      sort === 'new'
        ? { totalNewCount: 'DESC' as const, sort: 'ASC' as const }
        : { sort: 'ASC' as const };
    return this.keywordRepository.find({ order });
  }

  async createKeyword(word: string, category?: string) {
    const trimmed = word.trim().slice(0, 64);
    if (!trimmed) throw new BadRequestException('키워드를 입력해 주세요.');
    const exists = await this.keywordRepository.findOne({
      where: { word: trimmed },
    });
    if (exists) throw new ConflictException('이미 있는 키워드입니다.');
    const maxSort = await this.keywordRepository
      .createQueryBuilder('row')
      .select('MAX(row.sort)', 'max')
      .getRawOne<{ max: number | null }>();
    const now = new Date();
    await this.keywordRepository.insert({
      id: randomUUID(),
      word: trimmed,
      category: category?.trim() || null,
      enabled: true,
      sort: (maxSort?.max ?? -1) + 1,
      createdAt: now,
      lastSearchedAt: null,
      lastFoundCount: null,
      totalNewCount: 0,
    });
    return this.keywordRepository.findOneByOrFail({ word: trimmed });
  }

  async updateKeyword(
    id: string,
    patch: {
      enabled?: boolean;
      sort?: number;
      word?: string;
      category?: string;
    },
  ) {
    const row = await this.keywordRepository.findOneBy({ id });
    if (!row) throw new NotFoundException('키워드를 찾을 수 없습니다.');
    if (patch.word != null) {
      const word = patch.word.trim().slice(0, 64);
      if (!word) throw new BadRequestException('키워드를 입력해 주세요.');
      row.word = word;
    }
    if (patch.category !== undefined) {
      row.category = patch.category.trim() || null;
    }
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.sort !== undefined) row.sort = patch.sort;
    return this.keywordRepository.save(row);
  }

  async deleteKeyword(id: string) {
    const result = await this.keywordRepository.delete(id);
    if (!result.affected)
      throw new NotFoundException('키워드를 찾을 수 없습니다.');
    return { ok: true };
  }

  async reorderKeywords(ids: string[]) {
    const unique = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 1) {
      await this.keywordRepository.update(unique[i], { sort: i });
    }
    return this.listKeywords();
  }

  private parseNames(usernames: string[]) {
    try {
      return assertDiscoveryUsernames(usernames);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '처리할 수 없습니다.',
      );
    }
  }

  private async registerOne(username: string, category?: string) {
    const row = await this.discoveredRepository.findOneBy({ username });
    if (!row) throw new Error('항목을 찾을 수 없습니다.');
    const link = `https://t.me/${username}`;
    const existing = await this.channelsService.findDuplicate(link);
    if (existing) {
      // 거절된 행은 새로 만들거나 되살리지 않는다(단건 등록에서 확인 후 활성화)
      if (existing.kind === 'rejected') {
        throw new Error(
          '이전에 거절된 링크입니다. 단건 등록에서 다시 활성화해 주세요.',
        );
      }
      await this.discoveredRepository.update(username, { result: 'added' });
      throw new Error('이미 등록된 채널입니다.');
    }
    const extras = await this.loadExtras([username]);
    const extra = extras.get(username.toLowerCase());
    let nextCategory = category?.trim() || '';
    if (!nextCategory) {
      const classified = await this.categoryAi.classify({
        title: extra?.title ?? username,
        allowedCategories: await this.categoryAi.categoryNames(),
      });
      nextCategory = classified.category;
    }
    await this.channelsService.createByAdmin({
      title: (extra?.title ?? username).slice(0, 255),
      link,
      linkType: LinkType.CHANNEL,
      category: nextCategory,
      description: extra?.title ?? undefined,
    });
    await this.discoveredRepository.update(username, {
      result: 'added',
      checkedAt: new Date(),
    });
  }

  private async loadExtras(usernames: string[]) {
    const map = new Map<
      string,
      { title: string | null; memberCount: number | null }
    >();
    if (usernames.length === 0) return map;
    const channels = await this.channelRepository.find({
      where: { username: In(usernames) },
    });
    for (const channel of channels) {
      const key = channel.username?.replace(/^@/, '').trim().toLowerCase();
      if (!key) continue;
      map.set(key, {
        title: channel.title,
        memberCount: channel.memberCount,
      });
    }
    return map;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
