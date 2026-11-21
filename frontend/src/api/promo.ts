import { apiClient } from './client';
import { getAdminAuthHeaders } from '../utils/adminAccess';

/** 어드민 · 홍보 자동화 */

export type PromoSettings = {
  enabled: boolean;
  dailyMax: number;
  hourStart: number;
  hourEnd: number;
  globalGapMin: number;
  pausedUntil: string | null;
  pauseReason: string | null;
  link: string;
};

export type PromoStatus = {
  configured: boolean;
  account: { name: string; username: string | null; premium: boolean } | null;
  accountError: string | null;
  settings: PromoSettings;
  activeHourNow: boolean;
  todaySent: number;
  /** 이미지 문구용 방 수 */
  rooms: number;
  targetTotal: number;
  targetOn: number;
  creativeOn: number;
  lastPostedAt: string | null;
  limits: { roomDailyCap: number; roomMinGapMin: number; dailyMaxLimit: number };
};

export type PromoTarget = {
  id: string;
  peerType: string;
  title: string;
  username: string | null;
  memberCount: number | null;
  about: string | null;
  ruleText: string | null;
  ruleForbidden: boolean;
  enabled: boolean;
  dailyLimit: number;
  minGapMinutes: number;
  textOnly: boolean;
  status: string;
  lastError: string | null;
  lastPostedAt: string | null;
  nextAllowedAt: string | null;
  todayCount: number;
};

export type PromoCreative = {
  id: string;
  text: string;
  imageUrl: string | null;
  enabled: boolean;
  source: string;
  sentCount: number;
  lastSentAt: string | null;
  createdAt: string;
};

export type PromoLog = {
  id: string;
  targetId: string;
  targetTitle: string;
  creativeId: string | null;
  postedAt: string;
  ok: boolean;
  error: string | null;
  kind: string;
};

const h = () => ({ headers: getAdminAuthHeaders() });

export async function getPromoStatus() {
  return (await apiClient.get<PromoStatus>('/admin/promo/status', h())).data;
}
export async function updatePromoSettings(patch: Partial<PromoSettings>) {
  return (await apiClient.patch<PromoSettings>('/admin/promo/settings', patch, h())).data;
}
export async function getPromoTargets() {
  return (await apiClient.get<PromoTarget[]>('/admin/promo/targets', h())).data;
}
export async function syncPromoTargets() {
  return (
    await apiClient.post<{ groups: number; added: number; gone: number }>('/admin/promo/targets/sync', {}, h())
  ).data;
}
export async function updatePromoTarget(
  id: string,
  patch: Partial<Pick<PromoTarget, 'enabled' | 'dailyLimit' | 'minGapMinutes' | 'textOnly'>>,
) {
  return (await apiClient.patch<PromoTarget>(`/admin/promo/targets/${id}`, patch, h())).data;
}
export async function bulkPromoTargets(ids: string[] | 'all', enabled: boolean, onlyClean = true) {
  return (await apiClient.post<{ changed: number }>('/admin/promo/targets/bulk', { ids, enabled, onlyClean }, h())).data;
}
export async function getPromoCreatives() {
  return (await apiClient.get<PromoCreative[]>('/admin/promo/creatives', h())).data;
}
export async function createPromoCreative(body: { text: string; imageUrl?: string | null; source?: string }) {
  return (await apiClient.post<PromoCreative>('/admin/promo/creatives', body, h())).data;
}
export async function updatePromoCreative(id: string, body: { text: string; imageUrl?: string | null; enabled?: boolean }) {
  return (await apiClient.patch<PromoCreative>(`/admin/promo/creatives/${id}`, body, h())).data;
}
export async function deletePromoCreative(id: string) {
  await apiClient.delete(`/admin/promo/creatives/${id}`, h());
}
export async function suggestPromoCopies(count = 5) {
  return (
    await apiClient.post<{ source: 'ai' | 'template'; copies: string[]; stats: { rooms: number; categories: number; link: string } }>(
      '/admin/promo/creatives/suggest',
      { count },
      h(),
    )
  ).data;
}
export async function uploadPromoImage(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append('image', blob, 'promo.jpg');
  const { data } = await apiClient.post<{ imageUrl: string }>('/admin/promo/images', form, {
    headers: getAdminAuthHeaders(),
    transformRequest: (payload, headers) => {
      if (payload instanceof FormData) delete headers['Content-Type'];
      return payload;
    },
  });
  return data.imageUrl;
}
export async function promoSendNow() {
  return (await apiClient.post<{ sent: boolean; reason?: string; target?: string }>('/admin/promo/send-now', {}, h())).data;
}
export async function getPromoLogs(limit = 50) {
  return (await apiClient.get<PromoLog[]>(`/admin/promo/logs?limit=${limit}`, h())).data;
}
