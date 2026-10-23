import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChannelImportCandidate,
} from '../auto-manage/channel-import-candidate.entity';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import { extractTelegramUsernameFromLink } from '../channels/telegram-username';
import { formatKstYmd } from './channel-metrics.math';
import {
  flattenDiscoveryKeywords,
  rotateDiscoveryKeywords,
} from './discovery-keywords';
import { DiscoveredUsername } from './discovered-username.entity';
import {
  canRunAnotherKeywordSearch,
  envPositiveInt,
  KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
  nextKeywordSearchDelayMs,
} from './mtproto-budget.logic';
import { MtprotoCollectorService } from './mtproto-collector.service';

export type KeywordSearchRunResult = {
  searched: number;
  found: number;
  queued: number;
};

@Injectable()
export class KeywordSearchService {
  private readonly logger = new Logger(KeywordSearchService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly mtproto: MtprotoCollectorService,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelImportCandidate)
    private readonly candidateRepository: Repository<ChannelImportCandidate>,
    @InjectRepository(DiscoveredUsername)
    private readonly discoveredRepository: Repository<DiscoveredUsername>,
  ) {}

  dailyLimit(): number {
    return envPositiveInt(
      this.configService.get<string>('KEYWORD_SEARCH_DAILY_LIMIT'),
      KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
    );
  }

  async search(): Promise<KeywordSearchRunResult> {
    const empty: KeywordSearchRunResult = { searched: 0, found: 0, queued: 0 };
    if (!this.mtproto.isEnabled()) return empty;

    const cap = this.dailyLimit();
    const ymd = formatKstYmd().replace(/-/g, '');
    const offset = Number(ymd) || 0;
    const keywords = rotateDiscoveryKeywords(
      flattenDiscoveryKeywords(),
      offset,
      cap,
    );
    const known = await this.knownUsernames();
    let searched = 0;
    let found = 0;
    let queued = 0;

    for (let i = 0; i < keywords.length; i += 1) {
      if (!canRunAnotherKeywordSearch(searched, cap)) break;
      if (this.mtproto.remainingRequests() < 1) break;

      const delay = nextKeywordSearchDelayMs(i);
      if (delay > 0) await sleep(delay);

      const hits = await this.mtproto.searchPublicByKeyword(keywords[i]);
      searched += 1;
      for (const hit of hits) {
        found += 1;
        if (known.has(hit.username)) continue;
        const added = await this.enqueue(hit.username);
        known.add(hit.username);
        if (added) queued += 1;
      }
    }

    this.logger.log(
      `키워드 검색 끝: 검색 ${searched} / 발견 ${found} / 대기열 ${queued}`,
    );
    return { searched, found, queued };
  }

  /** 같은 username 은 대기열에 한 번만. 이미 검사한 아이디는 넣지 않습니다. */
  private async enqueue(username: string): Promise<boolean> {
    const existing = await this.discoveredRepository.findOne({
      where: { username },
    });
    if (existing) return false;
    await this.discoveredRepository.insert({
      username,
      result: 'queued',
      checkedAt: new Date(),
      mentionCount: 0,
    });
    return true;
  }

  private async knownUsernames(): Promise<Set<string>> {
    const known = new Set<string>();
    const channels = await this.channelRepository.find();
    for (const ch of channels) {
      if (ch.status !== ChannelStatus.ACTIVE) continue;
      const fromCol = ch.username?.replace(/^@/, '').trim().toLowerCase();
      if (fromCol) known.add(fromCol);
      const fromLink = extractTelegramUsernameFromLink(ch.link);
      if (fromLink) known.add(fromLink);
    }
    const candidates = await this.candidateRepository.find({
      select: ['link'],
    });
    for (const item of candidates) {
      const u = extractTelegramUsernameFromLink(item.link);
      if (u) known.add(u);
    }
    const discovered = await this.discoveredRepository.find({
      select: ['username'],
    });
    for (const row of discovered) {
      known.add(row.username.toLowerCase());
    }
    return known;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
