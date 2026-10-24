import { LinkType } from '../channels/channel.entity';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from '../channels/telegram-username';

export type StatsCollectMode = 'full' | 'light';

export const FULL_PIPELINE_STEPS = [
  'collect',
  'language',
  'metrics',
  'prune',
  'verify',
  'discovery',
  'keyword',
] as const;

export const LIGHT_PIPELINE_STEPS = [
  'previewCollect',
  'clearPublicCache',
] as const;

export const FULL_WAIT_FOR_LIGHT_MS = 10 * 60 * 1000;

/** UTC cron. KST 03:05 */
export const STATS_CRON_FULL_UTC = '5 18 * * *';

/** UTC cron. KST 06:05, 09:05, 12:05, 15:05, 18:05, 21:05, 00:05 */
export const STATS_CRON_LIGHT_UTC = [
  '5 21 * * *',
  '5 0 * * *',
  '5 3 * * *',
  '5 6 * * *',
  '5 9 * * *',
  '5 12 * * *',
  '5 15 * * *',
] as const;

export function parseStatsCollectMode(
  raw?: string | null,
): StatsCollectMode {
  return (raw ?? '').trim().toLowerCase() === 'light' ? 'light' : 'full';
}

export function statsCronModeFromSchedule(input: {
  eventName?: string | null;
  schedule?: string | null;
  dispatchMode?: string | null;
}): StatsCollectMode {
  if (input.eventName === 'workflow_dispatch') {
    return parseStatsCollectMode(input.dispatchMode || 'light');
  }
  if ((input.schedule ?? '').trim() === STATS_CRON_FULL_UTC) return 'full';
  return 'light';
}

export function statsCronWaitMinutes(mode: StatsCollectMode): number {
  return mode === 'light' ? 35 : 110;
}

export type CollectOverlapDecision =
  | { action: 'start' }
  | { action: 'skip_conflict' }
  | { action: 'skip_busy' }
  | { action: 'wait_for_light' };

export function decideCollectOverlap(input: {
  requested: StatsCollectMode;
  running: StatsCollectMode | null;
}): CollectOverlapDecision {
  if (input.running == null) return { action: 'start' };
  if (input.requested === 'light') return { action: 'skip_conflict' };
  if (input.running === 'light') return { action: 'wait_for_light' };
  return { action: 'skip_busy' };
}

/** light 대상: 공개 username 이 있는 채널. 그룹·초대방 제외 */
export function isLightCollectTarget(channel: {
  linkType?: string | null;
  username?: string | null;
  link?: string | null;
}): boolean {
  if (channel.linkType !== LinkType.CHANNEL && channel.linkType !== 'channel') {
    return false;
  }
  if (isInviteOnlyLink(channel.link)) return false;
  const fromCol = channel.username?.replace(/^@/, '').trim();
  if (fromCol) return true;
  return extractTelegramUsernameFromLink(channel.link) != null;
}

/** 피드「마지막 게시」= 수집된 글 postedAt 최댓값. light 미리보기가 이 값을 3시간 안에 갱신한다 */
export function lastPostAtFromCollectedPosts(
  posts: Array<{ postedAt: Date | string }>,
): Date | null {
  let latest: Date | null = null;
  for (const post of posts) {
    const at =
      post.postedAt instanceof Date
        ? post.postedAt
        : new Date(post.postedAt);
    if (Number.isNaN(at.getTime())) continue;
    if (!latest || at.getTime() > latest.getTime()) latest = at;
  }
  return latest;
}
