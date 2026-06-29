import { apiClient } from './client';
import type { CategoryItem } from '../types/categoryItem';
import type { ChannelPreview, PendingChannel } from '../types/channel';
import type { Channel } from '../types/channel';
import type { AdminUser } from '../types/user';
import { getAdminAuthHeaders } from '../utils/adminAccess';


export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data } = await apiClient.get<AdminUser[]>('/admin/users', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function importChannelAvatarFromTelegram(id: string): Promise<{
  avatarUrl: string | null;
  avatarApproved: boolean;
}> {
  const { data } = await apiClient.post<{ avatarUrl: string | null; avatarApproved: boolean }>(
    `/admin/channels/${id}/import-avatar`,
    {},
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function getChannelPreview(id: string): Promise<ChannelPreview> {
  const { data } = await apiClient.get<ChannelPreview>(`/admin/channels/${id}/preview`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}
export async function getPendingChannels(): Promise<PendingChannel[]> {
  const { data } = await apiClient.get<PendingChannel[]>('/admin/channels/pending', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAdminChannels(params?: {
  status?: string;
  q?: string;
  category?: string;
  linkType?: 'channel' | 'group';
}): Promise<Channel[]> {
  const { data } = await apiClient.get<Channel[]>('/admin/channels/all', {
    headers: getAdminAuthHeaders(),
    params,
  });
  return data;
}

export interface AdminChannelLookup {
  link: string;
  title: string;
  description: string;
  avatarUrl: string | null;
  memberCount: string | null;
  alreadyRegistered: boolean;
  existingChannelId: string | null;
  existingStatus: string | null;
}

export async function lookupAdminChannel(link: string): Promise<AdminChannelLookup> {
  const { data } = await apiClient.get<AdminChannelLookup>('/admin/channels/lookup', {
    headers: getAdminAuthHeaders(),
    params: { link },
  });
  return data;
}

export async function registerAdminChannel(payload: {
  title: string;
  link: string;
  linkType: 'channel' | 'group';
  category: string;
  description?: string;
  isPromoted?: boolean;
}): Promise<Channel> {
  const { data } = await apiClient.post<Channel>('/admin/channels/register', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getPromotedChannels(q?: string): Promise<Channel[]> {
  const { data } = await apiClient.get<Channel[]>('/admin/promotions', {
    headers: getAdminAuthHeaders(),
    params: q ? { q } : undefined,
  });
  return data;
}

export async function updateAdminChannel(
  id: string,
  payload: Partial<{
    title: string;
    category: string;
    linkType: 'channel' | 'group';
    status: string;
    isPromoted: boolean;
    promotedUntil: string | null;
    promotionClientTelegramId?: number | null;
    promotionClientName?: string | null;
    promotionTonAmount?: number | null;
    avatarUrl?: string | null;
    avatarApproved?: boolean;
  }>,
) {
  const { data } = await apiClient.patch(`/admin/channels/${id}`, payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function deleteAdminChannel(id: string) {
  const { data } = await apiClient.delete(`/admin/channels/${id}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function approveChannel(id: string, isPromoted = false) {
  const { data } = await apiClient.patch(`/admin/channels/${id}/approve`, { isPromoted }, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function rejectChannel(id: string) {
  const { data } = await apiClient.patch(`/admin/channels/${id}/reject`, {}, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function promoteChannel(id: string, promotedUntil?: string) {
  const body = promotedUntil ? { promotedUntil } : { durationDays: 7 };
  const { data } = await apiClient.patch(`/admin/channels/${id}/promote`, body, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAdminCategories(): Promise<CategoryItem[]> {
  const { data } = await apiClient.get<CategoryItem[]>('/admin/categories', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function createCategory(payload: {
  name: string;
  emoji?: string;
  iconUrl?: string | null;
  sortOrder?: number;
}) {
  const { data } = await apiClient.post<CategoryItem>('/admin/categories', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

async function postFormData<T>(url: string, formData: FormData): Promise<T> {
  const { data } = await apiClient.post<T>(url, formData, {
    headers: getAdminAuthHeaders(),
    transformRequest: (payload, headers) => {
      if (payload instanceof FormData) {
        delete headers['Content-Type'];
      }
      return payload;
    },
  });
  return data;
}

export async function uploadCategoryIcon(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('icon', file);
  const data = await postFormData<{ iconUrl: string }>('/admin/categories/upload-icon', formData);
  return data.iconUrl;
}

export async function uploadChannelAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('icon', file);
  const data = await postFormData<{ avatarUrl: string }>('/admin/channels/upload-avatar', formData);
  return data.avatarUrl;
}

export async function updateCategory(
  id: string,
  payload: Partial<{ name: string; emoji: string; iconUrl: string | null; sortOrder: number; isActive: boolean }>,
) {
  const { data } = await apiClient.patch<CategoryItem>(`/admin/categories/${id}`, payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function deleteCategory(id: string) {
  const { data } = await apiClient.delete(`/admin/categories/${id}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export interface AutoManageStatus {
  sources: string[];
  tgstatConfigured: boolean;
  label: string;
  hint: string;
}

export interface ImportCandidate {
  id: string;
  link: string;
  title: string;
  category: string;
  linkType: 'channel' | 'group';
  participantsCount: number;
  avatarUrl: string | null;
  source: string;
  status: 'pending' | 'published' | 'skipped';
  publishedChannelId: string | null;
  fetchedAt: string;
  publishedAt: string | null;
  alreadyOnMemberPage: boolean;
}

export interface AutoManageCategory {
  id: string;
  name: string;
  emoji: string;
  count: number;
}

export async function getAutoManageStatus(): Promise<AutoManageStatus> {
  const { data } = await apiClient.get<AutoManageStatus>('/admin/auto-manage/status', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAutoManageCategories(): Promise<AutoManageCategory[]> {
  const { data } = await apiClient.get<AutoManageCategory[]>('/admin/auto-manage/categories', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function syncAutoManageCandidates(category?: string) {
  const { data } = await apiClient.post<{ created: number; updated: number; total: number }>(
    '/admin/auto-manage/sync',
    {},
    {
      headers: getAdminAuthHeaders(),
      params: category ? { category } : undefined,
    },
  );
  return data;
}

export async function getAutoManageCandidates(params?: {
  status?: string;
  category?: string;
  source?: string;
}): Promise<ImportCandidate[]> {
  const { data } = await apiClient.get<ImportCandidate[]>('/admin/auto-manage/candidates', {
    headers: getAdminAuthHeaders(),
    params,
  });
  return data;
}

export async function publishAutoManageCandidates(ids: string[]) {
  const { data } = await apiClient.post<{ id: string; ok: boolean; message?: string }[]>(
    '/admin/auto-manage/publish',
    { ids },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function skipAutoManageCandidates(ids: string[]) {
  const { data } = await apiClient.post<{ ok: boolean; count: number }>(
    '/admin/auto-manage/skip',
    { ids },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}