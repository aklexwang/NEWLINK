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
