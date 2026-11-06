import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, PanelLeft } from 'lucide-react';
import '@/styles/admin.css';
import { AdminPendingAlertBanner } from './AdminPendingAlertBanner';
import { RegisterDoneWatcher } from './RegisterDoneWatcher';
import { AdminNotificationBell } from './AdminNotificationBell';
import { AdminLoginScreen } from './AdminLoginScreen';
import { AdminSidebar, adminPageTitle } from './AdminSidebar';
import { AdminThemeProvider } from './AdminThemeProvider';
import { Button } from '@/components/admin/ui/button';
import { Sheet, SheetContent } from '@/components/admin/ui/sheet';
import { TooltipProvider } from '@/components/admin/ui/tooltip';
import { Toaster } from '@/components/admin/ui/sonner';
import {
  ADMIN_AUTH_EXPIRED_EVENT,
  clearAdminSession,
  discardLegacyAdminAccess,
  isAdminAuthenticated,
} from '../../utils/adminAccess';

const SIDEBAR_KEY = 'newlink-admin-sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

export function AdminLayout() {
  const [authed, setAuthed] = useState(isAdminAuthenticated);
  const navigate = useNavigate();

  useEffect(() => {
    discardLegacyAdminAccess();
    const onExpired = () => setAuthed(false);
    window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  return (
    <AdminThemeProvider>
      <TooltipProvider>
        {authed ? (
          <AdminShell onLogout={() => setAuthed(false)} />
        ) : (
          <AdminLoginScreen
            onLoggedIn={() => {
              setAuthed(true);
              // 로그인하면 항상 대시보드부터
              navigate('/admin/dashboard', { replace: true });
            }}
          />
        )}
        <Toaster />
      </TooltipProvider>
    </AdminThemeProvider>
  );
}

function AdminShell({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const logout = () => {
    clearAdminSession();
    setMobileOpen(false);
    onLogout();
  };

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <div className="hidden lg:block">
        <AdminSidebar collapsed={collapsed} />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 p-0" showCloseButton>
          <AdminSidebar onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 bg-background/80 px-4 pt-5 pb-3 backdrop-blur-xl md:px-7">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="메뉴"
          >
            <Menu />
          </Button>
          <div className="min-w-0">
            <p className="text-[12px] font-medium text-muted-foreground">
              관리자 <span className="mx-1">/</span> {adminPageTitle(location.pathname)}
            </p>
            <p className="mt-1 truncate text-[24px] leading-tight font-bold tracking-tight md:text-[28px]">
              {adminPageTitle(location.pathname)}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="hidden rounded-xl bg-card text-muted-foreground shadow-[var(--hz-shadow)] lg:inline-flex"
              onClick={toggleCollapsed}
              aria-label="사이드바 접기"
            >
              <PanelLeft />
            </Button>
            <AdminNotificationBell />
            <Button
              type="button"
              variant="outline"
              className="rounded-xl bg-card px-4 text-foreground shadow-[var(--hz-shadow)]"
              onClick={logout}
            >
              <LogOut />
              로그아웃
            </Button>
          </div>
        </header>
        <AdminPendingAlertBanner />
        <RegisterDoneWatcher />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
