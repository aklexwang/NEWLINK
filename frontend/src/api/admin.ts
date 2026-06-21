import { apiClient } from './client';
import type { CategoryItem } from '../types/categoryItem';
import type { ChannelPreview, PendingChannel } from '../types/channel';
import type { Channel } from '../types/channel';
import type { AdminUser } from '../types/user';

const devAdminHeaders =
  import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true'
    ? { 'X-Dev-Admin': 'true' }
    : {};


export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data } = await apiClient.get<AdminUser[]>('/admin/users', {
    headers: devAdminHeaders,
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
    { headers: devAdminHeaders },
  );
  return data;
}

export async function getChannelPreview(id: string): Promise<ChannelPreview> {
  const { data } = await apiClient.get<ChannelPreview>(`/admin/channels/${id}/preview`, {
    headers: devAdminHeaders,
  });
  return data;
}
export async function getPendingChannels(): Promise<PendingChannel[]> {
  const { data } = await apiClient.get<PendingChannel[]>('/admin/channels/pending', {
    headers: devAdminHeaders,
  });
  return data;
}

export async function getAdminChannels(params?: {
  status?: string;
  q?: string;
  category?: string;
}): Promise<Channel[]> {
  const { data } = await apiClient.get<Channel[]>('/admin/channels/all', {
    headers: devAdminHeaders,
    params,
  });
  return data;
}

export async function getPromotedChannels(q?: string): Promise<Channel[]> {
  const { data } = await apiClient.get<Channel[]>('/admin/promotions', {
    headers: devAdminHeaders,
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
    headers: devAdminHeaders,
  });
  return data;
}

export async function deleteAdminChannel(id: string) {
  const { data } = await apiClient.delete(`/admin/channels/${id}`, {
    headers: devAdminHeaders,
  });
  return data;
}

export async function approveChannel(id: string, isPromoted = false) {
  const { data } = await apiClient.patch(`/admin/channels/${id}/approve`, { isPromoted }, {
    headers: devAdminHeaders,
  });
  return data;
}

export async function rejectChannel(id: string) {
  const { data } = await apiClient.patch(`/admin/channels/${id}/reject`, {}, {
    headers: devAdminHeaders,
  });
  return data;
}

export async function promoteChannel(id: string, promotedUntil?: string) {
  const body = promotedUntil ? { promotedUntil } : { durationDays: 7 };
  const { data } = await apiClient.patch(`/admin/channels/${id}/promote`, body, {
    headers: devAdminHeaders,
  });
  return data;
}

export async function getAdminCategories(): Promise<CategoryItem[]> {
  const { data } = await apiClient.get<CategoryItem[]>('/admin/categories', {
    headers: devAdminHeaders,
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
    headers: devAdminHeaders,
  });
  return data;
}

export async function uploadCategoryIcon(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('icon', file);
  const { data } = await apiClient.post<{ iconUrl: string }>('/admin/categories/upload-icon', formData, {
    headers: devAdminHeaders,
  });
  return data.iconUrl;
}

export async function uploadChannelAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('icon', file);
  const { data } = await apiClient.post<{ avatarUrl: string }>('/admin/channels/upload-avatar', formData, {
    headers: devAdminHeaders,
  });
  return data.avatarUrl;
}

export async function updateCategory(
  id: string,
  payload: Partial<{ name: string; emoji: string; iconUrl: string | null; sortOrder: number; isActive: boolean }>,
) {
  const { data } = await apiClient.patch<CategoryItem>(`/admin/categories/${id}`, payload, {
    headers: devAdminHeaders,
  });
  return data;
}

export async function deleteCategory(id: string) {
  const { data } = await apiClient.delete(`/admin/categories/${id}`, {
    headers: devAdminHeaders,
  });
  return data;
}