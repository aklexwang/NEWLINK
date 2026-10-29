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

/** 후보 이름의 채널을 같은 이름 카테고리로 바로 옮기기 (AI 다시 묻지 않음) */
export async function moveSuggestion(name: string): Promise<{ moved: number }> {
  const { data } = await apiClient.post(
    '/admin/reclassify/suggestions/move',
    { name },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

/** 카테고리별 채널 수: 전체(활성) / 회원 화면에 보이는 수 */
export async function getAdminCategoryCounts(): Promise<
  Record<string, { total: number; visible: number }>
> {
  const { data } = await apiClient.get('/admin/reclassify/category-counts', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

/** 한 카테고리 안의 방들을 AI 로 다시 확인 (방 하나당 AI 1번) */
export async function recheckCategoryWithAi(
  name: string,
): Promise<{ total: number; changed: Array<{ title: string; from: string; to: string }> }> {
  const { data } = await apiClient.post(
    '/admin/reclassify/category',
    { name },
    { headers: getAdminAuthHeaders(), timeout: 600_000 },
  );
  return data;
}

export type CategoryRecheckProgress = {
  running: boolean;
  name: string;
  done: number;
  total: number;
  changed: number;
  error: string | null;
  finishedAt: string | null;
};

export async function startCategoryRecheck(name: string): Promise<{ started: boolean }> {
  const { data } = await apiClient.post('/admin/reclassify/category/start', { name }, { headers: getAdminAuthHeaders() });
  return data;
}

export async function getCategoryRecheckProgress(): Promise<CategoryRecheckProgress> {
  const { data } = await apiClient.get('/admin/reclassify/category/progress', { headers: getAdminAuthHeaders() });
  return data;
}
