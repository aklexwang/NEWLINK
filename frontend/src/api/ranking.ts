import { apiClient } from './client';
import type { RankingCategoryItem, RankingChannel, RankingStatus } from '../types/ranking';

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

export async function getRankingChannels(category: string, limit = 50): Promise<RankingChannel[]> {
  const { data } = await apiClient.get<RankingChannel[]>('/ranking/channels', {
    params: { category: category === 'all' ? undefined : category, limit },
    timeout: 120000,
  });
  return data;
}
