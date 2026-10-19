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

const DEFAULT_SITE = 'https://global-spay.com';

@Injectable()
export class SeoService {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly config: ConfigService,
  ) {}

  async sitemapXml(page?: number): Promise<string> {
    const total = await this.countIndexedChannels();
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
      return this.urlsetPage(1);
    }

    if (!Number.isInteger(page) || page < 1 || page > pages) {
      throw new BadRequestException('sitemap 페이지가 올바르지 않습니다.');
    }
    return this.urlsetPage(page);
  }

  private publicOrigin(): string {
    const raw = (
      this.config.get<string>('PUBLIC_SITE_URL') ?? DEFAULT_SITE
    ).trim();
    return raw.replace(/\/$/, '') || DEFAULT_SITE;
  }

  private async countIndexedChannels(): Promise<number> {
    return this.indexedQuery().getCount();
  }

  private indexedQuery() {
    return this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('channel.username IS NOT NULL')
      .andWhere("TRIM(channel.username) != ''");
  }

  private async urlsetPage(page: number): Promise<string> {
    const origin = this.publicOrigin();
    const rows = await this.indexedQuery()
      .select([
        'channel.id',
        'channel.username',
        'channel.lastCollectedAt',
        'channel.updatedAt',
      ])
      .orderBy('channel.username', 'ASC')
      .skip((page - 1) * SITEMAP_PAGE_SIZE)
      .take(SITEMAP_PAGE_SIZE)
      .getMany();

    const seen = new Set<string>();
    const urls: { loc: string; lastmod?: string | null }[] = [];
    for (const channel of rows) {
      const handle = (channel.username ?? '')
        .replace(/^@/, '')
        .trim()
        .toLowerCase();
      if (!handle || seen.has(handle)) continue;
      seen.add(handle);
      const lastmodSource = channel.lastCollectedAt ?? channel.updatedAt;
      urls.push({
        loc: `${origin}/c/${encodeURIComponent(handle)}`,
        lastmod: lastmodSource ? formatKstYmd(lastmodSource) : null,
      });
    }
    return buildUrlsetXml(urls);
  }
}
