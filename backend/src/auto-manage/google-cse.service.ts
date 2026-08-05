import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GoogleSearchPreset =
  | 'site'
  | 'groups'
  | 'intitle'
  | 'invite'
  | 'directory'
  | 'custom';

export interface GoogleCseHit {
  link: string;
  title: string;
  snippet: string;
  isInvite: boolean;
}

interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  htmlSnippet?: string;
  htmlTitle?: string;
}

interface GoogleCseResponse {
  items?: GoogleCseItem[];
  searchInformation?: { totalResults?: string };
  error?: { message?: string };
}

const BLOCKED_PATHS = new Set([
  's',
  'c',
  'a',
  'addstickers',
  'addtheme',
  'share',
  'proxy',
  'socks',
  'setlanguage',
  'iv',
  'login',
  'bg',
  'invoice',
  'confirmphone',
]);

/** t.me / telegram.me 공개 username · joinchat · +초대 링크 */
const TELEGRAM_LINK_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:t\.me|telegram\.me|telegram\.dog)\/(?:joinchat\/([A-Za-z0-9_-]+)|(\+[A-Za-z0-9_-]+)|([a-zA-Z][\w]{3,31}))(?:\/[^\s"'<>]*)?/gi;

@Injectable()
export class GoogleCseService {
  private readonly logger = new Logger(GoogleCseService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    const key = (this.configService.get<string>('GOOGLE_CSE_API_KEY') ?? '').trim();
    const cx = (this.configService.get<string>('GOOGLE_CSE_CX') ?? '').trim();
    return Boolean(key && cx && !key.includes('placeholder') && !cx.includes('placeholder'));
  }

  buildQuery(topic: string, preset: GoogleSearchPreset, customQuery?: string): string {
    const t = topic.trim();
    switch (preset) {
      case 'groups':
        return `site:t.me "${t}" -channel`;
      case 'intitle':
        return `site:t.me intitle:"${t}"`;
      case 'invite':
        return `("t.me/joinchat" OR "telegram.me/joinchat" OR "t.me/+") "${t}"`;
      case 'directory':
        return `"telegram group" "${t}"`;
      case 'custom':
        return (customQuery ?? '').trim() || (t ? `site:t.me "${t}"` : '');
      case 'site':
      default:
        return `site:t.me "${t}"`;
    }
  }

  async search(params: {
    topic: string;
    preset: GoogleSearchPreset;
    customQuery?: string;
    pages?: number;
    strictTopic?: boolean;
  }): Promise<{
    query: string;
    hits: GoogleCseHit[];
    rawResultCount: number;
    filteredOut: number;
  }> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google CSE가 설정되지 않았습니다. GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX를 확인하세요.',
      );
    }

    const query = this.buildQuery(params.topic, params.preset, params.customQuery);
    if (!query) {
      throw new BadRequestException('검색어(주제 또는 커스텀 쿼리)를 입력해 주세요.');
    }

    const pages = Math.min(Math.max(params.pages ?? 1, 1), 5);
    const byLink = new Map<string, GoogleCseHit>();
    let rawResultCount = 0;

    for (let page = 0; page < pages; page += 1) {
      const start = page * 10 + 1;
      const items = await this.fetchPage(query, start);
      if (page === 0) {
        rawResultCount = items.totalResults;
      }
      for (const item of items.items) {
        const extracted = this.buildHitsFromResult({
          link: item.link,
          title: item.title ?? item.htmlTitle,
          snippet: item.snippet,
          extraText: item.htmlSnippet,
        });
        for (const hit of extracted) {
          const key = hit.link.toLowerCase();
          if (!byLink.has(key)) byLink.set(key, hit);
        }
      }
      if (items.items.length === 0) break;
    }

    const all = [...byLink.values()];
    const strict = params.strictTopic !== false && params.preset !== 'custom';
    const hits = strict ? all.filter((hit) => this.matchesTopic(hit, params.topic)) : all;

    return {
      query,
      hits,
      rawResultCount,
      filteredOut: all.length - hits.length,
    };
  }

  /**
   * 검색 결과 1건에서 후보 링크를 뽑습니다.
   * 결과 URL 자체에서 나온 링크만 결과 제목을 쓰고, 스니펫에 섞여 있던 다른 링크는
   * 자기 username을 제목으로 씁니다. (다른 방의 제목이 붙는 문제 방지)
   */
  buildHitsFromResult(result: {
    link?: string;
    title?: string;
    snippet?: string;
    extraText?: string;
  }): GoogleCseHit[] {
    const snippet = (result.snippet ?? '').slice(0, 300);
    const hits: GoogleCseHit[] = [];
    const seen = new Set<string>();

    for (const hit of this.extractTelegramLinks(result.link ?? '')) {
      const key = hit.link.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ ...hit, title: this.cleanTitle(result.title, hit) || hit.title, snippet });
    }

    const secondaryText = [result.title, result.snippet, result.extraText]
      .filter(Boolean)
      .join('\n');
    for (const hit of this.extractTelegramLinks(secondaryText)) {
      const key = hit.link.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ ...hit, snippet });
    }

    return hits;
  }

  /** 주제 단어가 링크·제목·스니펫에 실제로 들어있는지 확인 (검색엔진의 유사어 확장 결과 제외) */
  matchesTopic(hit: GoogleCseHit, topic: string): boolean {
    const tokens = this.topicTokens(topic);
    if (tokens.length === 0) return true;
    const haystack = this.normalizeForMatch([hit.link, hit.title, hit.snippet].join(' '));
    return tokens.every((token) => haystack.includes(token));
  }

  private topicTokens(topic: string): string[] {
    return (topic ?? '')
      .split(/[\s,/|"']+/)
      .map((token) => this.normalizeForMatch(token))
      .filter((token) => token.length >= 2);
  }

  private normalizeForMatch(text: string): string {
    return (text ?? '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[^0-9a-z가-힣]+/g, '');
  }

  extractTelegramLinks(text: string): GoogleCseHit[] {
    const hits: GoogleCseHit[] = [];
    const seen = new Set<string>();
    TELEGRAM_LINK_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TELEGRAM_LINK_RE.exec(text)) !== null) {
      const joinchat = match[1];
      const plus = match[2];
      const username = match[3];
      let link: string;
      let isInvite = false;
      let title: string;

      if (joinchat) {
        link = `https://t.me/joinchat/${joinchat}`;
        isInvite = true;
        title = `초대 ${joinchat.slice(0, 12)}`;
      } else if (plus) {
        link = `https://t.me/${plus}`;
        isInvite = true;
        title = `초대 ${plus.slice(0, 12)}`;
      } else if (username) {
        if (BLOCKED_PATHS.has(username.toLowerCase())) continue;
        link = `https://t.me/${username}`;
        title = username;
      } else {
        continue;
      }

      const key = link.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ link, title, snippet: '', isInvite });
    }
    return hits;
  }

  private cleanTitle(raw: string | undefined, hit: GoogleCseHit): string {
    if (!raw?.trim()) return '';
    let title = raw
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\s*[-|–—]\s*Telegram.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) return hit.title;
    return title.slice(0, 255);
  }

  private async fetchPage(
    query: string,
    start: number,
  ): Promise<{ items: GoogleCseItem[]; totalResults: number }> {
    const key = (this.configService.get<string>('GOOGLE_CSE_API_KEY') ?? '').trim();
    const cx = (this.configService.get<string>('GOOGLE_CSE_CX') ?? '').trim();
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.set('key', key);
    url.searchParams.set('cx', cx);
    url.searchParams.set('q', query);
    url.searchParams.set('num', '10');
    url.searchParams.set('start', String(start));

    const response = await fetch(url.toString());
    const data = (await response.json()) as GoogleCseResponse;

    if (!response.ok) {
      const message = data.error?.message ?? `Google CSE HTTP ${response.status}`;
      this.logger.warn(`CSE 실패: ${message}`);
      throw new ServiceUnavailableException(message);
    }

    return {
      items: data.items ?? [],
      totalResults: Number(data.searchInformation?.totalResults ?? 0) || 0,
    };
  }
}
