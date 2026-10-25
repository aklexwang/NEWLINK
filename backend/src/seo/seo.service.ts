import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import { formatKstYmd } from '../stats/channel-metrics.math';
import {
  buildSitemapIndexXml,
  buildUrlsetXml,
  sitemapPageCount,
  SITEMAP_PAGE_SIZE,
} from './sitemap-xml';
import { selectSitemapEntries, type SitemapEntry } from './sitemap-select.logic';

const DEFAULT_SITE = 'https://global-spay.com';
/** 노출 판정이 무거워 크롤러가 여러 페이지를 연달아 받을 때 한 번만 계산한다 */
const SITEMAP_CACHE_MS = 10 * 60 * 1000;

@Injectable()
export class SeoService {
  private cache: { expiresAt: number; entries: SitemapEntry[] } | null = null;

  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly config: ConfigService,
  ) {}

  async sitemapXml(page?: number): Promise<string> {
    const entries = await this.indexedEntries();
    const total = entries.length;
    const pages = sitemapPageCount(total);

    if (page == null) {
      if (total > SITEMAP_PAGE_SIZE) {
        const origin = this.publicOrigin();
        return buildSitemapIndexXml(
          Array.from({ length: pages }, (_, i) => ({
            loc: `${origin}/sitemaps/${i + 1}.xml`,
          })),
        );
      }
      return this.urlsetPage(entries, 1);
    }

    if (!Number.isInteger(page) || page < 1 || page > pages) {
      throw new BadRequestException('sitemap 페이지가 올바르지 않습니다.');
    }
    return this.urlsetPage(entries, page);
  }

  private publicOrigin(): string {
    const raw = (
      this.config.get<string>('PUBLIC_SITE_URL') ?? DEFAULT_SITE
    ).trim();
    return raw.replace(/\/$/, '') || DEFAULT_SITE;
  }

  /** 회원 화면과 같은 노출 규칙을 통과한 채널만. 링크당 1개 */
  private async indexedEntries(): Promise<SitemapEntry[]> {
    if (this.cache && this.cache.expiresAt > Date.now()) {
      return this.cache.entries;
    }
    const rows = await this.channelRepository
      .createQueryBuilder('channel')
      .select([
        'channel.id',
        'channel.link',
        'channel.username',
        'channel.status',
        'channel.isVisible',
        'channel.firstObservedAt',
        'channel.collectStatus',
        'channel.collectError',
        'channel.language',
        'channel.isPromoted',
        'channel.autoRegistered',
        'channel.submittedBy',
        'channel.category',
        'channel.title',
        'channel.description',
        'channel.illegalCleared',
        'channel.recommendCount',
        'channel.memberCount',
        'channel.avatarApproved',
        'channel.lastCollectedAt',
        'channel.updatedAt',
      ])
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('channel.username IS NOT NULL')
      .andWhere("TRIM(channel.username) != ''")
      .getMany();
    const entries = selectSitemapEntries(rows);
    this.cache = { expiresAt: Date.now() + SITEMAP_CACHE_MS, entries };
    return entries;
  }

  private urlsetPage(entries: SitemapEntry[], page: number): string {
    const origin = this.publicOrigin();
    const slice = entries.slice(
      (page - 1) * SITEMAP_PAGE_SIZE,
      page * SITEMAP_PAGE_SIZE,
    );
    const urls = slice.map((entry) => ({
      loc: `${origin}/c/${encodeURIComponent(entry.handle)}`,
      lastmod: entry.lastmodSource ? formatKstYmd(entry.lastmodSource) : null,
    }));
    return buildUrlsetXml(urls);
  }
}
