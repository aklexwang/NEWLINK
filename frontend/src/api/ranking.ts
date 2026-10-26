import { apiClient } from './client';
import type { RankingCategoryItem, RankingChannel, RankingStatus } from '../types/ranking';
import type { RankingSort } from '../types/stats';

export interface RankingChannelsQuery {
  category?: string;
  limit?: number;
  offset?: number;
  sort?: RankingSort;
  type?: 'channel' | 'group';
  hideLowData?: boolean;
  verifiedOnly?: boolean;
  includeForeign?: boolean;
}

export async function getRankingStatus(): Promise<RankingStatus> {
  const { data } = await apiClient.get<RankingStatus>('/ranking/status');
  return data;
}

export async function getRankingCategories(): Promise<RankingCategoryItem[]> {
  const { data } = await apiClient.get<RankingCategoryItem[]>('/ranking/categories');
  return data;
}

export async function getRankingCounts(): Promise<Record<string, number>> {
  const { data } = await apiClient.get<Record<string, number>>('/ranking/counts');
  return data;
}

export async function getRankingChannels(
  category: string,
  limit = 50,
  extra?: Omit<RankingChannelsQuery, 'category' | 'limit'>,
): Promise<RankingChannel[]> {
  const { data } = await apiClient.get<RankingChannel[]>('/ranking/channels', {
    params: {
      category: category === 'all' ? undefined : category,
      limit,
      offset: extra?.offset ?? 0,
      sort: extra?.sort,
      type: extra?.type,
      hideLowData: extra?.hideLowData,
      verifiedOnly: extra?.verifiedOnly,
      includeForeign: extra?.includeForeign,
    },
    timeout: 120000,
  });
  return data;
}

/** 목록 1~5위 자리 광고 (전체 카테고리 광고 + 이 카테고리 광고) */
export type RankAdSlot = {
  adId: string;
  slot: number;
  scope: 'global' | 'category';
  channel: RankingChannel;
};

export async function getRankingAds(
  category: string,
  type?: 'channel' | 'group',
): Promise<RankAdSlot[]> {
  try {
    const { data } = await apiClient.get<RankAdSlot[]>('/ranking/ads', {
      params: { category: category === 'all' ? undefined : category, type },
    });
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function trackRankAdClick(adId: string): void {
  void apiClient.post(`/ranking/ads/${adId}/click`).catch(() => undefined);
}
