import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { notifyUser, useTelegram } from '../hooks/useTelegram';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
    isActive ? 'text-tg-link' : 'text-tg-hint'
  }`;

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, status: authStatus } = useAuth();
  const { webApp, isLocalBrowser } = useTelegram();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);
  const hasWallet = Boolean(user?.isRegistered && user.tonWalletAddress);
  const isSubmitActive = location.pathname === '/submit';

  const handleSubmitClick = (e: React.MouseEvent) => {
    e.preventDefault();

    if (authStatus === 'loading') return;

    if (!isLoggedIn) {
      notify('제보하려면 MY 페이지에서 로그인해 주세요.');
      navigate('/my');
      return;
    }

    if (!hasWallet) {
      notify('제보하려면 TON 지갑 등록이 필요합니다.');
      navigate('/submit', { state: { requireWallet: true } });
      return;
    }

    navigate('/submit');
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-black/[0.06] bg-tg-bg/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-[52px] items-stretch">
        <NavLink to="/" end className={navClass}>
          <span className="text-[22px] leading-none">🏠</span>
          <span>홈</span>
        </NavLink>
        <NavLink to="/ranking" className={navClass}>
          <span className="text-[22px] leading-none">🏆</span>
          <span>랭킹</span>
        </NavLink>
        <a
          href="/submit"
          onClick={handleSubmitClick}
          className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium ${
            isSubmitActive ? 'text-tg-link' : 'text-tg-hint'
          }`}
        >
          <span className="text-[22px] leading-none">📣</span>
          <span>제보</span>
        </a>
        <NavLink to="/my" className={navClass}>
          <span className="text-[22px] leading-none">👤</span>
          <span>MY</span>
        </NavLink>
      </div>
    </nav>
  );
}
