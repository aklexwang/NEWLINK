import { DISCOVERY_MAX_PER_DAY } from './channel-discovery.logic';

/** ResolveUsername + GetFullChannel */
export const MTPROTO_INSPECT_COST = 2;

/** contacts.Search 1회 */
export const MTPROTO_KEYWORD_SEARCH_COST = 1;

export const KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT = 10;
export const KEYWORD_SEARCH_GAP_MS = 10_000;

export function envPositiveInt(
  raw: string | undefined,
  fallback: number,
): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function remainingMtprotoRequests(
  usedToday: number,
  dailyLimit: number,
): number {
  if (!Number.isFinite(usedToday) || !Number.isFinite(dailyLimit)) return 0;
  return Math.max(0, Math.floor(dailyLimit) - Math.floor(usedToday));
}

export function canRunAnotherKeywordSearch(
  usedToday: number,
  cap = KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
): boolean {
  return usedToday < cap;
}

export function nextKeywordSearchDelayMs(
  index: number,
  gapMs = KEYWORD_SEARCH_GAP_MS,
): number {
  return index <= 0 ? 0 : gapMs;
}

export type MtprotoPhaseSplit = {
  remaining: number;
  discoveryInspects: number;
  discoveryRequests: number;
  keywordSearches: number;
  keywordRequests: number;
  leftover: number;
};

/**
 * 수집이 끝난 뒤 남은 예산을 눈덩이 → 키워드 검색 순으로 나눕니다.
 * 키워드 검색 상한만큼을 먼저 남겨 두고, 나머지로 눈덩이 검사를 합니다.
 */
export function splitRemainingAfterCollect(input: {
  remaining: number;
  discoveryInspectCap?: number;
  discoveryCost?: number;
  keywordSearchCap?: number;
  keywordCost?: number;
}): MtprotoPhaseSplit {
  const remaining = Math.max(0, Math.floor(input.remaining));
  const discoveryInspectCap =
    input.discoveryInspectCap ?? DISCOVERY_MAX_PER_DAY;
  const discoveryCost = input.discoveryCost ?? MTPROTO_INSPECT_COST;
  const keywordSearchCap =
    input.keywordSearchCap ?? KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT;
  const keywordCost = input.keywordCost ?? MTPROTO_KEYWORD_SEARCH_COST;

  const keywordReserve = Math.min(keywordSearchCap * keywordCost, remaining);
  const forDiscovery = remaining - keywordReserve;
  const discoveryInspects = Math.min(
    discoveryInspectCap,
    discoveryCost > 0 ? Math.floor(forDiscovery / discoveryCost) : 0,
  );
  const discoveryRequests = discoveryInspects * discoveryCost;
  const afterDiscovery = remaining - discoveryRequests;
  const keywordSearches = Math.min(
    keywordSearchCap,
    keywordCost > 0 ? Math.floor(afterDiscovery / keywordCost) : 0,
  );
  const keywordRequests = keywordSearches * keywordCost;
  return {
    remaining,
    discoveryInspects,
    discoveryRequests,
    keywordSearches,
    keywordRequests,
    leftover: remaining - discoveryRequests - keywordRequests,
  };
}
