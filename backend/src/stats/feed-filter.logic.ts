/** 홈 "최근 활발한 채널" 광고 거르기 (순수 함수) */

export const DEFAULT_FEED_EXCLUDE_CATEGORIES = [
  '홍보',
  '카지노',
  '계정매입',
  '계정거래',
  '대출',
  '성인',
  '쇼핑',
];

export const DEFAULT_FEED_AD_WORDS = [
  '문의 @',
  '문의@',
  '바인',
  '매입',
  '삽니다',
  '판매',
  '입금',
  '이벤트',
  '잭팟',
  '전번당',
  '가입코드',
  '첫충',
  '매충',
  '보증',
  '총판',
  '구인',
  '수익 보장',
  '대출',
];

export const DEFAULT_FEED_AD_MIN_HITS = 2;

export type FeedFilterSettings = {
  excludeCategories: string[];
  adWords: string[];
  /** 광고 단어가 이만큼 이상 들어가면 광고로 본다 */
  minHits: number;
};

export function defaultFeedFilter(): FeedFilterSettings {
  return {
    excludeCategories: [...DEFAULT_FEED_EXCLUDE_CATEGORIES],
    adWords: [...DEFAULT_FEED_AD_WORDS],
    minHits: DEFAULT_FEED_AD_MIN_HITS,
  };
}

export function cleanWords(list: unknown, max = 80): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const w = raw.trim().slice(0, 30);
    if (!w || seen.has(w.toLowerCase())) continue;
    seen.add(w.toLowerCase());
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeFeedFilter(
  input: Partial<FeedFilterSettings> | null | undefined,
): FeedFilterSettings {
  const base = defaultFeedFilter();
  if (!input) return base;
  const hits = Number(input.minHits);
  return {
    excludeCategories: input.excludeCategories
      ? cleanWords(input.excludeCategories, 60)
      : base.excludeCategories,
    adWords: input.adWords ? cleanWords(input.adWords) : base.adWords,
    minHits:
      Number.isFinite(hits) && hits >= 1 && hits <= 5
        ? Math.floor(hits)
        : base.minHits,
  };
}

/** 글에 들어간 광고 단어 수 (같은 단어는 한 번) */
export function countAdHits(
  text: string | null | undefined,
  words: string[],
): number {
  if (!text || words.length === 0) return 0;
  const hay = text.toLowerCase().replace(/\s+/g, ' ');
  let hits = 0;
  for (const w of words) {
    if (hay.includes(w.toLowerCase())) hits += 1;
  }
  return hits;
}

export function isAdPost(
  text: string | null | undefined,
  settings: FeedFilterSettings,
): boolean {
  return countAdHits(text, settings.adWords) >= settings.minHits;
}
