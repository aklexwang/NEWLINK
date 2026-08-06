import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_PENDING_ALERT_EVENT, type AdminPendingAlertDetail } from '../../utils/adminBadges';

export function AdminPendingAlertBanner() {
  const [alert, setAlert] = useState<AdminPendingAlertDetail | null>(null);
  const hideTimer = useRef<number | null>(null);

  useEffect(() => {
    const onAlert = (event: Event) => {
      const detail = (event as CustomEvent<AdminPendingAlertDetail>).detail;
      if (!detail || detail.increasedBy <= 0) return;
      setAlert(detail);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setAlert(null), 12000);
    };

    window.addEventListener(ADMIN_PENDING_ALERT_EVENT, onAlert);
    return () => {
      window.removeEventListener(ADMIN_PENDING_ALERT_EVENT, onAlert);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
  }, []);

  if (!alert) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          새 제보 {alert.increasedBy}건 · 승인 대기 총 {alert.count}건
        </p>
        <div className="flex items-center gap-3">
          <Link to="/admin/pending" className="font-semibold text-amber-900 underline">
            승인 대기 보기
          </Link>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="text-amber-800/70 hover:text-amber-950"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
