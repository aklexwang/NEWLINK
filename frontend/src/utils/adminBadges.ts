export const ADMIN_BADGES_REFRESH_EVENT = 'admin:badges-refresh';

export function refreshAdminBadges() {
  window.dispatchEvent(new Event(ADMIN_BADGES_REFRESH_EVENT));
}
