import { apiClient } from './client';
import { getAdminAuthHeaders } from '../utils/adminAccess';

export type RankAdScope = 'global' | 'category';
export type RankAdState = 'live' | 'scheduled' | 'ended' | 'off';

export type AdminRankAd = {
  id: string;
  scope: RankAdScope;
  category: string | null;
  slot: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  memo: string | null;
  clicks: number;
  paidUsdt: number | null;
  paidOn: string | null;
  daysLeft: number | null;
  state: RankAdState;
  createdAt: string;
  channel: {
    id: string;
    title: string;
    username: string | null;
    link: string;
    avatarUrl: string | null;
    category: string;
    linkType: 'channel' | 'group';
    memberCount: number | null;
    status: string;
  } | null;
};

export type RankAdForm = {
  channelId?: string;
  scope?: RankAdScope;
  category?: string | null;
  slot?: number;
  /** 'YYYY-MM-DD', 비우면 바로 / 계속 */
  startsOn?: string;
  endsOn?: string;
  isActive?: boolean;
  memo?: string;
  /** 받은 USDT (비우면 없음) */
  paidUsdt?: string;
  paidOn?: string;
};

export async function getAdminRankAds(): Promise<AdminRankAd[]> {
  const { data } = await apiClient.get<AdminRankAd[]>('/admin/rank-ads', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function createAdminRankAd(form: RankAdForm): Promise<void> {
  await apiClient.post('/admin/rank-ads', form, { headers: getAdminAuthHeaders() });
}

export async function updateAdminRankAd(id: string, form: RankAdForm): Promise<void> {
  await apiClient.patch(`/admin/rank-ads/${id}`, form, { headers: getAdminAuthHeaders() });
}

export async function deleteAdminRankAd(id: string): Promise<void> {
  await apiClient.delete(`/admin/rank-ads/${id}`, { headers: getAdminAuthHeaders() });
}
