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
  // 성인/카지노 최우선 (AI 키 없을 때 fallback에서도 제목의 명시적 키워드를 먼저 잡음)
  {
    category: '성인',
    patterns: [
      /섹스|야동|야설|성인|성인물|포르노| Cond|에로|노출|야한|유부녀|원나잇|조건만남|출장안마|폰섹|텔레야동/i,
      /\b(sex|porn|porno|xxx|nsfw|adult|onlyfans|hentai)\b/i,
      /18\s*\+|소라넷|야동방/,
    ],
  },
  {
    category: '카지노',
    patterns: [/카지노|바카라|슬롯|토토|스포츠토토|배팅|도박|\b(casino|baccarat|betting)\b/i],
  },
  { category: '암호화폐', patterns: [/crypto|bitcoin|\bbtc\b|\beth\b|nft|디파이|코인|암호화폐|블록체인|\bton\b|USDT/i] },
  { category: '뉴스', patterns: [/news|뉴스|속보|언론|신문|뉴스타파|헤드라인/i] },
  { category: '경제', patterns: [/경제|주식|증권|투자|펀드|환율|finance|\bstock\b|trading|재테크/i] },
  { category: '쇼핑', patterns: [/쇼핑|할인|공구|핫딜|shopping|\bdeal\b|쿠폰|특가|알리미/i] },
  { category: '교육', patterns: [/교육|강의|공부|학습|입시|토익|\bpython\b|프로그래밍|공부방/i] },
  // IT/AI/tech는 단어 경계 필수 — available·site·invite 등 영문 스니펫 오탐 방지
  {
    category: '기술',
    patterns: [/기술|개발|코딩|소프트웨어|개발자|프로그래밍|\b(IT|AI|tech|developer|software)\b/i],
  },
  { category: '게임', patterns: [/게임|\bgame\b|e-?sport|롤|배그|스팀/i] },
  { category: '스포츠', patterns: [/스포츠|축구|야구|농구|\b(sport|football|soccer)\b/i] },
  { category: '음악', patterns: [/음악|music|playlist|노래|케이팝|k-?pop/i] },
  { category: '엔터테인먼트', patterns: [/연예|예능|영화|드라마|유머|meme|entertainment|웹툰|만화/i] },
  { category: '여행', patterns: [/여행|관광|항공|호텔|travel|tour/i] },
  { category: '맛집', patterns: [/맛집|음식|요리|카페|food|restaurant/i] },
  { category: '건강', patterns: [/건강|운동|다이어트|헬스|fitness|health/i] },
  { category: '부동산', patterns: [/부동산|아파트|전세|매매|real\s*estate/i] },
  { category: '구인구직', patterns: [/채용|구인|구직|알바|취업|\b(job|career|hiring)\b/i] },
  { category: '커뮤니티', patterns: [/커뮤니티|모임|동호회|박제|블랙리스트/i] },
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
    const titleText = [input.title, input.description].filter(Boolean).join(' \n ');
    const fullText = [input.title, input.description, input.snippet, input.topicHint]
      .filter(Boolean)
      .join(' \n ');
    const topic = (input.topicHint ?? '').trim();

    let bestCategory = allowedCategories.includes('기타')
      ? '기타'
      : allowedCategories[0] ?? '기타';
    let bestScore = 0;

    for (const rule of KEYWORD_RULES) {
      if (!allowedCategories.includes(rule.category)) continue;
      let score = 0;
      for (const pattern of rule.patterns) {
        // lastIndex 초기화 (global 플래그 없는 RegExp도 안전하게)
        pattern.lastIndex = 0;
        if (pattern.test(titleText)) score += 4;
        else {
          pattern.lastIndex = 0;
          if (pattern.test(fullText)) score += 1;
        }
      }
      if (topic && topic === rule.category) score += 2;
      if (topic && titleText.includes(topic)) score += 1;

      if (score > bestScore) {
        bestScore = score;
        bestCategory = rule.category;
      }
    }

    if (bestScore <= 0) {
      return { category: bestCategory, confidence: 0.2, source: 'fallback', reason: 'default' };
    }

    return {
      category: bestCategory,
      confidence: Math.min(0.9, 0.45 + bestScore * 0.08),
      source: 'fallback',
      reason: 'keyword-score',
    };
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
      'Adult/sexual content (sex, porn, 야동, 섹스, 18+, NSFW, etc.) MUST be 성인 when that category is allowed.',
      'Gambling (casino, 카지노, 토토, betting) MUST be 카지노 when that category is allowed.',
      'Do not use 기술/게임/구인구직 for adult titles just because of words like game, AI, or job in snippets.',
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
