import axios from 'axios';

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function setInitDataHeader(initData: string) {
  apiClient.defaults.headers.common['X-Telegram-Init-Data'] = initData;
}

export function setAccessToken(token: string) {
  apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export function clearAccessToken() {
  delete apiClient.defaults.headers.common.Authorization;
}

export function clearInitDataHeader() {
  delete apiClient.defaults.headers.common['X-Telegram-Init-Data'];
}


/** 미니앱이면 텔레그램 서명(initData). 서버가 공개 API 를 미니앱에서만 받는다 */
function currentInitData(): string {
  try {
    const w = window as Window & { Telegram?: { WebApp?: { initData?: string } } };
    return w.Telegram?.WebApp?.initData ?? '';
  } catch {
    return '';
  }
}

/** 브라우저 어드민이 회원 화면을 볼 때 (같은 탭에 관리자 로그인이 있으면) */
function currentAdminToken(): string {
  try {
    return sessionStorage.getItem('newlink_admin_token') ?? '';
  } catch {
    return '';
  }
}

/** fetch(keepalive) 처럼 axios 를 안 쓰는 요청에도 붙일 헤더 */
export function gateHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const initData = currentInitData();
  if (initData) headers['X-Telegram-Init-Data'] = initData;
  const admin = currentAdminToken();
  if (admin) headers['X-Admin-Authorization'] = `Bearer ${admin}`;
  return headers;
}

apiClient.interceptors.request.use((config) => {
  const extra = gateHeaders();
  for (const [key, value] of Object.entries(extra)) {
    if (!config.headers.has(key)) config.headers.set(key, value);
  }
  return config;
});

/** 서버가 "미니앱에서만" 이라고 거절하면 화면에 안내를 띄운다 */
export const MINIAPP_ONLY_EVENT = 'newlink:miniapp-only';

apiClient.interceptors.response.use(undefined, (error: unknown) => {
  const e = error as { response?: { status?: number; data?: { code?: string } } };
  if (e.response?.status === 403 && e.response.data?.code === 'miniapp_only') {
    try {
      window.dispatchEvent(new Event(MINIAPP_ONLY_EVENT));
    } catch {
      /* 무시 */
    }
  }
  return Promise.reject(error);
});
