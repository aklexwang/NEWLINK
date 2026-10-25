import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DEFAULT_CATEGORIES } from '../categories/default-categories';
import { scoreKeywordCategory } from '../channels/channel-category-score.logic';
import {
  AI_RETRY_COUNT,
  AI_TIMEOUT_MS,
  aiSkipReason,
  AiDailyBudget,
  buildAiUserPrompt,
  parseAiDailyLimit,
  parseAiVerdict,
  resolveAiConfig,
  shouldStopAiForToday,
  type AiBudgetSnapshot,
  type AiConfig,
  type AiSkipReason,
  type AiVerdict,
} from './category-ai.logic';

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
  /** 키워드 점수(키워드 분류일 때만) */
  score?: number;
  /** AI 를 쓰지 않았거나 실패했을 때 이유 */
  skipReason?: AiSkipReason;
}

export interface CategoryAiStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  today: number;
  dailyMax: number;
  stopped: boolean;
  stopReason: string | null;
}

@Injectable()
export class CategoryAiService {
  private readonly logger = new Logger(CategoryAiService.name);
  private readonly budget: AiDailyBudget;

  constructor(private readonly configService: ConfigService) {
    this.budget = new AiDailyBudget(this.dailyLimit());
  }

  private dailyLimit(): number {
    return parseAiDailyLimit(this.configService.get<string>('AI_DAILY_LIMIT'));
  }

  private config(): AiConfig | null {
    return resolveAiConfig((key) => this.configService.get<string>(key));
  }

  isConfigured(): boolean {
    return this.config() !== null;
  }

  defaultCategoryNames(): string[] {
    return DEFAULT_CATEGORIES.map((item) => item.name);
  }

  /** 오늘 AI 호출 현황(어드민 표시용). 호출 횟수는 서버가 켜져 있는 동안만 센다. */
  status(): CategoryAiStatus {
    const config = this.config();
    this.budget.setLimit(this.dailyLimit());
    const snap: AiBudgetSnapshot = this.budget.snapshot();
    return {
      configured: config !== null,
      provider: config?.provider ?? null,
      model: config?.model ?? null,
      today: snap.used,
      dailyMax: snap.limit,
      stopped: snap.stopped,
      stopReason: snap.stopReason,
    };
  }

  async classify(
    input: CategoryClassifyInput,
  ): Promise<CategoryClassifyResult> {
    const allowed =
      input.allowedCategories.length > 0
        ? input.allowedCategories
        : this.defaultCategoryNames();
    const fallback = this.classifyByKeywords(input, allowed);
    const config = this.config();

    const skip = aiSkipReason({
      configured: config !== null,
      keyword: fallback,
      title: input.title,
      description: input.description,
      snippet: input.snippet,
      posts: input.posts,
    });
    if (skip || !config) {
      return { ...fallback, skipReason: skip ?? 'no_key' };
    }

    this.budget.setLimit(this.dailyLimit());
    const outcome = await this.askAi(config, input, allowed);
    if (outcome.verdict) {
      return {
        category: outcome.verdict.category,
        confidence: outcome.verdict.confidence,
        source: 'ai',
        reason: outcome.verdict.reason,
      };
    }
    return { ...fallback, skipReason: outcome.skipReason };
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
      score: scored.score,
    };
  }

  /**
   * 호출 한 번 = 상한 1회 소모. 일시 오류는 1회 다시 시도하고,
   * 429·5xx(그 밖에 인증·결제 오류)는 오늘 AI 를 멈춘다.
   */
  private async askAi(
    config: AiConfig,
    input: CategoryClassifyInput,
    allowedCategories: string[],
  ): Promise<{ verdict: AiVerdict | null; skipReason: AiSkipReason }> {
    for (let attempt = 0; attempt <= AI_RETRY_COUNT; attempt += 1) {
      if (!this.budget.tryAcquire()) {
        return { verdict: null, skipReason: this.budget.snapshot().stopReason ? 'stopped' : 'limit' };
      }
      try {
        const content = await this.requestCompletion(config, input, allowedCategories);
        const verdict = parseAiVerdict(content, allowedCategories);
        if (verdict) return { verdict, skipReason: 'error' };
        this.logger.warn('AI 응답을 읽지 못했습니다(형식 오류 또는 목록 밖 카테고리).');
      } catch (error) {
        if (error instanceof AiHttpError && shouldStopAiForToday(error.status)) {
          this.budget.stopToday(`HTTP ${error.status}`);
          this.logger.warn(
            `AI 호출 오류 HTTP ${error.status}: 오늘은 AI 분류를 멈추고 키워드 결과를 씁니다.`,
          );
          return { verdict: null, skipReason: 'stopped' };
        }
        this.logger.warn(
          `AI 호출 실패(${attempt + 1}/${AI_RETRY_COUNT + 1}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return { verdict: null, skipReason: 'error' };
  }

  private async requestCompletion(
    config: AiConfig,
    input: CategoryClassifyInput,
    allowedCategories: string[],
  ): Promise<string | null> {
    const system = [
      'You classify Telegram channels/groups into exactly one category.',
      'Reply with JSON only: {"category":"<one>","confidence":0.0-1.0,"reason":"short"}',
      `Choose ONLY from this list, copy the name exactly: ${allowedCategories.join(', ')}`,
      'Adult/sexual content (sex, porn, 야동, 섹스, 18+, NSFW, etc.) MUST be 성인 when that category is allowed.',
      'Gambling (casino, 카지노, 토토, betting) MUST be 카지노 when that category is allowed.',
      'Do not use 기술/게임/구인구직 for adult titles just because of words like game, AI, or job in snippets.',
      'If unsure, use 기타 and lower confidence.',
    ].join('\n');

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: buildAiUserPrompt(input) },
        ],
      }),
    });

    if (!response.ok) {
      throw new AiHttpError(response.status);
    }
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return data.choices?.[0]?.message?.content ?? null;
  }
}

class AiHttpError extends Error {
  constructor(readonly status: number) {
    super(`AI HTTP ${status}`);
  }
}
