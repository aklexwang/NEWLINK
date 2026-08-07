import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { AdminAuthNotice } from './AdminAuthNotice';
import { AdminPendingAlertBanner } from './AdminPendingAlertBanner';
import { captureAdminAccessFromUrl } from '../../utils/adminAccess';
import { AdminSidebar } from './AdminSidebar';

captureAdminAccessFromUrl();

export function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen w-full bg-[#f1f5f9]">
      {/* 모바일 오버레이 */}
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
        <div className="flex items-center gap-3 border-b border-black/5 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white"
          >
            메뉴
          </button>
          <p className="text-sm font-semibold text-slate-900">New Link 관리자</p>
        </div>
        <AdminAuthNotice />
        <AdminPendingAlertBanner />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
