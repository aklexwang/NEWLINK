import { apiClient } from './client';
import type {
  ChannelDetail,
  ChannelEventItem,
  ChannelMediaMix,
  ChannelPostItem,
  ChannelStatsSeries,
  CompareStats,
  WeeklyStats,
} from '../types/stats';

export type {
  ChannelDetail,
  ChannelEventItem,
  ChannelMediaMix,
  ChannelPostItem,
  ChannelStatsSeries,
} from '../types/stats';

export async function verifyChannelOwner(id: string): Promise<{
  id: string;
  isVerified: boolean;
  verifiedAt: string;
}> {
  const { data } = await apiClient.post(`/channels/${id}/verify`);
  return data;
}

export async function getChannelDetailByUsername(username: string): Promise<ChannelDetail> {
  const { data } = await apiClient.get<ChannelDetail>(
    `/channels/by-username/${encodeURIComponent(username)}/detail`,
  );
  return data;
}

export async function getChannelDetailById(id: string): Promise<ChannelDetail> {
  const { data } = await apiClient.get<ChannelDetail>(`/channels/${id}/detail`);
  return data;
}

export async function getChannelStats(id: string, range: 7 | 14 | 30 = 7): Promise<ChannelStatsSeries> {
  const { data } = await apiClient.get<ChannelStatsSeries>(`/channels/${id}/stats`, {
    params: { range: String(range) },
  });
  return data;
}

export async function getChannelPosts(id: string, limit = 20): Promise<ChannelPostItem[]> {
  const { data } = await apiClient.get<ChannelPostItem[]>(`/channels/${id}/posts`, {
    params: { limit },
  });
  return data;
}

export async function getChannelEvents(id: string, limit = 20): Promise<ChannelEventItem[]> {
  const { data } = await apiClient.get<ChannelEventItem[]>(`/channels/${id}/events`, {
    params: { limit },
  });
  return data;
}

export async function getChannelMediaMix(id: string): Promise<ChannelMediaMix> {
  const { data } = await apiClient.get<ChannelMediaMix>(`/channels/${id}/media-mix`);
  return data;
}

export interface HomeCard {
  id: string;
  title: string;
  username: string | null;
  link: string;
  avatarUrl: string | null;
  score?: number | null;
  memberCount?: number | null;
  category: string;
  linkType: 'channel' | 'group';
  grade?: string | null;
}

export interface HomeHeadlines {
  risingTitle: string | null;
  risingId: string | null;
  risingUsername: string | null;
  risingLink: string | null;
  firstSeenCount: number;
  rankUpCount: number;
  firstSeen: { id: string; title: string | null; username: string | null }[];
  rankUp: { id: string; title: string | null; username: string | null }[];
}

export interface HomeDashboard {
  week: string;
  topBy: 'score' | 'members';
  topChannels: HomeCard[];
  headlines: HomeHeadlines;
  promoted: HomeCard[];
}

export interface HomeFeedItem {
  id: string;
  title: string;
  username: string | null;
  link: string;
  avatarUrl: string | null;
  category: string;
  linkType: 'channel' | 'group';
  memberCount: number | null;
  growth7d: number | null;
  memberDelta7d?: number | null;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | null;
  score: number | null;
  lastPostAt: string;
  activityKind?: 'post' | 'members';
  /** 채널의 최근 글 하나 (앞부분 200자) */
  latestPost?: {
    messageId: number;
    text: string | null;
    mediaType: string;
    views: number | null;
    postedAt: string;
  } | null;
}

export interface HomeFeedPage {
  items: HomeFeedItem[];
  nextCursor: string | null;
}

export async function getHomeDashboard(): Promise<HomeDashboard> {
  const { data } = await apiClient.get<HomeDashboard>('/stats/home');
  return data;
}

export async function getHomeFeed(params: {
  type?: 'channel' | 'all' | 'group';
  cursor?: string;
  limit?: number;
}): Promise<HomeFeedPage> {
  const { data } = await apiClient.get<HomeFeedPage>('/stats/feed', { params });
  return data;
}

export async function getWeeklyStats(week?: string): Promise<WeeklyStats> {
  const { data } = await apiClient.get<WeeklyStats>('/stats/weekly', {
    params: week ? { week } : undefined,
  });
  return data;
}

export async function getCompareStats(ids: string[]): Promise<CompareStats> {
  const { data } = await apiClient.get<CompareStats>('/stats/compare', {
    params: { ids: ids.join(',') },
  });
  return data;
}

/** 목록 카드 요약 (검색·즐겨찾기) */
export interface ChannelSummary {
  id: string;
  rank: number | null;
  rankTotal: number;
  score: number | null;
  grade: string | null;
  medianViews7d: number | null;
  viewRate: number | null;
  memberDelta7d: number | null;
  growth7d: number | null;
  posts7d: number | null;
  /** 지금까지 올린 글 수 추정(가장 큰 글 번호). 그룹은 null */
  postsApprox: number | null;
  collectedPosts: number;
  photos: number;
  videos: number;
  /** 이 채널을 언급·전달한 다른 방 수 */
  mentions: number;
  observedDays: number | null;
  sparkline14: (number | null)[];
}

export async function getChannelSummaries(ids: string[]): Promise<ChannelSummary[]> {
  if (ids.length === 0) return [];
  const { data } = await apiClient.get<ChannelSummary[]>('/stats/summaries', {
    params: { ids: ids.slice(0, 30).join(',') },
  });
  return data;
}
