/** 검색 금지어 차단 안내 문구 (회원 화면에 그대로 표시) */
export const SEARCH_BLOCKED_MESSAGE = '해당 검색어는 허용하지 않습니다.';

/** 금지어·예외어는 정규화 후 최소 이 글자 수 이상이어야 한다. */
export const SEARCH_TERM_MIN_LENGTH = 2;
/** DB 컬럼(term_normalized) 길이와 맞춘다. */
export const SEARCH_TERM_MAX_LENGTH = 64;
/** 검색 기록에 저장하는 원문·정규화 문자열의 최대 글자 수 */
export const SEARCH_LOG_TEXT_MAX = 100;

/** 한글(완성형·자모)·영문 소문자·숫자 외 모든 문자를 지운다. */
const NON_KEEP = /[^0-9a-z\u3131-\u318e\uac00-\ud7a3]/g;
const SPACE_AND_INVISIBLE = /[\s\u200b-\u200f\u2028\u2029\u2060\ufeff]/g;

/**
 * 금지어 비교용 정규화.
 * NFKC(전각→반각 등) → 소문자 → 공백·제로폭·기호·문장부호 제거, 한글·영문·숫자만 남김.
 * 예) "마.약", "마-약", "마_약", "마 약" → "마약"
 */
export function normalizeForBlocking(text: string | null | undefined): string {
  if (!text) return '';
  return text.normalize('NFKC').toLowerCase().replace(NON_KEEP, '');
}

/**
 * 검색 기록 집계용 정규화.
 * 가능하면 금지어 비교와 같은 규칙을 쓰고, 한글·영문·숫자가 하나도 없는 검색어(외국어 등)는
 * 공백·제로폭만 지운 값을 쓴다.
 */
export function normalizeForLog(text: string | null | undefined): string {
  if (!text) return '';
  const strict = normalizeForBlocking(text);
  if (strict) return strict;
  return text.normalize('NFKC').toLowerCase().replace(SPACE_AND_INVISIBLE, '');
}

/** 코드 포인트 기준으로 자른다(이모지 중간 절단 방지). */
export function truncateText(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

/** 숫자 7개 이상이 이어진 덩어리(전화·계좌번호 모양)를 '#' 으로 가린다. */
export function maskDigitRuns(text: string): string {
  return text.replace(/\d(?:[\s\-.()]*\d){6,}/g, '#');
}

const EMAIL_LIKE = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** 이메일 모양이면 기록하지 않는다. */
export function looksLikeEmail(text: string): boolean {
  return EMAIL_LIKE.test(text);
}

export interface SearchLogText {
  raw: string;
  normalized: string;
}

/**
 * 검색 기록에 저장할 문자열을 만든다. 저장하면 안 되는 검색어면 null.
 * 숫자 7자리 이상은 '#' 으로 가리고, 이메일 모양은 저장하지 않는다.
 */
export function buildSearchLogText(
  query: string | null | undefined,
): SearchLogText | null {
  const trimmed = (query ?? '').trim();
  if (!trimmed) return null;
  if (looksLikeEmail(trimmed)) return null;
  const masked = maskDigitRuns(trimmed);
  const raw = truncateText(masked, SEARCH_LOG_TEXT_MAX);
  const normalized = truncateText(normalizeForLog(masked), SEARCH_LOG_TEXT_MAX);
  if (!normalized) return null;
  return { raw, normalized };
}

export interface SearchTermSets {
  /** 정규화된 금지어(켜진 것만) */
  block: string[];
  /** 정규화된 예외어(켜진 것만) */
  allow: string[];
}

export interface SearchCheckResult {
  blocked: boolean;
  matchedTerm?: string;
}

function occurrences(text: string, term: string): number[] {
  const found: number[] = [];
  if (!term) return found;
  let from = 0;
  for (;;) {
    const index = text.indexOf(term, from);
    if (index < 0) break;
    found.push(index);
    from = index + 1;
  }
  return found;
}

/**
 * 검색어가 금지어를 포함하는지 판정한다.
 * 금지어가 나타난 각 위치가 예외어 하나에 완전히 덮여 있으면 허용, 하나라도 덮이지 않으면 차단.
 * 예) 금지어 "마약", 예외어 "마약김밥": "마약김밥 맛집" 허용, "마약김밥 마약" 차단.
 */
export function checkSearchText(
  query: string | null | undefined,
  sets: SearchTermSets,
): SearchCheckResult {
  const normalized = normalizeForBlocking(query);
  if (!normalized) return { blocked: false };

  const covered: Array<[number, number]> = [];
  for (const allow of sets.allow) {
    for (const start of occurrences(normalized, allow)) {
      covered.push([start, start + allow.length]);
    }
  }

  for (const block of sets.block) {
    for (const start of occurrences(normalized, block)) {
      const end = start + block.length;
      const isCovered = covered.some(
        ([coverStart, coverEnd]) => start >= coverStart && end <= coverEnd,
      );
      if (!isCovered) return { blocked: true, matchedTerm: block };
    }
  }
  return { blocked: false };
}

/** 금지어/예외어 입력값 검증 결과. 문제가 있으면 한국어 오류 메시지를 담는다. */
export function validateTermInput(
  term: string | null | undefined,
): { normalized: string } | { error: string } {
  const normalized = normalizeForBlocking(term);
  if (normalized.length < SEARCH_TERM_MIN_LENGTH) {
    return {
      error: `공백·기호를 뺀 한글·영문·숫자가 ${SEARCH_TERM_MIN_LENGTH}자 이상이어야 합니다.`,
    };
  }
  if (normalized.length > SEARCH_TERM_MAX_LENGTH) {
    return {
      error: `공백·기호를 뺀 글자가 ${SEARCH_TERM_MAX_LENGTH}자 이하여야 합니다.`,
    };
  }
  return { normalized };
}
