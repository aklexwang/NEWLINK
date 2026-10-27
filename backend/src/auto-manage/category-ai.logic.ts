import { ADULT_CATEGORY } from '../channels/auto-expose.logic';
import { hasAdultTitleEvidence } from '../channels/channel-category-score.logic';
import { hasIllegalDrugSuspicion } from '../channels/illegal-content.logic';
import { formatKstYmd } from '../stats/channel-metrics.math';
import { safeCount } from '../daily-counters/daily-counter.logic';

/** 키워드 점수가 이 값 이상이면 AI 를 부르지 않는다 */
export const AI_SKIP_KEYWORD_CONFIDENCE = 0.7;

/** 하루 AI 호출 상한 기본값 */
export const AI_DAILY_LIMIT_DEFAULT = 300;

/** 채널 한 곳에 보내는 글자 수 상한(제목+소개+글 발췌 합계) */
export const AI_INPUT_MAX_CHARS = 2000;

/** 응답을 기다리는 최대 시간 */
export const AI_TIMEOUT_MS = 20_000;

/** 일시 오류일 때 다시 시도하는 횟수(첫 시도 제외) */
export const AI_RETRY_COUNT = 1;

export type AiProvider = 'deepseek' | 'openai';

export interface AiConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** 끝의 / 를 뺀 기준 주소. 뒤에 /chat/completions 를 붙여 부른다 */
  baseUrl: string;
  dailyLimit: number;
  /** 예전 OPENAI_API_KEY 설정으로 켜졌는지 */
  legacy: boolean;
}

const PROVIDER_DEFAULTS: Record<
  AiProvider,
  { model: string; baseUrl: string }
> = {
  deepseek: { model: 'deepseek-chat', baseUrl: 'https://api.deepseek.com' },
  openai: { model: 'gpt-4o-mini', baseUrl: 'https://api.openai.com/v1' },
};

type EnvGetter = (key: string) => string | undefined;

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

function usableKey(key: string): boolean {
  return Boolean(key) && !key.toLowerCase().includes('placeholder');
}

export function parseAiProvider(raw: string | undefined | null): AiProvider {
  return clean(raw).toLowerCase() === 'openai' ? 'openai' : 'deepseek';
}

export function parseAiDailyLimit(raw: string | undefined | null): number {
  const n = Number(clean(raw));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : AI_DAILY_LIMIT_DEFAULT;
}

/**
 * 환경변수에서 AI 설정을 읽는다. 키가 없으면 null(키워드만 사용).
 * - AI_API_KEY 가 있으면 AI_PROVIDER(기본 deepseek) 로 동작
 * - AI_API_KEY 가 없고 예전 OPENAI_API_KEY 만 있으면 openai 로 계속 동작
 */
export function resolveAiConfig(get: EnvGetter): AiConfig | null {
  const dailyLimit = parseAiDailyLimit(get('AI_DAILY_LIMIT'));
  const aiKey = clean(get('AI_API_KEY'));
  if (usableKey(aiKey)) {
    const provider = parseAiProvider(get('AI_PROVIDER'));
    const defaults = PROVIDER_DEFAULTS[provider];
    return {
      provider,
      apiKey: aiKey,
      model: clean(get('AI_MODEL')) || defaults.model,
      baseUrl: (clean(get('AI_BASE_URL')) || defaults.baseUrl).replace(
        /\/+$/,
        '',
      ),
      dailyLimit,
      legacy: false,
    };
  }

  const legacyKey = clean(get('OPENAI_API_KEY'));
  if (usableKey(legacyKey)) {
    const defaults = PROVIDER_DEFAULTS.openai;
    return {
      provider: 'openai',
      apiKey: legacyKey,
      model: clean(get('OPENAI_MODEL')) || defaults.model,
      baseUrl: (clean(get('OPENAI_BASE_URL')) || defaults.baseUrl).replace(
        /\/+$/,
        '',
      ),
      dailyLimit,
      legacy: true,
    };
  }
  return null;
}

export type AiPromptInput = {
  title: string;
  description?: string;
  snippet?: string;
  topicHint?: string;
  posts?: string[];
};

function collapse(text: string | undefined | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * AI 에 보낼 본문. 제목 → 소개 → 힌트 → 글 발췌 순으로 채우고
 * 전체가 maxChars 를 넘지 않게 자른다. (라벨 글자도 포함해 센다)
 */
export function buildAiUserPrompt(
  input: AiPromptInput,
  maxChars = AI_INPUT_MAX_CHARS,
): string {
  let left = maxChars;
  const lines: string[] = [];
  const push = (label: string, value: string) => {
    if (left <= 0) return;
    const head = `${label}: `;
    const room = left - head.length;
    if (room <= 0) return;
    const body = value.length > room ? value.slice(0, room) : value;
    lines.push(`${head}${body}`);
    left -= head.length + body.length + 1;
  };

  push('title', collapse(input.title) || '(none)');
  push(
    'description',
    collapse([input.description, input.snippet].filter(Boolean).join(' ')) ||
      '(none)',
  );
  const topic = collapse(input.topicHint);
  if (topic) push('topicHint', topic);
  const posts = (input.posts ?? []).map(collapse).filter(Boolean).slice(0, 20);
  for (let i = 0; i < posts.length; i += 1) {
    push(`post${i + 1}`, posts[i]);
  }
  return lines.join('\n');
}

export type AiVerdict = {
  category: string;
  confidence: number;
  reason?: string;
  /** 목록에 맞는 게 없을 때 AI 가 제안한 새 카테고리 이름 */
  newCategory?: string;
};

/** AI 가 제안한 새 카테고리 이름 정리. 쓸 수 없으면 null */
export function cleanSuggestedCategory(
  raw: unknown,
  existing: string[],
): string | null {
  if (typeof raw !== 'string') return null;
  const name = raw
    .replace(/["'`<>[\](){}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (name.length < 2 || name.length > 12) return null;
  if (/^(null|none|없음|기타|분류대기|n\/a)$/i.test(name)) return null;
  const key = name.replace(/\s/g, '');
  if (existing.some((item) => item.replace(/\s/g, '') === key)) return null;
  return name;
}

/** 응답 본문(JSON 문자열)을 읽는다. 우리 카테고리 목록에 없으면 null */
export function parseAiVerdict(
  content: string | null | undefined,
  allowedCategories: string[],
): AiVerdict | null {
  let text = clean(content);
  if (!text) return null;
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1];
  let parsed: {
    category?: unknown;
    confidence?: unknown;
    reason?: unknown;
    newCategory?: unknown;
  };
  try {
    parsed = JSON.parse(text) as typeof parsed;
  } catch {
    return null;
  }
  const category =
    typeof parsed.category === 'string' ? parsed.category.trim() : '';
  if (!category || !allowedCategories.includes(category)) return null;
  const rawConfidence = Number(parsed.confidence);
  const confidence = Number.isFinite(rawConfidence)
    ? Math.min(1, Math.max(0, rawConfidence))
    : 0.5;
  return {
    category,
    confidence,
    reason: typeof parsed.reason === 'string' ? parsed.reason : undefined,
    newCategory:
      cleanSuggestedCategory(parsed.newCategory, allowedCategories) ??
      undefined,
  };
}

export type AiSkipReason =
  | 'no_key'
  | 'confident'
  | 'illegal'
  | 'adult_keyword'
  | 'limit'
  | 'stopped'
  | 'error';

/**
 * AI 를 부르기 전에 걸러내는 조건. null 이면 호출 대상.
 * - 키가 없으면 키워드만
 * - 키워드 점수가 충분(0.7 이상)하면 AI 불필요
 * - 불법 의심(마약 등) 채널은 AI 에 보내지 않는다
 * - 방 이름에 성인 근거가 있으면 AI 가 뒤집지 못하게 AI 를 부르지 않는다(성인 보수 규칙).
 *   소개글에만 성인 낱말이 있으면 AI 에게 묻는다(사기 조회·DB 판매 같은 오분류 방지).
 */
export function aiSkipReason(input: {
  /** 전체 재분류: 키워드가 확실해도 AI 에게 묻는다 */
  force?: boolean;
  configured: boolean;
  keyword: { category: string; confidence: number; score?: number };
  title: string;
  description?: string;
  snippet?: string;
  posts?: string[];
}): AiSkipReason | null {
  if (!input.configured) return 'no_key';
  // 소개글에만 성인 낱말이 걸린 '성인'은 확실하다고 보지 않고 AI 에게 묻는다
  const adultFromDescOnly =
    input.keyword.category === ADULT_CATEGORY &&
    !hasAdultTitleEvidence(input.title);
  if (
    !input.force &&
    !adultFromDescOnly &&
    input.keyword.confidence >= AI_SKIP_KEYWORD_CONFIDENCE
  ) {
    return 'confident';
  }
  const text = [input.description, input.snippet, ...(input.posts ?? [])]
    .filter(Boolean)
    .join('\n');
  if (hasIllegalDrugSuspicion(input.title, text)) return 'illegal';
  // 방 이름에 성인 근거가 있을 때만 AI 를 건너뛴다.
  // 소개글에만 걸린 경우(예: "조건만남 사기꾼 조회", "출장안마 DB")는 AI 가 판단한다.
  if (
    input.keyword.category === ADULT_CATEGORY &&
    (input.keyword.score ?? 0) > 0 &&
    hasAdultTitleEvidence(input.title)
  ) {
    return 'adult_keyword';
  }
  return null;
}

/** 이 상태 코드면 오늘은 AI 를 더 부르지 않는다(과금·인증·서버 문제는 재시도로 안 풀림) */
export function shouldStopAiForToday(status: number): boolean {
  return (
    status === 429 ||
    status >= 500 ||
    status === 401 ||
    status === 402 ||
    status === 403
  );
}

export type AiBudgetSnapshot = {
  date: string;
  used: number;
  limit: number;
  stopped: boolean;
  stopReason: string | null;
};

export interface AiBudgetStored {
  used: number;
  stopReason: string | null;
}

/** 하루(KST) 호출 횟수와 "오늘 중단" 상태. 날짜가 바뀌면 0 으로 돌아간다. */
export class AiDailyBudget {
  private date = '';
  private used = 0;
  private stopReason: string | null = null;
  /** 오늘 숫자가 바뀌면 부른다 (DB 저장용) */
  onChange: (() => void) | null = null;

  constructor(
    private limit: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  setLimit(limit: number): void {
    this.limit = limit;
  }

  private rollover(): void {
    const today = formatKstYmd(this.now());
    if (today !== this.date) {
      this.date = today;
      this.used = 0;
      this.stopReason = null;
    }
  }

  /** 호출 한 번을 쓴다. 상한이 찼거나 오늘 중단이면 false */
  tryAcquire(): boolean {
    this.rollover();
    if (this.stopReason) return false;
    if (this.used >= this.limit) return false;
    this.used += 1;
    this.onChange?.();
    return true;
  }

  stopToday(reason: string): void {
    this.rollover();
    this.stopReason = reason;
    this.onChange?.();
  }

  /** 오늘 사용 수·중단 이유 (DB 저장용) */
  exportState(): { date: string; values: AiBudgetStored } {
    this.rollover();
    return {
      date: this.date,
      values: { used: this.used, stopReason: this.stopReason },
    };
  }

  /** 서버를 다시 켰을 때 오늘 저장된 값으로 되돌린다 (이미 센 값보다 작아지지 않게) */
  restore(saved: Partial<AiBudgetStored>): void {
    this.rollover();
    this.used = Math.max(this.used, safeCount(saved.used));
    if (
      !this.stopReason &&
      typeof saved.stopReason === 'string' &&
      saved.stopReason
    ) {
      this.stopReason = saved.stopReason.slice(0, 200);
    }
  }

  snapshot(): AiBudgetSnapshot {
    this.rollover();
    return {
      date: this.date,
      used: this.used,
      limit: this.limit,
      stopped: Boolean(this.stopReason) || this.used >= this.limit,
      stopReason: this.stopReason,
    };
  }
}
