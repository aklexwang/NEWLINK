/** 한글(완성형·자모) */
export const HANGUL_RE = /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/g;

/** 유니코드 글자(숫자·기호 제외) */
const LETTER_RE =
  /[A-Za-z\u00C0-\u024F\u0400-\u04FF\u0370-\u03FF\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F\u3040-\u30FF\u4E00-\u9FFF\u0600-\u06FF\u0E00-\u0E7F\u0590-\u05FF\u0900-\u097F]/g;

const INVALID_TITLE_RE =
  /^(telegram\s*:?\s*contact|contact\s*@|undefined|null)$/i;

/** 최근 게시글 몇 개를 언어 판별에 쓸지 */
export const LANGUAGE_POST_LIMIT = 20;

/** 게시글 본문에서 남길 앞부분 길이 */
export const LANGUAGE_EXCERPT_MAX = 200;

/** 이보다 글자가 적으면 unknown */
export const LANGUAGE_MIN_LETTERS = 10;

/** 이 비율 이상이면 한국어 */
export const LANGUAGE_KO_MIN_RATIO = 0.12;

/** 글자는 충분한데 한글이 이 비율 이하면 외국어 */
export const LANGUAGE_FOREIGN_MAX_RATIO = 0.03;

/** 이보다 게시글 본문이 적으면 영문만으로 foreign 하지 않음 */
export const LANGUAGE_MIN_POST_EXCERPTS = 5;

/** 제목·설명에서 외국 문자가 이만큼이면 바로 foreign */
export const LANGUAGE_FOREIGN_SCRIPT_MIN = 4;

export type ChannelLanguage = 'ko' | 'foreign' | 'unknown';

export type LanguageDetectReason =
  | 'hangul'
  | 'cyrillic'
  | 'arabic'
  | 'thai'
  | 'other_script'
  | 'posts'
  | 'sparse'
  | 'empty';

export type LanguageDetectResult = {
  language: ChannelLanguage;
  reason: LanguageDetectReason;
};

const SCRIPT_PATTERNS: Array<{
  reason: Extract<
    LanguageDetectReason,
    'cyrillic' | 'arabic' | 'thai' | 'other_script'
  >;
  re: RegExp;
}> = [
  { reason: 'cyrillic', re: /[\u0400-\u04FF]/g },
  { reason: 'arabic', re: /[\u0600-\u06FF]/g },
  { reason: 'thai', re: /[\u0E00-\u0E7F]/g },
  {
    reason: 'other_script',
    re: /[\u0370-\u03FF\u0590-\u05FF\u0900-\u097F\u3040-\u30FF\u4E00-\u9FFF]/g,
  },
];

export function hasHangul(text: string | null | undefined): boolean {
  if (!text) return false;
  return /[\uAC00-\uD7A3\u1100-\u11FF\u3130-\u318F]/.test(text);
}

export function isPlaceholderContactTitle(
  title: string | null | undefined,
): boolean {
  const t = (title ?? '').trim();
  if (!t) return false;
  if (INVALID_TITLE_RE.test(t)) return true;
  return /^telegram:\s*contact@/i.test(t);
}

export function clipPostExcerpt(
  raw: string | null | undefined,
  max = LANGUAGE_EXCERPT_MAX,
): string | null {
  const text = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= max) return text;
  return text.slice(0, max);
}

export function countLetters(text: string): {
  letters: number;
  hangul: number;
} {
  LETTER_RE.lastIndex = 0;
  HANGUL_RE.lastIndex = 0;
  const letters = text.match(LETTER_RE)?.length ?? 0;
  const hangul = text.match(HANGUL_RE)?.length ?? 0;
  return { letters, hangul };
}

export function hangulRatio(text: string): number {
  const { letters, hangul } = countLetters(text);
  if (letters <= 0) return 0;
  return hangul / letters;
}

function nonemptyExcerpts(
  excerpts: Array<string | null | undefined> | undefined,
): string[] {
  return (excerpts ?? [])
    .map((part) => (part ?? '').trim())
    .filter(Boolean);
}

export function hasDistinctForeignScript(text: string | null | undefined): boolean {
  return detectDistinctForeignScript(text ?? '') != null;
}

function detectDistinctForeignScript(
  text: string,
): Extract<LanguageDetectReason, 'cyrillic' | 'arabic' | 'thai' | 'other_script'> | null {
  let best: {
    reason: Extract<
      LanguageDetectReason,
      'cyrillic' | 'arabic' | 'thai' | 'other_script'
    >;
    count: number;
  } | null = null;
  for (const { reason, re } of SCRIPT_PATTERNS) {
    re.lastIndex = 0;
    const count = text.match(re)?.length ?? 0;
    if (count < LANGUAGE_FOREIGN_SCRIPT_MIN) continue;
    if (!best || count > best.count) best = { reason, count };
  }
  return best?.reason ?? null;
}

export type LanguageDetectInput = {
  title?: string | null;
  description?: string | null;
  excerpts?: Array<string | null | undefined>;
};

/** 제목·설명·게시글 앞부분을 모아 언어를 판별합니다. */
export function detectChannelLanguageResult(
  input: LanguageDetectInput,
): LanguageDetectResult {
  const title = (input.title ?? '').trim();
  const description = (input.description ?? '').trim();
  const excerpts = nonemptyExcerpts(input.excerpts);
  const header = [title, description].filter(Boolean).join('\n');
  const combined = [header, ...excerpts].filter(Boolean).join('\n');
  if (!combined) return { language: 'unknown', reason: 'empty' };

  const { letters, hangul } = countLetters(combined);
  if (letters >= LANGUAGE_MIN_LETTERS) {
    const ratio = hangul / letters;
    if (ratio >= LANGUAGE_KO_MIN_RATIO) {
      return { language: 'ko', reason: 'hangul' };
    }
  } else if (hasHangul(header)) {
    return { language: 'unknown', reason: 'sparse' };
  }

  const script = detectDistinctForeignScript(header);
  if (script) return { language: 'foreign', reason: script };

  if (excerpts.length < LANGUAGE_MIN_POST_EXCERPTS) {
    return { language: 'unknown', reason: 'sparse' };
  }

  if (letters < LANGUAGE_MIN_LETTERS) {
    return { language: 'unknown', reason: 'sparse' };
  }
  const ratio = hangul / letters;
  if (ratio <= LANGUAGE_FOREIGN_MAX_RATIO) {
    return { language: 'foreign', reason: 'posts' };
  }
  return { language: 'unknown', reason: 'sparse' };
}

export function detectChannelLanguage(
  input: LanguageDetectInput,
): ChannelLanguage {
  return detectChannelLanguageResult(input).language;
}

/**
 * 그룹은 본문을 저장하지 않으므로, 수집 때 계산해 둔 한글 비율만 다시 씁니다.
 * 비율이 없으면 제목·소개만 봅니다.
 */
export function detectGroupLanguageFromStoredRatio(input: {
  title?: string | null;
  description?: string | null;
  hangulRatio?: number | null;
}): ChannelLanguage {
  if (input.hangulRatio == null || !Number.isFinite(input.hangulRatio)) {
    return detectChannelLanguage({
      title: input.title,
      description: input.description,
    });
  }
  const header = [input.title, input.description]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join('\n');
  if (input.hangulRatio >= LANGUAGE_KO_MIN_RATIO) return 'ko';
  const script = detectDistinctForeignScript(header);
  if (script) return 'foreign';
  if (input.hangulRatio <= LANGUAGE_FOREIGN_MAX_RATIO) return 'foreign';
  return 'unknown';
}

export function foreignReasonLabel(reason: LanguageDetectReason): string {
  if (reason === 'cyrillic') return '키릴문자';
  if (reason === 'posts') return '게시글본문';
  return '기타';
}

/** 홈·랭킹 기본값에 넣을지 (외국어만 제외) */
export function isDefaultPublicLanguage(
  language: ChannelLanguage | string | null | undefined,
): boolean {
  return language !== 'foreign';
}

/** 어드민이 직접 넣은 채널 (제보·자동등록 아님) */
export function isAdminDirectRegistered(channel: {
  autoRegistered?: boolean | null;
  submittedBy?: number | null;
}): boolean {
  return channel.autoRegistered !== true && channel.submittedBy == null;
}

/** 광고 채널은 언어와 상관없이 공개 화면에 남김. 비활성은 광고여도 뺀다. */
export function isVisibleOnPublicLists(channel: {
  language?: ChannelLanguage | string | null;
  isPromoted?: boolean | null;
  isVisible?: boolean | null;
  autoRegistered?: boolean | null;
  submittedBy?: number | null;
}): boolean {
  if (channel.isVisible === false) return false;
  if (channel.isPromoted) return true;
  if (
    isAdminDirectRegistered(channel) &&
    (channel.language == null || channel.language === 'unknown')
  ) {
    return true;
  }
  return isDefaultPublicLanguage(channel.language);
}
