import axios from 'axios';
import { apiClient } from '../api/client';

const STORAGE_KEY = 'newlink_admin_token';
const LEGACY_ACCESS_KEY = 'newlink_admin_access_key';

export const ADMIN_AUTH_EXPIRED_EVENT = 'newlink-admin-auth-expired';

export function discardLegacyAdminAccess(): void {
  sessionStorage.removeItem(LEGACY_ACCESS_KEY);
  if (!window.location.pathname.startsWith('/admin')) return;

  const params = new URLSearchParams(window.location.search);
  if (!params.has('access')) return;
  params.delete('access');
  const query = params.toString();
  const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', next);
}

function readClaim(token: string, key: 'exp' | 'iat'): number | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const pad = (4 - (base64.length % 4)) % 4;
    const bytes = Uint8Array.from(atob(base64.padEnd(base64.length + pad, '=')), (char) =>
      char.charCodeAt(0),
    );
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    return typeof payload[key] === 'number' ? (payload[key] as number) : null;
  } catch {
    return null;
  }
}

const readExp = (token: string) => readClaim(token, 'exp');

/** 관리자 로그인한 시각 (토큰 발급 시각) */
export function getAdminLoginAt(): Date | null {
  const token = getAdminToken();
  const iat = token ? readClaim(token, 'iat') : null;
  return iat == null ? null : new Date(iat * 1000);
}

export function getAdminToken(): string | null {
  const token = sessionStorage.getItem(STORAGE_KEY);
  if (!token) return null;
  const exp = readExp(token);
  if (exp == null || exp * 1000 <= Date.now()) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  return token;
}

export function saveAdminToken(token: string): void {
  sessionStorage.setItem(STORAGE_KEY, token);
}

export function clearAdminSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(LEGACY_ACCESS_KEY);
}

export function getAdminAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function isAdminAuthenticated(): boolean {
  return getAdminToken() != null;
}

function isAdminApiUrl(url: string | undefined): boolean {
  if (!url) return false;
  let path = url.split('?')[0] ?? url;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      path = new URL(url).pathname;
    } catch {
      return false;
    }
  }
  return /\/admin(\/|$)/.test(path);
}

let interceptorInstalled = false;

export function installAdminAuthInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;
  apiClient.interceptors.response.use(
    (response) => response,
    (error: unknown) => {
      if (
        axios.isAxiosError(error) &&
        error.response?.status === 401 &&
        isAdminApiUrl(error.config?.url)
      ) {
        clearAdminSession();
        window.dispatchEvent(new Event(ADMIN_AUTH_EXPIRED_EVENT));
      }
      return Promise.reject(error);
    },
  );
}

installAdminAuthInterceptor();
