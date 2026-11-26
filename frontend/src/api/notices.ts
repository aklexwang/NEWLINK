import { apiClient } from './client';
import { getAdminAuthHeaders } from '../utils/adminAccess';

export type NoticeItem = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
};

export type AdminNotice = NoticeItem & { published: boolean; updatedAt: string };

/** 회원 공지 (로그인한 회원) */
export async function getNotices(): Promise<NoticeItem[]> {
  const { data } = await apiClient.get<NoticeItem[]>('/notices');
  return Array.isArray(data) ? data : [];
}

export async function getAdminNotices(): Promise<AdminNotice[]> {
  const { data } = await apiClient.get<AdminNotice[]>('/admin/notices', { headers: getAdminAuthHeaders() });
  return Array.isArray(data) ? data : [];
}

export async function createAdminNotice(input: {
  title: string;
  body: string;
  pinned: boolean;
  published: boolean;
}): Promise<void> {
  await apiClient.post('/admin/notices', input, { headers: getAdminAuthHeaders() });
}

export async function updateAdminNotice(
  id: string,
  input: Partial<{ title: string; body: string; pinned: boolean; published: boolean }>,
): Promise<void> {
  await apiClient.patch(`/admin/notices/${id}`, input, { headers: getAdminAuthHeaders() });
}

export async function deleteAdminNotice(id: string): Promise<void> {
  await apiClient.delete(`/admin/notices/${id}`, { headers: getAdminAuthHeaders() });
}
