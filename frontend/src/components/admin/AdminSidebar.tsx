import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ClipboardList,
  FolderCog,
  LayoutDashboard,
  Link2,
  List,
  MousePointerClick,
  RefreshCw,
  Search,
  SearchX,
  Star,
  Timer,
  Users,
} from 'lucide-react';
import { getPendingChannelCount, getPromotedChannels } from '../../api/admin';
import { getMemberUrl } from '../../config/site';
import {
  ADMIN_BADGES_REFRESH_EVENT,
  emitPendingAlert,
} from '../../utils/adminBadges';
import { isPromotionActive } from '../../utils/promotion';
import { Badge } from '@/components/admin/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/admin/ui/tooltip';
import { cn } from '@/components/admin/lib/utils';

const POLL_MS = 15_000;
const DEFAULT_DOC_TITLE = 'TellLink 관리자';

type NavItem = {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: 'pending' | 'ads';
};

const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: '개요',
    items: [
      { to: '/admin/dashboard', label: '대시보드', icon: <LayoutDashboard /> },
      { to: '/admin/collect', label: '수집 운영', icon: <Timer /> },
    ],
  },
  {
    title: '채널',
    items: [
      { to: '/admin/pending', label: '제보·보상', icon: <ClipboardList />, badge: 'pending' },
      { to: '/admin/register-link', label: '링크 등록', icon: <Link2 /> },
      { to: '/admin/discovery', label: '발견', icon: <RefreshCw /> },
      { to: '/admin/links', label: '채널·그룹 관리', icon: <List /> },
    ],
  },
  {
    title: '운영',
    items: [
      { to: '/admin/ads', label: '광고 관리', icon: <Star />, badge: 'ads' },
      { to: '/admin/search-insights', label: '검색 인사이트', icon: <Search /> },
      { to: '/admin/opens', label: '텔레그램 이동 순위', icon: <MousePointerClick /> },
    ],
  },
  {
    title: '설정',
    items: [
      { to: '/admin/users', label: '회원 관리', icon: <Users /> },
      { to: '/admin/categories', label: '카테고리 설정', icon: <FolderCog /> },
      { to: '/admin/search-terms', label: '검색 금지어', icon: <SearchX /> },
    ],
  },
];

function playAlertBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
    window.setTimeout(() => void ctx.close(), 400);
  } catch {
    // ignore autoplay / unsupported
  }
}

export function AdminSidebar({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [adsCount, setAdsCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const knownPendingRef = useRef<number | null>(null);
  const notifiedPermissionRef = useRef(false);

  const applyPendingCount = useCallback((count: number, announceIncrease: boolean) => {
    setPendingCount(count);
    document.title = count > 0 ? `(${count}) ${DEFAULT_DOC_TITLE}` : DEFAULT_DOC_TITLE;

    const previous = knownPendingRef.current;
    knownPendingRef.current = count;

    if (!announceIncrease || previous == null || count <= previous) return;

    const increasedBy = count - previous;
    emitPendingAlert({ count, previousCount: previous, increasedBy });
    setPulse(true);
    window.setTimeout(() => setPulse(false), 4000);
    playAlertBeep();

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('새 제보가 있습니다', {
          body: `승인 대기 ${count}건 (신규 ${increasedBy}건)`,
          tag: 'newlink-pending',
        });
      } catch {
        // ignore
      }
    }
  }, []);

  const refreshCounts = useCallback(
    async (announceIncrease = false) => {
      try {
        const count = await getPendingChannelCount();
        applyPendingCount(count, announceIncrease);
      } catch {
        setPendingCount(0);
      }

      getPromotedChannels()
        .then((items) =>
          setAdsCount(
            items.filter((item) => isPromotionActive(item.isPromoted, item.promotedUntil)).length,
          ),
        )
        .catch(() => setAdsCount(0));
    },
    [applyPendingCount],
  );

  useEffect(() => {
    void refreshCounts(false);
  }, [location.pathname, refreshCounts]);

  useEffect(() => {
    const onRefresh = () => {
      void refreshCounts(false);
    };
    window.addEventListener(ADMIN_BADGES_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(ADMIN_BADGES_REFRESH_EVENT, onRefresh);
  }, [refreshCounts]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshCounts(true);
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [refreshCounts]);

  useEffect(() => {
    if (notifiedPermissionRef.current) return;
    notifiedPermissionRef.current = true;
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    return () => {
      document.title = DEFAULT_DOC_TITLE;
    };
  }, []);

  return (
    <aside
      className={cn(
        'flex h-full min-h-screen flex-col bg-sidebar text-sidebar-foreground shadow-[var(--hz-shadow)]',
        collapsed ? 'w-[76px]' : 'w-[280px]',
      )}
    >
      <div className={cn('mx-6 border-b py-8 text-center', collapsed && 'mx-3 py-6')}>
        {collapsed ? (
          <p className="text-[15px] font-bold tracking-tight">NL</p>
        ) : (
          <h1 className="text-[26px] leading-none tracking-tight uppercase">
            <span className="font-bold">TellLink</span>{' '}
            <span className="font-normal">Admin</span>
          </h1>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-5 overflow-y-auto py-6" onClick={() => onNavigate?.()}>
        {GROUPS.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="px-8 pb-2 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                {group.title}
              </p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map((item) => {
                const count = item.badge === 'pending' ? pendingCount : item.badge === 'ads' ? adsCount : 0;
                const link = (
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'group relative flex items-center gap-3 py-2.5 pr-6 pl-8 text-[15px] transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'font-bold text-sidebar-foreground [&_.hz-icon]:text-sidebar-primary after:absolute after:top-1/2 after:right-0 after:h-9 after:w-1 after:-translate-y-1/2 after:rounded-full after:bg-sidebar-primary'
                          : 'font-medium text-muted-foreground hover:text-sidebar-foreground',
                      )
                    }
                  >
                    <span className="hz-icon [&>svg]:size-5">{item.icon}</span>
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && count > 0 && (
                      <Badge
                        className={cn(
                          'h-5 min-w-5 rounded-full bg-sidebar-primary px-1.5 text-sidebar-primary-foreground',
                          item.badge === 'pending' && pulse && 'animate-pulse',
                        )}
                      >
                        {count}
                      </Badge>
                    )}
                  </NavLink>
                );
                if (!collapsed) return <div key={item.to}>{link}</div>;
                return (
                  <Tooltip key={item.to}>
                    <TooltipTrigger asChild>{link}</TooltipTrigger>
                    <TooltipContent side="right">
                      {item.label}
                      {count > 0 ? ` (${count})` : ''}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4">
        <a
          href={getMemberUrl()}
          className={cn(
            'flex items-center justify-center gap-2 rounded-[20px] px-4 py-3 text-sm font-medium text-white shadow-[var(--hz-shadow)]',
            'bg-[image:var(--hz-brand-gradient)] hover:opacity-95',
            collapsed && 'px-0',
          )}
        >
          <span>←</span>
          {!collapsed && <span>회원 페이지</span>}
        </a>
      </div>
    </aside>
  );
}

export function adminPageTitle(pathname: string): string {
  const found = GROUPS.flatMap((group) => group.items).find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}?`),
  );
  if (found) return found.label;
  if (pathname.startsWith('/admin/by-category')) return '카테고리별';
  return '관리자';
}
