import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { scoreKeywordCategory } from '../channels/channel-category-score.logic';

export interface CategoryClassifyInput {
  title: string;
  description?: string;
  snippet?: string;
  topicHint?: string;
  /** 최근 게시글 본문 (최대 20개) */
  posts?: string[];
  allowedCategories: string[];
}

export interface CategoryClassifyResult {
  category: string;
  confidence: number;
  source: 'ai' | 'fallback';
  reason?: string;
}

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

  async classify(
    input: CategoryClassifyInput,
  ): Promise<CategoryClassifyResult> {
    const allowed =
      input.allowedCategories.length > 0
        ? input.allowedCategories
        : this.defaultCategoryNames();
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
    const scored = scoreKeywordCategory({
      title: input.title,
      description: input.description,
      snippet: input.snippet,
      topicHint: input.topicHint,
      posts: input.posts,
      allowedCategories,
    });
    return {
      category: scored.category,
      confidence: scored.confidence,
      source: 'fallback',
      reason: scored.reason,
    };
  }

  private async classifyWithAi(
    input: CategoryClassifyInput,
    allowedCategories: string[],
  ): Promise<CategoryClassifyResult | null> {
    const apiKey = (
      this.configService.get<string>('OPENAI_API_KEY') ?? ''
    ).trim();
    const model =
      (
        this.configService.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini'
      ).trim() || 'gpt-4o-mini';
    const baseUrl = (
      this.configService.get<string>('OPENAI_BASE_URL') ??
      'https://api.openai.com/v1'
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
      `posts: ${(input.posts ?? []).filter(Boolean).slice(0, 20).join('\n---\n') || '(none)'}`,
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
