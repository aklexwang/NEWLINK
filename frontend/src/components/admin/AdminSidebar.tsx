import { useCallback, useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getPendingChannels, getPromotedChannels } from '../../api/admin';
import { getMemberUrl } from '../../config/site';
import { ADMIN_BADGES_REFRESH_EVENT } from '../../utils/adminBadges';
import { isPromotionActive } from '../../utils/promotion';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
    isActive
      ? 'bg-white/15 text-white'
      : 'text-white/70 hover:bg-white/10 hover:text-white'
  }`;

export function AdminSidebar() {
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);
  const [adsCount, setAdsCount] = useState(0);

  const refreshCounts = useCallback(() => {
    getPendingChannels()
      .then((items) => setPendingCount(items.length))
      .catch(() => setPendingCount(0));
    getPromotedChannels()
      .then((items) =>
        setAdsCount(
          items.filter((item) => isPromotionActive(item.isPromoted, item.promotedUntil)).length,
        ),
      )
      .catch(() => setAdsCount(0));
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [location.pathname, refreshCounts]);

  useEffect(() => {
    window.addEventListener(ADMIN_BADGES_REFRESH_EVENT, refreshCounts);
    return () => window.removeEventListener(ADMIN_BADGES_REFRESH_EVENT, refreshCounts);
  }, [refreshCounts]);

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-[#1e293b] text-white">
      <div className="border-b border-white/10 px-4 py-5">
        <p className="text-xs font-medium tracking-wider text-white/50">New Link</p>
        <h1 className="mt-1 text-lg font-bold">관리자</h1>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        <NavLink to="/admin/pending" className={linkClass}>
          <span className="text-base">📋</span>
          <span className="flex-1">승인 대기</span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-400 px-2 py-0.5 text-xs font-bold text-amber-950">
              {pendingCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/admin/auto-manage" className={linkClass}>
          <span className="text-base">🔄</span>
          <span>자동관리</span>
        </NavLink>
        <NavLink to="/admin/by-category" className={linkClass}>
          <span className="text-base">📁</span>
          <span>카테고리별</span>
        </NavLink>
        <NavLink to="/admin/channels" className={linkClass}>
          <span className="text-base">📢</span>
          <span>채널 관리</span>
        </NavLink>
        <NavLink to="/admin/groups" className={linkClass}>
          <span className="text-base">👥</span>
          <span>그룹 관리</span>
        </NavLink>
        <NavLink to="/admin/ads" className={linkClass}>
          <span className="text-base">⭐</span>
          <span className="flex-1">광고 관리</span>
          {adsCount > 0 && (
            <span className="rounded-full bg-purple-400 px-2 py-0.5 text-xs font-bold text-purple-950">
              {adsCount}
            </span>
          )}
        </NavLink>
        <NavLink to="/admin/ton-payments" className={linkClass}>
          <span className="text-base">💎</span>
          <span>TON 지급 이력</span>
        </NavLink>
        <NavLink to="/admin/users" className={linkClass}>
          <span className="text-base">👥</span>
          <span>회원 관리</span>
        </NavLink>
        <NavLink to="/admin/categories" className={linkClass}>
          <span className="text-base">⚙️</span>
          <span>카테고리 설정</span>
        </NavLink>
      </nav>

      <div className="border-t border-white/10 p-3">
        <a
          href={getMemberUrl()}
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          <span>←</span>
          <span>회원 페이지</span>
        </a>
      </div>
    </aside>
  );
}