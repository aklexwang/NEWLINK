const ACCESS_TOKEN_KEY = 'newlink_access_token';
const LOGGED_OUT_KEY = 'newlink_logged_out';

export function getStoredAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveAccessToken(token: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearStoredAccessToken(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function markLoggedOut(): void {
  sessionStorage.setItem(LOGGED_OUT_KEY, '1');
}

export function clearLoggedOut(): void {
  sessionStorage.removeItem(LOGGED_OUT_KEY);
}

export function isLoggedOut(): boolean {
  return sessionStorage.getItem(LOGGED_OUT_KEY) === '1';
}
