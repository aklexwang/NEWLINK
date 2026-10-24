import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { LogOut, Menu, Moon, PanelLeft, Sun } from 'lucide-react';
import '@/styles/admin.css';
import { AdminPendingAlertBanner } from './AdminPendingAlertBanner';
import { AdminLoginScreen } from './AdminLoginScreen';
import { AdminSidebar, adminPageTitle } from './AdminSidebar';
import { AdminThemeProvider, useAdminTheme } from './AdminThemeProvider';
import { Button } from '@/components/admin/ui/button';
import { Separator } from '@/components/admin/ui/separator';
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
          <AdminLoginScreen onLoggedIn={() => setAuthed(true)} />
        )}
        <Toaster />
      </TooltipProvider>
    </AdminThemeProvider>
  );
}

function AdminShell({ onLogout }: { onLogout: () => void }) {
  const location = useLocation();
  const { theme, toggleTheme } = useAdminTheme();
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
        <header className="flex h-14 items-center gap-2 border-b bg-background px-3">
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
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={toggleCollapsed}
            aria-label="사이드바 접기"
          >
            <PanelLeft />
          </Button>
          <Separator orientation="vertical" className="hidden h-6 lg:block" />
          <p className="text-sm font-semibold">{adminPageTitle(location.pathname)}</p>
          <div className="ml-auto flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? '라이트 모드' : '다크 모드'}
            >
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>
            <Button type="button" variant="ghost" onClick={logout}>
              <LogOut />
              로그아웃
            </Button>
          </div>
        </header>
        <AdminPendingAlertBanner />
        <div className="min-w-0 flex-1 overflow-x-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
