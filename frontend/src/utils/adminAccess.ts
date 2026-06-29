const STORAGE_KEY = 'newlink_admin_access_key';

export function captureAdminAccessFromUrl(): void {
  const params = new URLSearchParams(window.location.search);
  const access = params.get('access');
  if (!access) return;

  sessionStorage.setItem(STORAGE_KEY, access);
  params.delete('access');
  const query = params.toString();
  window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

export function getAdminAccessKey(): string | null {
  return sessionStorage.getItem(STORAGE_KEY);
}

export function getAdminAuthHeaders(): Record<string, string> {
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true') {
    return { 'X-Dev-Admin': 'true' };
  }

  const key = getAdminAccessKey();
  if (key) {
    return { 'X-Admin-Access-Key': key };
  }

  return {};
}

export function isAdminAuthenticated(): boolean {
  return Object.keys(getAdminAuthHeaders()).length > 0;
}
