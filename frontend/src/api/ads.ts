import { API_BASE, apiClient } from './client';
import { getAdminAuthHeaders } from '../utils/adminAccess';

export type PublicBanner = { id: string; title: string; link: string; imageUrl: string };

export type AdminBanner = PublicBanner & {
  startsAt: string | null;
  endsAt: string | null;
  sortOrder: number;
  isActive: boolean;
  clicks: number;
  /** 받은 광고비(USDT)·받은 날 */
  paidUsdt: number | null;
  paidOn: string | null;
  /** 누적 노출 수 */
  impressions: number;
  /** 연결된 광고회원 */
  advertiserTelegramId: number | null;
  advertiserName: string | null;
  /** 마지막 노출일까지 남은 날 (끝없으면 null) */
  daysLeft: number | null;
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
  paidUsdt?: string;
  paidOn?: string;
  /** 광고회원 텔레그램 ID, 빈 문자열이면 연결 해제 */
  advertiserTelegramId?: string;
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
  if (form.paidUsdt !== undefined) data.append('paidUsdt', form.paidUsdt);
  if (form.paidOn !== undefined) data.append('paidOn', form.paidOn);
  if (form.advertiserTelegramId !== undefined)
    data.append('advertiserTelegramId', form.advertiserTelegramId);
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

/** 광고 노출 기록: 같은 광고는 이 브라우저에서 하루 한 번만 센다 */
export function trackAdImpressions(kind: 'banner' | 'rank', ids: string[]): void {
  const day = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const fresh = ids.filter((id) => {
    const key = `tl-ad-seen:${kind}:${id}:${day}`;
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, '1');
    } catch {
      /* 저장 못 하면 그냥 보낸다 */
    }
    return true;
  });
  if (fresh.length === 0) return;
  try {
    void fetch(`${API_BASE}/ads/impressions`, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(kind === 'banner' ? { banners: fresh } : { rank: fresh }),
    }).catch(() => undefined);
  } catch {
    /* 기록 실패는 무시 */
  }
}

export type AdDailyRow = { day: string; impressions: number; clicks: number };

export async function getAdDaily(kind: 'banner' | 'rank', id: string): Promise<AdDailyRow[]> {
  const { data } = await apiClient.get<AdDailyRow[]>(`/admin/ad-stats/${kind}/${id}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}
