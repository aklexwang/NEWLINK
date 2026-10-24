import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminPendingAlertBanner } from './AdminPendingAlertBanner';
import { AdminLoginScreen } from './AdminLoginScreen';
import { AdminSidebar } from './AdminSidebar';
import {
  ADMIN_AUTH_EXPIRED_EVENT,
  clearAdminSession,
  discardLegacyAdminAccess,
  isAdminAuthenticated,
} from '../../utils/adminAccess';

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [authed, setAuthed] = useState(isAdminAuthenticated);

  useEffect(() => {
    discardLegacyAdminAccess();
    const onExpired = () => setAuthed(false);
    window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  if (!authed) {
    return <AdminLoginScreen onLoggedIn={() => setAuthed(true)} />;
  }

  const logout = () => {
    clearAdminSession();
    setSidebarOpen(false);
    setAuthed(false);
  };

  return (
    <div className="flex min-h-screen w-full bg-[#f1f5f9]">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="메뉴 닫기"
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-56 shrink-0 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white lg:hidden"
          >
            메뉴
          </button>
          <p className="text-sm font-semibold text-slate-900 lg:hidden">New Link 관리자</p>
          <button
            type="button"
            onClick={logout}
            className="ml-auto rounded-lg px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
          >
            로그아웃
          </button>
        </div>
        <AdminPendingAlertBanner />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
