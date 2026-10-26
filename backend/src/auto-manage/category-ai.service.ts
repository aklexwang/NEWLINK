import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoryEntity } from '../categories/category.entity';
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
  /** 목록에 맞는 게 없을 때 AI 가 제안한 새 카테고리 이름 */
  newCategory?: string;
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

  private namesCache: { at: number; names: string[] } | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(CategoryEntity)
    private readonly categoryRepository: Repository<CategoryEntity>,
  ) {
    this.budget = new AiDailyBudget(this.dailyLimit());
  }

  /**
   * AI·키워드가 고를 카테고리 목록 = 어드민에서 켜 둔 카테고리(순서대로).
   * 어드민에서 추가·이름 변경하면 1분 안에 반영. 비어 있으면 기본 목록.
   */
  async categoryNames(): Promise<string[]> {
    const now = Date.now();
    if (this.namesCache && now - this.namesCache.at < 60_000) {
      return this.namesCache.names;
    }
    let names: string[] = [];
    try {
      const rows = await this.categoryRepository.find({
        where: { isActive: true },
        order: { sortOrder: 'ASC', name: 'ASC' },
        select: { name: true },
      });
      names = rows.map((row) => row.name).filter(Boolean);
    } catch (error) {
      this.logger.warn(
        `카테고리 목록을 읽지 못해 기본 목록을 씁니다: ${error instanceof Error ? error.message : error}`,
      );
    }
    if (names.length === 0) names = this.defaultCategoryNames();
    this.namesCache = { at: now, names };
    return names;
  }

  clearCategoryNamesCache(): void {
    this.namesCache = null;
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

  /** 전체 재분류처럼 하루 상한과 따로 세는 예산을 만든다 */
  createBudget(limit: number): AiDailyBudget {
    return new AiDailyBudget(limit);
  }

  /**
   * force: 키워드가 확실해도 AI 에게 다시 묻는다(전체 재분류용). 불법 의심·성인 키워드 보수 규칙은 그대로.
   * budget: 하루 상한 대신 쓸 예산.
   */
  async classify(
    input: CategoryClassifyInput,
    options: { force?: boolean; budget?: AiDailyBudget } = {},
  ): Promise<CategoryClassifyResult> {
    const allowed =
      input.allowedCategories.length > 0
        ? input.allowedCategories
        : this.defaultCategoryNames();
    const fallback = this.classifyByKeywords(input, allowed);
    const config = this.config();

    const skip = aiSkipReason({
      force: options.force === true,
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

    const budget = options.budget ?? this.budget;
    if (!options.budget) this.budget.setLimit(this.dailyLimit());
    const outcome = await this.askAi(config, input, allowed, budget);
    if (outcome.verdict) {
      return {
        category: outcome.verdict.category,
        confidence: outcome.verdict.confidence,
        source: 'ai',
        reason: outcome.verdict.reason,
        newCategory: outcome.verdict.newCategory,
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
    budget: AiDailyBudget = this.budget,
  ): Promise<{ verdict: AiVerdict | null; skipReason: AiSkipReason }> {
    for (let attempt = 0; attempt <= AI_RETRY_COUNT; attempt += 1) {
      if (!budget.tryAcquire()) {
        return {
          verdict: null,
          skipReason: budget.snapshot().stopReason ? 'stopped' : 'limit',
        };
      }
      try {
        const content = await this.requestCompletion(
          config,
          input,
          allowedCategories,
        );
        const verdict = parseAiVerdict(content, allowedCategories);
        if (verdict) return { verdict, skipReason: 'error' };
        this.logger.warn(
          'AI 응답을 읽지 못했습니다(형식 오류 또는 목록 밖 카테고리).',
        );
      } catch (error) {
        if (
          error instanceof AiHttpError &&
          shouldStopAiForToday(error.status)
        ) {
          budget.stopToday(`HTTP ${error.status}`);
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
      'Reply with JSON only: {"category":"<one>","confidence":0.0-1.0,"reason":"short Korean","newCategory":null}',
      `Choose ONLY from this list, copy the name exactly: ${allowedCategories.join(', ')}`,
      'Judge by what the channel mainly PUBLISHES or what members mainly DO there, not by single words.',
      '성인 = the main content itself is sexual/porn (야동, 섹스, 18+ media, 조건만남). It MUST be 성인 then.',
      '카지노 = the main content is gambling (casino, 바카라, 토토, betting tips/sites).',
      '홍보 = promotion/ad rooms where members post their own channels, ads, 총판 (홍보방, 자유홍보, 무한홍보, 홍보 모음). Use 홍보 even if some ads are for adult or gambling, unless the room is clearly dedicated to porn or gambling.',
      'Rule lines like "야동 금지", "19금 홍보 금지", "도박 홍보 불가", "no porn" list what is BANNED. They are NOT evidence for 성인 or 카지노.',
      '커뮤니티 = chat/discussion groups about a general or mixed topic. 뉴스 = news/headlines. 경제 = stocks, investing, macro. 암호화폐 = coins, tokens, exchanges, USDT/TON.',
      'Do not use 기술/게임/구인구직 for adult titles just because of words like game, AI, or job in snippets.',
      'confidence: 0.9+ only when the main topic is obvious; 0.5-0.7 when mixed. If unsure, use 기타 with low confidence.',
      'If NO category in the list fits well, still pick the closest one with low confidence, AND add "newCategory": a short Korean category name (2-8 chars, general enough for many channels, e.g. 웹소설, 코인선물, 자동차) that would fit. Otherwise set "newCategory": null.',
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
