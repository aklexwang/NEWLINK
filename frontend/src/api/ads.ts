import { API_BASE, apiClient } from './client';
import { getAdminAuthHeaders } from '../utils/adminAccess';

export type PublicBanner = { id: string; title: string; link: string; imageUrl: string };

export type AdminBanner = PublicBanner & {
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  isActive: boolean;
  clicks: number;
  live: boolean;
  createdAt: string;
};

/** 권장 배너 크기(픽셀). 서버 ad-banner.logic 과 같음 */
export const BANNER_SIZE = { width: 1200, height: 400, maxMb: 1 };
export const BANNER_ROTATE_CHOICES = [1, 2, 3, 5, 7, 10];

export async function getBanners(): Promise<{ rotateSeconds: number; banners: PublicBanner[] }> {
  const { data } = await apiClient.get('/ads/banners');
  return data;
}

/** 배너 클릭 기록. 이동을 막지 않게 기다리지 않는다 */
export function trackBannerClick(id: string): void {
  try {
    void fetch(`${API_BASE}/ads/banners/${encodeURIComponent(id)}/click`, {
      method: 'POST',
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* 기록 실패는 무시 */
  }
}

export async function getAdminBanners(): Promise<{ rotateSeconds: number; banners: AdminBanner[] }> {
  const { data } = await apiClient.get('/admin/ad-banners', { headers: getAdminAuthHeaders() });
  return data;
}

export type BannerForm = {
  title?: string;
  link?: string;
  startsOn?: string;
  endsOn?: string;
  sortOrder?: number;
  isActive?: boolean;
  image?: File | null;
};

function toFormData(form: BannerForm): FormData {
  const data = new FormData();
  if (form.title !== undefined) data.append('title', form.title);
  if (form.link !== undefined) data.append('link', form.link);
  if (form.startsOn !== undefined) data.append('startsOn', form.startsOn);
  if (form.endsOn !== undefined) data.append('endsOn', form.endsOn);
  if (form.sortOrder !== undefined) data.append('sortOrder', String(form.sortOrder));
  if (form.isActive !== undefined) data.append('isActive', String(form.isActive));
  if (form.image) data.append('image', form.image);
  return data;
}

/** 기본 JSON 헤더를 쓰면 axios가 FormData를 JSON으로 바꿔 파일이 빠진다 → multipart로 명시. */
function multipartHeaders() {
  return { ...getAdminAuthHeaders(), 'Content-Type': 'multipart/form-data' };
}

export async function createAdminBanner(form: BannerForm): Promise<void> {
  await apiClient.post('/admin/ad-banners', toFormData(form), { headers: multipartHeaders() });
}

export async function updateAdminBanner(id: string, form: BannerForm): Promise<void> {
  await apiClient.patch(`/admin/ad-banners/${id}`, toFormData(form), {
    headers: multipartHeaders(),
  });
}

export async function deleteAdminBanner(id: string): Promise<void> {
  await apiClient.delete(`/admin/ad-banners/${id}`, { headers: getAdminAuthHeaders() });
}

export async function setBannerRotateSeconds(seconds: number): Promise<number> {
  const { data } = await apiClient.put(
    '/admin/ad-banners/settings/rotate',
    { seconds },
    { headers: getAdminAuthHeaders() },
  );
  return data.rotateSeconds;
}
