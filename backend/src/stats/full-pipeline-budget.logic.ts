import { VERIFY_RECHECK_GAP_MS } from '../channels/channel-verify.logic';
import {
  DISCOVERY_DELAY_MS,
  DISCOVERY_MAX_PER_DAY,
} from './channel-discovery.logic';
import {
  DISCOVERY_BUDGET_MIN_DEFAULT,
  COLLECT_FULL_BUDGET_MIN_DEFAULT,
  VERIFY_RECHECK_BUDGET_MIN_DEFAULT,
} from './collect-budget.logic';
import {
  KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
  KEYWORD_SEARCH_GAP_MS,
} from './mtproto-budget.logic';

/** t.me + t.me/s 공개 페이지 확인 */
export const DISCOVERY_INSPECT_HTTP_MS = 2_000;
/** contacts.Search 1회 */
export const KEYWORD_SEARCH_RPC_MS = 3_000;
/** getChatAdministrators */
export const VERIFY_RECHECK_HTTP_MS = 2_000;
/** 언어 판별·점수·prune 은 DB만. 네트워크 없음 */
export const LANGUAGE_SCORE_PRUNE_WORST_MIN = 5;

export function loopWorstMs(
  count: number,
  workMs: number,
  gapMs: number,
): number {
  if (count <= 0) return 0;
  return count * workMs + Math.max(0, count - 1) * gapMs;
}

export function msToMinutes(ms: number): number {
  return Math.round((ms / 60_000) * 10) / 10;
}

export function discoveryUncappedWorstMs(
  count = DISCOVERY_MAX_PER_DAY,
): number {
  return loopWorstMs(count, DISCOVERY_INSPECT_HTTP_MS, DISCOVERY_DELAY_MS);
}

export function keywordSearchUncappedWorstMs(
  count = KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
): number {
  return loopWorstMs(count, KEYWORD_SEARCH_RPC_MS, KEYWORD_SEARCH_GAP_MS);
}

export function verifyRecheckUncappedWorstMs(count: number): number {
  return loopWorstMs(count, VERIFY_RECHECK_HTTP_MS, VERIFY_RECHECK_GAP_MS);
}

/** 키워드 검색 최악이 5분을 넘으면 예산을 건다 */
export function keywordSearchNeedsTimeBudget(
  count = KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
): boolean {
  return msToMinutes(keywordSearchUncappedWorstMs(count)) > 5;
}

export function fullPipelineBudgetedWorstMinutes(
  keywordWorstMin = msToMinutes(keywordSearchUncappedWorstMs()),
): number {
  return (
    COLLECT_FULL_BUDGET_MIN_DEFAULT +
    LANGUAGE_SCORE_PRUNE_WORST_MIN +
    VERIFY_RECHECK_BUDGET_MIN_DEFAULT +
    DISCOVERY_BUDGET_MIN_DEFAULT +
    keywordWorstMin
  );
}
