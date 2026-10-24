export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? '').replace(/\/$/, '');

export function getSiteOrigin(): string {
  if (SITE_URL) return SITE_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

export function getMemberUrl(): string {
  return `${getSiteOrigin()}/`;
}

export function getAdminUrl(): string {
  return `${getSiteOrigin()}/admin`;
}
