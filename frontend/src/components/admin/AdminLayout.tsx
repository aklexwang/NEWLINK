import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Clock, Menu, PanelLeft } from 'lucide-react';
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
  getAdminLoginAt,
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

/** 머리글 오른쪽: 이번 관리자 로그인 시각 */
function elapsedText(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 60) return `${min}분`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

function LoginTime() {
  const at = getAdminLoginAt();
  // 로그인해 있는 시간: 30초마다 다시 그린다
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);
  if (!at) return null;
  const sameDay = at.toDateString() === new Date().toDateString();
  const text = at.toLocaleString('ko-KR', {
    ...(sameDay ? {} : { month: 'numeric', day: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  });
  return (
    <span
      className="flex h-9 items-center gap-1.5 rounded-xl bg-card px-3.5 text-[13px] text-muted-foreground shadow-[var(--hz-shadow)]"
      title={at.toLocaleString('ko-KR')}
    >
      <Clock className="h-4 w-4" />
      로그인 <b className="font-semibold text-foreground">{sameDay ? `오늘 ${text}` : text}</b>
      <span className="text-border">|</span>
      <span>
        접속 <b className="font-semibold text-foreground">{elapsedText(now - at.getTime())}</b>째
      </span>
    </span>
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
        <AdminSidebar collapsed={collapsed} onLogout={logout} />
      </div>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-60 p-0" showCloseButton>
          <AdminSidebar onNavigate={() => setMobileOpen(false)} onLogout={logout} />
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
            <LoginTime />
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
