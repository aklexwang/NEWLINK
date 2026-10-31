import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getRewardPolicy } from '../api/rewards';
import { useAuth } from '../providers/AuthProvider';
import { notifyUser, useTelegram } from '../hooks/useTelegram';

/** 아래 메뉴 한 칸: 스레드처럼 아이콘만. 고른 칸은 우리 파란색(#229af0) + 채운 아이콘 */
const itemClass = (active: boolean) =>
  `flex flex-1 items-center justify-center ${active ? 'text-[#229af0]' : 'text-nl-muted'}`;
const navClass = ({ isActive }: { isActive: boolean }) => itemClass(isActive);

type NavIconName = 'home' | 'categories' | 'favorites' | 'submit';

function NavIcon({ name, active }: { name: NavIconName; active: boolean }) {
  const common = {
    viewBox: '0 0 24 24',
    className: 'h-[26px] w-[26px]',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  if (name === 'home') {
    return (
      <svg {...common} fill={active ? 'currentColor' : 'none'}>
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" />
      </svg>
    );
  }
  if (name === 'categories') {
    return (
      <svg {...common} fill={active ? 'currentColor' : 'none'}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    );
  }
  if (name === 'favorites') {
    return (
      <svg {...common} fill={active ? 'currentColor' : 'none'}>
        <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" />
      </svg>
    );
  }
  return (
    <svg {...common} fill="none" strokeWidth={active ? 2.4 : 1.8}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
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
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-lg border-t border-nl-line bg-nl-bg/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]">
      <div className="flex h-[56px] items-stretch">
        <NavLink
          to="/"
          end
          aria-label="홈"
          className={navClass}
          onClick={(e) => {
            if (location.pathname === '/') {
              e.preventDefault();
              navigate('/', { replace: true, state: { homeResetAt: Date.now() } });
            }
          }}
        >
          <NavIcon name="home" active={location.pathname === '/'} />
        </NavLink>
        <NavLink
          to="/categories"
          aria-label="카테고리"
          className={() => itemClass(isCategoriesActive)}
        >
          <NavIcon name="categories" active={isCategoriesActive} />
        </NavLink>
        <a
          href="/favorites"
          onClick={handleFavoritesClick}
          aria-label="즐겨찾기"
          className={itemClass(isFavoritesActive)}
        >
          <NavIcon name="favorites" active={isFavoritesActive} />
        </a>
        <a
          href="/submit"
          onClick={handleSubmitClick}
          aria-label="제보"
          className={itemClass(isSubmitActive)}
        >
          <NavIcon name="submit" active={isSubmitActive} />
        </a>
      </div>
    </nav>
  );
}
