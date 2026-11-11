import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ClipboardList,
  Filter,
  FolderCog,
  LayoutDashboard,
  Link2,
  List,
  MousePointerClick,
  RefreshCw,
  DoorOpen,
  Search,
  SearchX,
  Server,
  ShieldCheck,
  Star,
  Timer,
  Users,
  LogOut,
} from 'lucide-react';
import { getPendingChannelCount } from '../../api/admin';
import { getAdminBanners } from '../../api/ads';
import { getAdminRankAds } from '../../api/rankAds';
import {
  ADMIN_BADGES_REFRESH_EVENT,
  emitPendingAlert,
} from '../../utils/adminBadges';
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

/** 직접 손대는 메뉴만 늘 보인다 */
const GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'MENU',
    items: [
      { to: '/admin/dashboard', label: '대시보드', icon: <LayoutDashboard /> },
      { to: '/admin/pending', label: '제보·보상', icon: <ClipboardList />, badge: 'pending' },
      { to: '/admin/register-link', label: '링크 등록', icon: <Link2 /> },
      { to: '/admin/links', label: '채널·그룹 관리', icon: <List /> },
      { to: '/admin/ads', label: '광고 관리', icon: <Star />, badge: 'ads' },
      { to: '/admin/users', label: '회원 관리', icon: <Users /> },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { to: '/admin/categories', label: '카테고리 설정', icon: <FolderCog /> },
      { to: '/admin/search-terms', label: '검색 금지어', icon: <SearchX /> },
      { to: '/admin/feed-filter', label: '홈 피드 광고 거르기', icon: <Filter /> },
      { to: '/admin/security', label: '보안 설정', icon: <ShieldCheck /> },
    ],
  },
];

/** 자동으로 돌아가거나 보기만 하는 메뉴: [더보기] 안에 접어 둔다 (감춰도 서버 작업은 그대로) */
const MORE_ITEMS: NavItem[] = [
  { to: '/admin/collect', label: '수집 운영', icon: <Timer /> },
  { to: '/admin/discovery', label: '발견', icon: <RefreshCw /> },
  { to: '/admin/join-requests', label: '입장 요청', icon: <DoorOpen /> },
  { to: '/admin/search-insights', label: '검색 인사이트', icon: <Search /> },
  { to: '/admin/opens', label: '텔레그램 이동 순위', icon: <MousePointerClick /> },
  { to: '/admin/server', label: '서버 상황', icon: <Server /> },
];

const MORE_KEY = 'tl-admin-more-open';

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
  onLogout,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
  onLogout?: () => void;
}) {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [adsCount, setAdsCount] = useState(0);
  const [pulse, setPulse] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => {
    try {
      return localStorage.getItem(MORE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const inMore = MORE_ITEMS.some((item) => location.pathname.startsWith(item.to));
  const showMore = moreOpen || inMore;
  const toggleMore = () => {
    const next = !showMore;
    setMoreOpen(next);
    try {
      localStorage.setItem(MORE_KEY, next ? '1' : '0');
    } catch {
      /* 저장 못 해도 괜찮음 */
    }
  };
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

      // 광고 관리 숫자 = 3일 안에 끝나는 광고 수 (연장·정리할 것)
      Promise.all([getAdminBanners(), getAdminRankAds()])
        .then(([bannerData, rankAds]) => {
          const soon = (active: boolean, left: number | null) =>
            active && left != null && left >= 0 && left <= 3;
          setAdsCount(
            bannerData.banners.filter((b) => soon(b.isActive, b.daysLeft)).length +
              rankAds.filter((a) => soon(a.state === 'live' || a.state === 'scheduled', a.daysLeft))
                .length,
          );
        })
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

  const renderItem = (item: NavItem) => {
                const count = item.badge === 'pending' ? pendingCount : item.badge === 'ads' ? adsCount : 0;
                const link = (
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        'group relative mx-3 flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] transition-colors',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-sidebar-accent font-semibold text-white'
                          : 'font-medium text-[#c3cde9] hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <span className="hz-icon [&>svg]:size-[18px] [&>svg]:stroke-[1.8]">{item.icon}</span>
                    {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                    {!collapsed && count > 0 && (
                      <Badge
                        className={cn(
                          'h-5 min-w-5 rounded-full bg-[#e5484d] px-1.5 text-white',
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
  };

  return (
    <aside
      className={cn(
        'flex h-full min-h-screen flex-col bg-sidebar text-sidebar-foreground',
        collapsed ? 'w-[76px]' : 'w-[248px]',
      )}
    >
      <div className={cn('flex items-center gap-3 px-6 pt-7 pb-4', collapsed && 'justify-center px-0')}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20">
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-white" fill="currentColor" aria-hidden>
            <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
          </svg>
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[17px] leading-tight font-bold text-white">
              Tell<span className="text-[#2aabee]">Link</span>
            </p>
            <p className="mt-1 text-[9px] font-semibold tracking-[0.28em] text-[#7f9cff]">ADMIN CONSOLE</p>
          </div>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" onClick={() => onNavigate?.()}>
        {GROUPS.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="px-6 pb-2 text-[10px] font-semibold tracking-[0.22em] text-[#7f9cff] uppercase">
                {group.title}
              </p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map(renderItem)}
            </div>
          </div>
        ))}

        <div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleMore();
            }}
            aria-expanded={showMore}
            className={cn(
              'flex w-full items-center gap-2 px-6 py-2 text-left text-[10px] font-semibold tracking-[0.22em] text-[#7f9cff] hover:text-white',
              collapsed && 'justify-center px-0',
            )}
            title="자동으로 돌아가거나 보기만 하는 메뉴"
          >
            {collapsed ? (
              <span className="text-lg leading-none">⋯</span>
            ) : (
              <>
                <span className="flex-1">AUTOMATION · 자동/통계</span>
                <span className={cn('transition-transform', showMore && 'rotate-180')}>▾</span>
              </>
            )}
          </button>
          {showMore && <div className="mt-1 flex flex-col gap-1">{MORE_ITEMS.map(renderItem)}</div>}
        </div>
      </nav>

      <div className="p-4">
        <button
          type="button"
          onClick={onLogout}
          title="로그아웃"
          className={cn(
            'flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-[#c3cde9]',
            'hover:bg-white/5 hover:text-white',
            collapsed && 'px-0',
          )}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>로그아웃</span>}
        </button>
      </div>
    </aside>
  );
}

export function adminPageTitle(pathname: string): string {
  const found = [...GROUPS.flatMap((group) => group.items), ...MORE_ITEMS].find(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}?`),
  );
  if (found) return found.label;
  if (pathname.startsWith('/admin/by-category')) return '카테고리별';
  return '관리자';
}
