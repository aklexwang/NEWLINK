import { Outlet } from 'react-router-dom';
import { AdminAuthNotice } from './AdminAuthNotice';
import { AdminPendingAlertBanner } from './AdminPendingAlertBanner';
import { captureAdminAccessFromUrl } from '../../utils/adminAccess';
import { AdminSidebar } from './AdminSidebar';

captureAdminAccessFromUrl();

export function AdminLayout() {
  return (
    <div className="flex min-h-screen w-full bg-[#f1f5f9]">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminAuthNotice />
        <AdminPendingAlertBanner />
        <Outlet />
      </div>
    </div>
  );
}
