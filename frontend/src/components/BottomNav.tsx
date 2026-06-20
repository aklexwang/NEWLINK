import { NavLink } from 'react-router-dom';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
    isActive ? 'text-tg-link' : 'text-tg-hint'
  }`;

export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-black/[0.06] bg-tg-bg/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-[52px] items-stretch">
        <NavLink to="/" end className={navClass}>
          <span className="text-[22px] leading-none">⌂</span>
          <span>홈</span>
        </NavLink>
        <NavLink to="/search" className={navClass}>
          <span className="text-[22px] leading-none">⌕</span>
          <span>검색</span>
        </NavLink>
        <NavLink to="/submit" className={navClass}>
          <span className="text-[22px] leading-none">＋</span>
          <span>제보</span>
        </NavLink>
        <NavLink to="/my" className={navClass}>
          <span className="text-[22px] leading-none">○</span>
          <span>MY</span>
        </NavLink>
      </div>
    </nav>
  );
}