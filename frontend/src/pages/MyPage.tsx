import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMySubmissions } from '../api/channels';
import { getRewardPolicy } from '../api/rewards';
import { CategoryBadge } from '../components/CategoryBadge';
import { RewardApprovedModal } from '../components/RewardApprovedModal';
import { TelegramOfficialLoginButton } from '../components/TelegramOfficialLoginButton';
import { useCategories } from '../hooks/useCategories';
import { useAuth } from '../providers/AuthProvider';
import { useToast } from '../providers/ToastProvider';
import { notifyUser, openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';
import { getApiErrorMessage } from '../utils/apiError';
import { linkTypeBadgeClass, linkTypeLabel, submissionStatusLabel } from '../utils/linkType';
import { hasSeenRewardNotice, markRewardNoticeSeen } from '../utils/seenRewardNotices';

const TELEGRAM_BOT_USERNAME =
  (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.trim() ||
  'telllink_bot';

const AD_INQUIRY_URL = 'https://t.me/kplay33';

function hasPayout(item: Channel) {
  return (
    (item.rewardTonAmount != null && item.rewardTonAmount > 0) ||
    (item.rewardStarsAmount != null && item.rewardStarsAmount > 0)
  );
}

function getCategoryMeta(
  categories: { id: string; label: string; emoji: string; iconUrl: string | null }[],
  categoryName: string,
) {
  const found = categories.find((item) => item.id === categoryName);
  return {
    label: found?.label ?? categoryName,
    emoji: found?.emoji ?? '📁',
    iconUrl: found?.iconUrl ?? null,
  };
}

export function MyPage() {
  const { user: telegramUser, webApp, isLocalBrowser } = useTelegram();
  const { user: authUser, status: authStatus, loginWithWidget, loginWithInitData, logout } =
    useAuth();
  const { confirm } = useToast();
  const navigate = useNavigate();
  /** 메뉴 목록에서 펼친 칸 */
  const [openSection, setOpenSection] = useState<'rewards' | 'submissions' | null>(null);
  /** 어드민 보상 설정이 꺼져 있으면(지갑 불필요) 지갑 표시·지갑 연결 메뉴를 숨긴다 */
  const [walletEnabled, setWalletEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    getRewardPolicy()
      .then((policy) => {
        if (alive) setWalletEnabled(policy.requireWallet);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [submissions, setSubmissions] = useState<Channel[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [rewardNotice, setRewardNotice] = useState<Channel | null>(null);
  const { searchCategories } = useCategories();

  const profile = authUser;
  const isLoggedIn = authStatus === 'authenticated' && Boolean(profile);

  const rewardSummary = useMemo(() => {
    const rewarded = submissions.filter(hasPayout).sort((a, b) => {
      const at = a.rewardPaidAt ? new Date(a.rewardPaidAt).getTime() : 0;
      const bt = b.rewardPaidAt ? new Date(b.rewardPaidAt).getTime() : 0;
      return bt - at;
    });

    const totalTon = rewarded.reduce((sum, item) => sum + (item.rewardTonAmount ?? 0), 0);
    const totalUsd = rewarded.reduce((sum, item) => sum + (item.rewardUsdAmount ?? 0), 0);
    const totalStars = rewarded.reduce((sum, item) => sum + (item.rewardStarsAmount ?? 0), 0);

    return { rewarded, totalTon, totalUsd, totalStars, count: rewarded.length };
  }, [submissions]);

  /** 보상 지급된 건은 "받은 보상 내역"에만 두고 제보 목록에서는 제외 */
  const pendingSubmissions = useMemo(
    () => submissions.filter((item) => !hasPayout(item)),
    [submissions],
  );

  useEffect(() => {
    if (!isLoggedIn) {
      setSubmissions([]);
      setSubmissionsLoading(false);
      setRewardNotice(null);
      return;
    }

    const pickRewardNotice = (items: Channel[]) => {
      const pending = items.filter(
        (item) =>
          item.status === 'active' &&
          item.rewardTonAmount != null &&
          item.rewardTonAmount > 0 &&
          !hasSeenRewardNotice(item.id),
      );
      setRewardNotice(pending[0] ?? null);
    };

    const loadSubmissions = (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setSubmissionsLoading(true);
      getMySubmissions()
        .then((items) => {
          setSubmissions(items);
          pickRewardNotice(items);
        })
        .catch(() => {
          if (!opts?.silent) {
            setSubmissions([]);
            setRewardNotice(null);
          }
        })
        .finally(() => {
          if (!opts?.silent) setSubmissionsLoading(false);
        });
    };

    loadSubmissions();

    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSubmissions({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isLoggedIn]);

  const dismissRewardNotice = () => {
    if (!rewardNotice) return;
    markRewardNoticeSeen(rewardNotice.id);
    const next = submissions.find(
      (item) =>
        item.id !== rewardNotice.id &&
        item.status === 'active' &&
        item.rewardTonAmount != null &&
        item.rewardTonAmount > 0 &&
        !hasSeenRewardNotice(item.id),
    );
    setRewardNotice(next ?? null);
  };

  const displayName = profile
    ? profile.firstName ?? `회원${String(profile.telegramId).slice(-4)}`
    : telegramUser
      ? [telegramUser.first_name, telegramUser.last_name].filter(Boolean).join(' ')
      : '게스트';

  const username = telegramUser?.username
    ? `@${telegramUser.username}`
    : profile
      ? `회원 ID ${profile.telegramId}`
      : '로그인이 필요합니다';

  const handleOfficialLogin = async (user: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    auth_date: number;
    hash: string;
  }) => {
    try {
      await loginWithWidget(user);
      notify('Telegram 로그인되었습니다.');
    } catch (error) {
      notify(getApiErrorMessage(error, 'Telegram 로그인에 실패했습니다.'));
    }
  };

  const handleMiniAppLogin = async () => {
    try {
      await loginWithInitData();
      notify('Telegram 로그인되었습니다.');
    } catch (error) {
      notify(getApiErrorMessage(error, '미니앱 로그인에 실패했습니다.'));
    }
  };

  const handleLogout = async () => {
    const ok = await confirm('로그아웃할까요?');
    if (!ok) return;
    logout();
    setSubmissions([]);
    notify('로그아웃되었습니다.');
  };

  const toggleSection = (key: 'rewards' | 'submissions') =>
    setOpenSection((prev) => (prev === key ? null : key));
  const openAdInquiry = () => openTelegramChannel(webApp, isLocalBrowser, AD_INQUIRY_URL);
  const walletShort = profile?.tonWalletAddress
    ? `${profile.tonWalletAddress.slice(0, 6)}…${profile.tonWalletAddress.slice(-4)}`
    : null;

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col bg-nl-bg pb-6">
      {rewardNotice && <RewardApprovedModal item={rewardNotice} onClose={dismissRewardNotice} />}

      <header className="flex h-[52px] items-center justify-between px-4">
        <h1 className="text-[20px] font-black text-nl-text">MY</h1>
        {isLoggedIn && (
          <button
            type="button"
            onClick={handleLogout}
            className="h-8 rounded-lg px-3 text-[13px] font-medium text-nl-muted ring-1 ring-nl-line"
          >
            로그아웃
          </button>
        )}
      </header>

      {!isLoggedIn && authStatus !== 'loading' && isLocalBrowser && (
        <section className="px-4 pt-1.5">
          <TelegramOfficialLoginButton
            botUsername={TELEGRAM_BOT_USERNAME}
            onAuth={handleOfficialLogin}
            onError={(message) => notify(message)}
          />
        </section>
      )}

      {!isLoggedIn && authStatus !== 'loading' && !isLocalBrowser && (
        <section className="mx-4 mt-1.5 rounded-[20px] bg-nl-card p-5 ring-1 ring-nl-line">
          <p className="text-[16px] font-bold text-nl-text">텔레그램으로 로그인</p>
          <p className="mt-1 text-[13px] text-nl-muted">즐겨찾기·제보·보상 내역을 쓰려면 로그인해 주세요.</p>
          <button
            type="button"
            onClick={() => void handleMiniAppLogin()}
            className="mt-4 w-full rounded-xl bg-[#2aabee] py-3 text-[14px] font-bold text-white"
          >
            텔레그램으로 로그인하기
          </button>
        </section>
      )}

      {isLoggedIn && (
        <section className="mx-4 mt-1.5 flex items-center gap-3.5 rounded-[20px] bg-nl-card p-4 ring-1 ring-nl-line">
          <div className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-full bg-[#2aabee] text-[24px] font-bold text-white">
            {(profile?.firstName?.[0] ?? telegramUser?.first_name?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[18px] font-bold text-nl-text">{displayName}</h2>
            <p className="truncate text-[13px] text-nl-muted">{username}</p>
          </div>
          {!walletEnabled ? null : walletShort ? (
            <span className="shrink-0 rounded-lg bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-400">
              지갑 연결됨
            </span>
          ) : (
            <span className="shrink-0 rounded-lg bg-amber-500/15 px-2 py-1 text-[11px] font-bold text-amber-400">
              지갑 미연결
            </span>
          )}
        </section>
      )}

      {/* 광고문의: 눈에 띄는 파란 테두리 카드 */}
      <button
        type="button"
        onClick={openAdInquiry}
        className="relative mx-4 mt-3 overflow-hidden rounded-[20px] bg-[#0b2533] px-[18px] pt-[18px] pb-4 text-left ring-1 ring-[#2aabee]"
      >
        <span className="inline-block rounded-md bg-[#2aabee] px-2 py-0.5 text-[11px] font-black text-white">AD</span>
        <span className="mt-2.5 block text-[19px] font-black tracking-[-0.3px] text-white">
          내 채널을 홈 맨 위에 노출하세요
        </span>
        <span className="mt-1 block text-[13px] text-[#9fd6f5]">홈 배너 · 랭킹 상단 광고 상담</span>
        <span className="mt-3.5 inline-flex items-center gap-1.5 rounded-[10px] bg-[#2aabee] px-3.5 py-2 text-[14px] font-bold text-white">
          <svg viewBox="0 0 24 24" className="h-[15px] w-[15px]" fill="currentColor" aria-hidden>
            <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
          </svg>
          광고문의
        </span>
        <svg
          viewBox="0 0 24 24"
          className="pointer-events-none absolute -right-3.5 -bottom-4 h-[120px] w-[120px] text-[#2aabee] opacity-35"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        </svg>
      </button>

      {isLoggedIn && (
        <nav aria-label="내 메뉴" className="mx-4 mt-[18px] overflow-hidden rounded-[18px] bg-nl-card ring-1 ring-nl-line">
          <MenuRow
            icon={<RewardIcon />}
            label="받은 보상 내역"
            value={submissionsLoading ? '…' : `${rewardSummary.count}건`}
            open={openSection === 'rewards'}
            onClick={() => toggleSection('rewards')}
          />
          {openSection === 'rewards' && (
            <div className="border-t border-nl-line px-4 py-3">
              {rewardSummary.count === 0 ? (
                <p className="py-2 text-[13px] text-nl-muted">아직 받은 보상이 없어요. 제보가 승인되면 여기에 쌓여요.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-nl-elev px-3 py-2.5">
                      <p className="text-[11px] text-nl-muted">총 지급 건수</p>
                      <p className="mt-0.5 text-[16px] font-bold text-nl-text">{rewardSummary.count}건</p>
                    </div>
                    <div className="rounded-xl bg-nl-elev px-3 py-2.5">
                      <p className="text-[11px] text-nl-muted">총 TON/Gram</p>
                      <p className="mt-0.5 text-[16px] font-bold text-emerald-400">
                        {rewardSummary.totalTon.toLocaleString('ko-KR')}
                      </p>
                    </div>
                  </div>
                  {rewardSummary.totalStars > 0 && (
                    <p className="mt-2 text-[12px] text-nl-muted">Stars {rewardSummary.totalStars.toLocaleString('ko-KR')}</p>
                  )}
                  {rewardSummary.totalUsd > 0 && (
                    <p className="mt-1 text-[12px] text-nl-muted">지급 시점 기준 합계 약 ${rewardSummary.totalUsd.toFixed(2)}</p>
                  )}
                  <ul className="mt-2 divide-y divide-nl-line">
                    {rewardSummary.rewarded.map((item) => (
                      <li key={item.id} className="py-2.5">
                        <p className="truncate text-[14px] font-medium text-nl-text">{item.title}</p>
                        <p className="mt-0.5 text-[12px] font-semibold text-emerald-400">
                          {item.rewardTonAmount != null && item.rewardTonAmount > 0 && (
                            <>
                              TON/Gram {item.rewardTonAmount.toLocaleString('ko-KR')}개
                              {item.rewardUsdAmount != null && item.rewardUsdAmount > 0 && (
                                <span className="ml-1 font-normal text-nl-muted">· ${item.rewardUsdAmount.toFixed(2)}</span>
                              )}
                            </>
                          )}
                          {item.rewardStarsAmount != null && item.rewardStarsAmount > 0 && (
                            <span className={item.rewardTonAmount ? ' ml-1' : ''}>
                              Stars {item.rewardStarsAmount.toLocaleString('ko-KR')}
                            </span>
                          )}
                        </p>
                        {item.rewardPaidAt && (
                          <p className="mt-0.5 text-[11px] text-nl-muted">
                            {new Date(item.rewardPaidAt).toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          <MenuRow
            icon={<SubmitIcon />}
            label="내 제보 내역"
            value={submissionsLoading ? '…' : `${pendingSubmissions.length}건`}
            open={openSection === 'submissions'}
            onClick={() => toggleSection('submissions')}
            divider
          />
          {openSection === 'submissions' && (
            <div className="border-t border-nl-line px-4 py-3">
              {pendingSubmissions.length === 0 ? (
                <div className="py-2">
                  <p className="text-[13px] text-nl-muted">
                    {submissions.length === 0 ? '아직 제보한 항목이 없어요.' : '보상 대기 중인 제보가 없어요.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/submit')}
                    className="mt-2.5 rounded-[10px] px-3.5 py-2 text-[13px] font-bold text-nl-text ring-1 ring-nl-line"
                  >
                    제보하러 가기
                  </button>
                </div>
              ) : (
                <ul className="divide-y divide-nl-line">
                  {pendingSubmissions.map((item) => {
                    const categoryMeta = getCategoryMeta(searchCategories, item.category);
                    return (
                      <li key={item.id} className="py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CategoryBadge name={categoryMeta.label} emoji={categoryMeta.emoji} iconUrl={categoryMeta.iconUrl} />
                          <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(item.linkType)}`}>
                            {linkTypeLabel(item.linkType)}
                          </span>
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
                              item.status === 'active'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : item.status === 'rejected'
                                  ? 'bg-red-500/15 text-red-400'
                                  : 'bg-amber-500/15 text-amber-400'
                            }`}
                          >
                            {submissionStatusLabel(item.status)}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[14px] font-medium text-nl-text">{item.title}</p>
                        <p className="mt-0.5 text-[12px] text-nl-muted">보상 대기 중</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {walletEnabled && (
            <MenuRow
              icon={<WalletIcon />}
              label="지갑 연결"
              value={walletShort ? `${walletShort} · TON/Gram` : '제보에서 연결'}
              onClick={() => navigate('/submit', { state: { requireWallet: !walletShort } })}
              divider
            />
          )}
        </nav>
      )}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  value,
  open,
  onClick,
  divider = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  open?: boolean;
  onClick: () => void;
  divider?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`flex w-full items-center gap-3 px-4 py-[15px] text-left ${divider ? 'border-t border-nl-line' : ''}`}
    >
      <span className="text-nl-text">{icon}</span>
      <span className="flex-1 text-[15px] text-nl-text">{label}</span>
      <span className="max-w-[45%] truncate text-[13px] text-nl-muted">{value}</span>
      <svg
        viewBox="0 0 24 24"
        className={`h-[18px] w-[18px] shrink-0 text-nl-muted transition-transform ${open ? 'rotate-90' : ''}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="m9 6 6 6-6 6" />
      </svg>
    </button>
  );
}

const iconProps = {
  viewBox: '0 0 24 24',
  className: 'h-[22px] w-[22px]',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

function RewardIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="8" width="18" height="13" rx="2" />
      <path d="M3 12h18M12 8v13M8 8c-2 0-3-1-3-2.5S6.5 3 8 4.5 12 8 12 8s2.5-2 4-3.5S19 4 19 5.5 18 8 16 8" />
    </svg>
  );
}

function SubmitIcon() {
  return (
    <svg {...iconProps}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg {...iconProps}>
      <rect x="2" y="6" width="20" height="13" rx="3" />
      <path d="M16 12.5h2M2 10h20" />
    </svg>
  );
}
