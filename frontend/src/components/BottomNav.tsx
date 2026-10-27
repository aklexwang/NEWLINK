import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getRewardPolicy } from '../api/rewards';
import { useAuth } from '../providers/AuthProvider';
import { notifyUser, useTelegram } from '../hooks/useTelegram';

/** 아래 메뉴 한 칸: 고른 칸은 아이콘 뒤에 초록 알약 + 굵은 글씨 */
const itemClass = (active: boolean) =>
  `group flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] ${
    active ? 'font-bold text-nl-accent' : 'font-medium text-tg-hint'
  }`;
const navClass = ({ isActive }: { isActive: boolean }) => itemClass(isActive);

function NavIcon({ active, children }: { active: boolean; children: string }) {
  return (
    <span
      className={`flex h-7 w-12 items-center justify-center rounded-full text-[19px] leading-none transition-colors ${
        active ? 'bg-nl-accent/15' : 'opacity-75 group-hover:opacity-100'
      }`}
    >
      {children}
    </span>
  );
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, status: authStatus } = useAuth();
  const { webApp, isLocalBrowser } = useTelegram();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);
  const hasWallet = Boolean(user?.isRegistered && user.tonWalletAddress);
  const [requireWallet, setRequireWallet] = useState(true);

  useEffect(() => {
    void getRewardPolicy()
      .then((policy) => setRequireWallet(policy.requireWallet))
      .catch(() => setRequireWallet(true));
  }, []);
  const isSubmitActive = location.pathname === '/submit';
  const isFavoritesActive = location.pathname === '/favorites';
  const isCategoriesActive = location.pathname.startsWith('/categories');

  const handleSubmitClick = (e: React.MouseEvent) => {
    e.preventDefault();

    if (authStatus === 'loading') return;

    if (!isLoggedIn) {
      notify('제보하기는 로그인후 가능합니다');
      navigate('/my');
      return;
    }

    if (requireWallet && !hasWallet) {
      notify('제보하려면 텔레그램 Wallet 연결이 필요합니다.');
      navigate('/submit', { state: { requireWallet: true } });
      return;
    }

    navigate('/submit');
  };

  const handleFavoritesClick = (e: React.MouseEvent) => {
    e.preventDefault();

    if (authStatus === 'loading') return;

    if (!isLoggedIn) {
      notify('즐겨찾기는 회원 로그인 후 이용할 수 있습니다.');
      navigate('/my');
      return;
    }

    navigate('/favorites');
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-nl-line bg-tg-bg/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-[56px] items-stretch">
        <NavLink
          to="/"
          end
          className={navClass}
          onClick={(e) => {
            if (location.pathname === '/') {
              e.preventDefault();
              navigate('/', { replace: true, state: { homeResetAt: Date.now() } });
            }
          }}
        >
          <NavIcon active={location.pathname === '/'}>🏠</NavIcon>
          <span>홈</span>
        </NavLink>
        <NavLink
          to="/categories"
          className={() => itemClass(isCategoriesActive)}
        >
          <NavIcon active={isCategoriesActive}>📂</NavIcon>
          <span>카테고리</span>
        </NavLink>
        <a
          href="/favorites"
          onClick={handleFavoritesClick}
          className={itemClass(isFavoritesActive)}
        >
          <NavIcon active={isFavoritesActive}>⭐</NavIcon>
          <span>즐겨찾기</span>
        </a>
        <a
          href="/submit"
          onClick={handleSubmitClick}
          className={itemClass(isSubmitActive)}
        >
          <NavIcon active={isSubmitActive}>📣</NavIcon>
          <span>제보</span>
        </a>
        <NavLink to="/my" className={navClass}>
          <NavIcon active={location.pathname.startsWith('/my')}>👤</NavIcon>
          <span>MY</span>
        </NavLink>
      </div>
    </nav>
  );
}
