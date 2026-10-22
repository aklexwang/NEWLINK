import type { LinkType } from './channel';

export type ChannelGrade = 'S' | 'A' | 'B' | 'C' | 'D';
export type ChannelPostMediaType = 'text' | 'photo' | 'video' | 'file' | 'other';
export type ChannelEventType =
  | 'first_seen'
  | 'title_changed'
  | 'username_changed'
  | 'rank_up'
  | 'gone'
  | 'returned'
  | 'unverified';

export type ChannelBadgeCode =
  | 'high_engagement'
  | 'new'
  | 'popular'
  | 'low_data'
  | 'views_anomaly';

export interface ChannelBadge {
  code: ChannelBadgeCode;
  label: string;
}

export interface ChannelLatestScore {
  scoredOn: string;
  total: number;
  grade: ChannelGrade;
  scaleScore: number;
  viewRateScore: number;
  activityScore: number;
  growthScore: number;
  manipulationSuspected: boolean;
  overallRank: number | null;
  categoryRank: number | null;
}

export interface ChannelDetail {
  id: string;
  title: string;
  username: string | null;
  link: string;
  linkType: LinkType;
  category: string;
  description: string;
  avatarUrl: string | null;
  memberCount: number | null;
  firstObservedAt: string | null;
  lastCollectedAt: string | null;
  collectStatus?:
    | 'ok'
    | 'failed'
    | 'gone'
    | 'private'
    | 'invalid'
    | 'invite_only'
    | 'invite_expired'
    | 'merged'
    | null;
  observedDays: number | null;
  score: number | null;
  grade: ChannelGrade | null;
  viewRate: number | null;
  growth24h: number | null;
  growth7d: number | null;
  growth30d: number | null;
  medianViews7d: number | null;
  posts7d: number | null;
  isVerified?: boolean;
  verifiedAt?: string | null;
  latestScore: ChannelLatestScore | null;
  badges: ChannelBadge[];
}

export interface ChannelStatsPoint {
  date: string;
  memberCount: number | null;
  medianViews7d: number | null;
}

export interface ChannelStatsSeries {
  channelId: string;
  range: number;
  points: ChannelStatsPoint[];
}

export interface ChannelPostItem {
  messageId: number;
  postedAt: string;
  views: number | null;
  mediaType: ChannelPostMediaType;
  link: string;
}

export interface ChannelEventItem {
  id: string;
  type: ChannelEventType;
  before: string | null;
  after: string | null;
  occurredAt: string;
}

export interface ChannelMediaMix {
  channelId: string;
  rangeDays: number;
  total: number;
  byType: Record<ChannelPostMediaType, number>;
  topSources: { source: string; count: number }[];
}

export interface WeeklyStatsEvent {
  id: string;
  channelId: string;
  channelTitle: string | null;
  username: string | null;
  type: ChannelEventType;
  before: string | null;
  after: string | null;
  occurredAt: string;
}

export interface WeeklyStats {
  week: string;
  start: string;
  end: string;
  counts: {
    titleChanged: number;
    usernameChanged: number;
    firstSeen: number;
    rankUp: number;
  };
  titleChanged: WeeklyStatsEvent[];
  usernameChanged: WeeklyStatsEvent[];
  firstSeen: WeeklyStatsEvent[];
  rankUp: WeeklyStatsEvent[];
}

export interface CompareStatsItem {
  id: string;
  title: string;
  username: string | null;
  score: number | null;
  grade: ChannelGrade | null;
  viewRate: number | null;
  growth7d: number | null;
  memberCount: number | null;
  badges: ChannelBadge[];
  latestScore: ChannelLatestScore | null;
  stats: ChannelStatsPoint[];
}

export interface CompareStats {
  items: CompareStatsItem[];
}

export type RankingSort =
  | 'score'
  | 'members'
  | 'views'
  | 'viewRate'
  | 'rising'
  | 'growth24h'
  | 'growth7d'
  | 'growth30d'
  | 'activity'
  | 'newest';
