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
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | null;
  score: number | null;
  lastPostAt: string;
  activityKind?: 'post' | 'members';
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
