export const ADMIN_BADGES_REFRESH_EVENT = 'admin:badges-refresh';
export const ADMIN_PENDING_ALERT_EVENT = 'admin:pending-alert';

export type AdminPendingAlertDetail = {
  count: number;
  previousCount: number;
  increasedBy: number;
};

export function refreshAdminBadges() {
  window.dispatchEvent(new Event(ADMIN_BADGES_REFRESH_EVENT));
}

export function emitPendingAlert(detail: AdminPendingAlertDetail) {
  window.dispatchEvent(new CustomEvent(ADMIN_PENDING_ALERT_EVENT, { detail }));
}
