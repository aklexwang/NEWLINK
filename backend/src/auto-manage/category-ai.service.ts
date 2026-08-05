import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_CATEGORIES } from '../categories/categories.service';

export interface CategoryClassifyInput {
  title: string;
  description?: string;
  snippet?: string;
  topicHint?: string;
  allowedCategories: string[];
}

export interface CategoryClassifyResult {
  category: string;
  confidence: number;
  source: 'ai' | 'fallback';
  reason?: string;
}

const KEYWORD_RULES: { category: string; patterns: RegExp[] }[] = [
  { category: '암호화폐', patterns: [/crypto|bitcoin|btc|eth|nft|디파이|코인|암호화폐|블록체인|ton\b|USDT/i] },
  { category: '뉴스', patterns: [/news|뉴스|속보|언론|신문|방송/i] },
  { category: '경제', patterns: [/경제|주식|증권|투자|펀드|환율|finance|stock|trading/i] },
  { category: '쇼핑', patterns: [/쇼핑|할인|공구|핫딜|shopping|deal|쿠폰/i] },
  { category: '교육', patterns: [/교육|강의|공부|학습|입시|토익|english|python|programming|교육/i] },
  { category: '기술', patterns: [/기술|개발|코딩|IT|AI|소프트웨어|tech|developer|프로그래밍/i] },
  { category: '게임', patterns: [/게임|game|e-?sport|롤|배그|스팀/i] },
  { category: '스포츠', patterns: [/스포츠|축구|야구|농구|sport|football|soccer/i] },
  { category: '음악', patterns: [/음악|music|playlist|노래|케이팝|k-?pop/i] },
  { category: '엔터테인먼트', patterns: [/연예|예능|영화|드라마|유머|meme|entertainment/i] },
  { category: '여행', patterns: [/여행|관광|항공|호텔|travel|tour/i] },
  { category: '맛집', patterns: [/맛집|음식|요리|카페|food|restaurant/i] },
  { category: '건강', patterns: [/건강|운동|다이어트|헬스|fitness|health/i] },
  { category: '부동산', patterns: [/부동산|아파트|전세|매매|real\s*estate/i] },
  { category: '구인구직', patterns: [/채용|구인|구직|알바|job|career|hiring/i] },
  { category: '커뮤니티', patterns: [/커뮤니티|모임|동호회|chat|group|커뮤니티/i] },
];

@Injectable()
export class CategoryAiService {
  private readonly logger = new Logger(CategoryAiService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    const key = (this.configService.get<string>('OPENAI_API_KEY') ?? '').trim();
    return Boolean(key && !key.includes('placeholder'));
  }

  defaultCategoryNames(): string[] {
    return DEFAULT_CATEGORIES.map((item) => item.name);
  }

  async classify(input: CategoryClassifyInput): Promise<CategoryClassifyResult> {
    const allowed =
      input.allowedCategories.length > 0 ? input.allowedCategories : this.defaultCategoryNames();
    const fallback = this.classifyByKeywords(input, allowed);

    if (!this.isConfigured()) {
      return fallback;
    }

    try {
      const ai = await this.classifyWithAi(input, allowed);
      if (ai && allowed.includes(ai.category)) {
        return ai;
      }
    } catch (error) {
      this.logger.warn(
        `AI 분류 실패, 키워드 폴백 사용: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return fallback;
  }

  classifyByKeywords(
    input: CategoryClassifyInput,
    allowedCategories: string[],
  ): CategoryClassifyResult {
    const text = [input.title, input.description, input.snippet, input.topicHint]
      .filter(Boolean)
      .join(' \n ');

    for (const rule of KEYWORD_RULES) {
      if (!allowedCategories.includes(rule.category)) continue;
      if (rule.patterns.some((pattern) => pattern.test(text))) {
        return {
          category: rule.category,
          confidence: 0.55,
          source: 'fallback',
          reason: 'keyword',
        };
      }
    }

    const other = allowedCategories.includes('기타') ? '기타' : allowedCategories[0] ?? '기타';
    return { category: other, confidence: 0.2, source: 'fallback', reason: 'default' };
  }

  private async classifyWithAi(
    input: CategoryClassifyInput,
    allowedCategories: string[],
  ): Promise<CategoryClassifyResult | null> {
    const apiKey = (this.configService.get<string>('OPENAI_API_KEY') ?? '').trim();
    const model =
      (this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini').trim() || 'gpt-4o-mini';
    const baseUrl = (
      this.configService.get<string>('OPENAI_BASE_URL') ?? 'https://api.openai.com/v1'
    ).replace(/\/$/, '');

    const system = [
      'You classify Telegram channels/groups into exactly one category.',
      'Reply with JSON only: {"category":"<one>","confidence":0.0-1.0,"reason":"short"}',
      `Allowed categories: ${allowedCategories.join(', ')}`,
      'If unsure, use 기타 and lower confidence.',
      'Prefer Korean category names exactly as listed.',
    ].join('\n');

    const user = [
      `title: ${input.title || '(none)'}`,
      `description: ${input.description || '(none)'}`,
      `snippet: ${input.snippet || '(none)'}`,
      `topicHint: ${input.topicHint || '(none)'}`,
    ].join('\n');

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });

    const data = (await response.json()) as {
      error?: { message?: string };
      choices?: { message?: { content?: string } }[];
    };

    if (!response.ok) {
      throw new Error(data.error?.message ?? `OpenAI HTTP ${response.status}`);
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const parsed = JSON.parse(content) as {
      category?: string;
      confidence?: number;
      reason?: string;
    };

    const category = (parsed.category ?? '').trim();
    if (!category) return null;

    return {
      category,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0.5)),
      source: 'ai',
      reason: parsed.reason,
    };
  }
}
