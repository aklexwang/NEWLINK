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
  | 'unverified'
  | 'category_changed'
  | 'visibility_changed';

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
  /** 서버가 일별 기록으로 계산한 회원 증감 수(명). 없으면 증가율로 계산 */
  memberDelta24h?: number | null;
  memberDelta7d?: number | null;
  memberDelta30d?: number | null;
  medianViews7d: number | null;
  posts7d: number | null;
  activity7d?: number | null;
  isVerified?: boolean;
  verifiedAt?: string | null;
  isVisible?: boolean;
  latestScore: ChannelLatestScore | null;
  badges: ChannelBadge[];
  /** 텔레그램 개설일 (MTProto 로 확인된 것만) */
  createdOn?: string | null;
  /** 채널이면 연결된 대화방(discussion), 그룹이면 부모 채널(parent) */
  linkedChat?: ChannelLinkedChat | null;
}

export interface ChannelLinkedChat {
  role: 'discussion' | 'parent';
  title: string | null;
  username: string | null;
  /** 우리 목록에 있고 회원에게 보여도 되는 행이면 그 id */
  channelId: string | null;
  memberCount: number | null;
  isPrivate: boolean;
  createdOn: string | null;
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
  memberDelta7d?: number | null;
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
