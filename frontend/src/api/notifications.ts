import { apiClient } from './client';
import { getAdminAuthHeaders } from '../utils/adminAccess';

export type AdminNotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
};

export async function getAdminNotifications(): Promise<{
  unread: number;
  items: AdminNotificationItem[];
}> {
  const { data } = await apiClient.get('/admin/notifications', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function readAdminNotification(id: string): Promise<void> {
  await apiClient.post(`/admin/notifications/${encodeURIComponent(id)}/read`, {}, {
    headers: getAdminAuthHeaders(),
  });
}

export async function readAllAdminNotifications(): Promise<void> {
  await apiClient.post('/admin/notifications/read-all', {}, { headers: getAdminAuthHeaders() });
}

export type CategorySuggestion = {
  name: string;
  count: number;
  samples: Array<{ title: string; username: string | null; category: string }>;
};

export async function getCategorySuggestions(): Promise<CategorySuggestion[]> {
  const { data } = await apiClient.get('/admin/reclassify/suggestions', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function reclassifySuggestion(name: string): Promise<{ total: number; changed: number }> {
  const { data } = await apiClient.post(
    '/admin/reclassify/suggestions/reclassify',
    { name },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}
