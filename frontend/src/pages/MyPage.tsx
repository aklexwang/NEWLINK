import { useEffect, useMemo, useState } from 'react';
import { getMySubmissions } from '../api/channels';
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
  'newlinkcom_bot';

const AD_INQUIRY_URL = 'https://t.me/Kplaytwo';

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
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [submissions, setSubmissions] = useState<Channel[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [rewardNotice, setRewardNotice] = useState<Channel | null>(null);
  const { searchCategories } = useCategories();

  const profile = authUser;
  const isLoggedIn = authStatus === 'authenticated' && Boolean(profile);

  const rewardSummary = useMemo(() => {
    const rewarded = submissions
      .filter((item) => item.rewardTonAmount != null && item.rewardTonAmount > 0)
      .sort((a, b) => {
        const at = a.rewardPaidAt ? new Date(a.rewardPaidAt).getTime() : 0;
        const bt = b.rewardPaidAt ? new Date(b.rewardPaidAt).getTime() : 0;
        return bt - at;
      });

    const totalTon = rewarded.reduce((sum, item) => sum + (item.rewardTonAmount ?? 0), 0);
    const totalUsd = rewarded.reduce((sum, item) => sum + (item.rewardUsdAmount ?? 0), 0);

    return { rewarded, totalTon, totalUsd, count: rewarded.length };
  }, [submissions]);

  /** 보상 지급된 건은 "받은 보상 내역"에만 두고 제보 목록에서는 제외 */
  const pendingSubmissions = useMemo(
    () =>
      submissions.filter(
        (item) => item.rewardTonAmount == null || item.rewardTonAmount <= 0,
      ),
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

  return (
    <>
      {rewardNotice && (
        <RewardApprovedModal item={rewardNotice} onClose={dismissRewardNotice} />
      )}

      <header className="border-b border-black/5 px-4 py-5">
        <h1 className="text-xl font-bold text-tg-text">MY</h1>
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-sm text-tg-hint">내 정보 · 제보 내역</p>
          <button
            type="button"
            onClick={() => openTelegramChannel(webApp, isLocalBrowser, AD_INQUIRY_URL)}
            className="shrink-0 text-sm font-medium text-tg-button"
          >
            광고문의
          </button>
        </div>
      </header>

      {!isLoggedIn && authStatus !== 'loading' && isLocalBrowser && (
        <section className="p-4">
          <TelegramOfficialLoginButton
            botUsername={TELEGRAM_BOT_USERNAME}
            onAuth={handleOfficialLogin}
            onError={(message) => notify(message)}
          />
        </section>
      )}

      {!isLoggedIn && authStatus !== 'loading' && !isLocalBrowser && (
        <section className="p-4">
          <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
            <p className="mb-3 text-center text-sm font-semibold text-tg-text">텔레그램 로그인</p>
            <p className="mb-4 text-center text-xs text-tg-hint">
              미니앱에서는 아래 버튼으로 바로 로그인됩니다.
            </p>
            <button
              type="button"
              onClick={() => void handleMiniAppLogin()}
              className="w-full rounded-xl bg-[#2AABEE] py-3 text-sm font-semibold text-white"
            >
              텔레그램으로 로그인하기
            </button>
          </div>
        </section>
      )}

      {isLoggedIn && (
        <section className="p-4">
          <div className="rounded-2xl bg-tg-secondary/70 p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tg-button text-2xl text-tg-button-text">
                {(profile?.firstName?.[0] ?? telegramUser?.first_name?.[0] ?? '?').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-tg-text">{displayName}</h2>
                <p className="mt-1 text-sm text-tg-hint">{username}</p>
                <p className="mt-1 text-xs text-tg-hint">
                  지갑:{' '}
                  {profile?.tonWalletAddress
                    ? `${profile.tonWalletAddress.slice(0, 6)}…${profile.tonWalletAddress.slice(-4)} · TON/Gram`
                    : '미연결 · 제보에서 Wallet 연결'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="shrink-0 rounded-xl bg-tg-bg px-3 py-2 text-xs font-medium text-red-600 ring-1 ring-black/5"
              >
                로그아웃
              </button>
            </div>
          </div>
        </section>
      )}

      {isLoggedIn && (
        <section className="px-4 pb-4">
          <div className="rounded-2xl bg-tg-secondary/50 p-4">
            <h3 className="text-sm font-semibold text-tg-text">받은 보상 내역</h3>
            <p className="mt-1 text-xs text-tg-hint">지금까지 지급받은 보상을 한눈에 볼 수 있습니다.</p>

            {submissionsLoading ? (
              <div className="mt-3 h-16 animate-pulse rounded-xl bg-tg-secondary" />
            ) : rewardSummary.count === 0 ? (
              <p className="mt-3 text-sm text-tg-hint">아직 받은 보상이 없습니다.</p>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5">
                    <p className="text-[11px] text-tg-hint">총 지급 건수</p>
                    <p className="mt-0.5 text-base font-bold text-tg-text">{rewardSummary.count}건</p>
                  </div>
                  <div className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5">
                    <p className="text-[11px] text-tg-hint">총 TON/Gram</p>
                    <p className="mt-0.5 text-base font-bold text-emerald-700">
                      {rewardSummary.totalTon.toLocaleString('ko-KR')}
                    </p>
                  </div>
                </div>
                {rewardSummary.totalUsd > 0 && (
                  <p className="mt-2 text-xs text-tg-hint">
                    지급 시점 기준 합계 약 ${rewardSummary.totalUsd.toFixed(2)}
                  </p>
                )}
                <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto">
                  {rewardSummary.rewarded.map((item) => (
                    <li key={item.id} className="rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5">
                      <p className="truncate text-sm font-medium text-tg-text">{item.title}</p>
                      <p className="mt-1 text-xs font-semibold text-emerald-700">
                        TON/Gram {(item.rewardTonAmount ?? 0).toLocaleString('ko-KR')}개
                        {item.rewardUsdAmount != null && item.rewardUsdAmount > 0 && (
                          <span className="ml-1 font-normal text-tg-hint">
                            · ${item.rewardUsdAmount.toFixed(2)}
                          </span>
                        )}
                      </p>
                      {item.rewardPaidAt && (
                        <p className="mt-0.5 text-[11px] text-tg-hint">
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
        </section>
      )}

      {isLoggedIn && (
        <section className="px-4 pb-4">
          <div className="rounded-2xl bg-tg-secondary/50 p-4">
            <h3 className="text-sm font-semibold text-tg-text">내 제보 내역</h3>
            <p className="mt-1 text-xs text-tg-hint">
              아직 보상을 받지 않은 제보의 승인·대기 상태를 확인할 수 있습니다. 지급 완료 건은 위
              「받은 보상 내역」에만 표시됩니다.
            </p>
            {submissionsLoading ? (
              <div className="mt-3 space-y-2">
                <div className="h-14 animate-pulse rounded-xl bg-tg-secondary" />
                <div className="h-14 animate-pulse rounded-xl bg-tg-secondary" />
              </div>
            ) : pendingSubmissions.length === 0 ? (
              <p className="mt-3 text-sm text-tg-hint">
                {submissions.length === 0
                  ? '아직 제보한 항목이 없습니다.'
                  : '보상 대기 중인 제보가 없습니다.'}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {pendingSubmissions.map((item) => {
                  const categoryMeta = getCategoryMeta(searchCategories, item.category);
                  return (
                    <li key={item.id} className="rounded-xl bg-tg-bg px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <CategoryBadge
                              name={categoryMeta.label}
                              emoji={categoryMeta.emoji}
                              iconUrl={categoryMeta.iconUrl}
                            />
                            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${linkTypeBadgeClass(item.linkType)}`}>
                              {linkTypeLabel(item.linkType)}
                            </span>
                            <span
                              className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${
                                item.status === 'active'
                                  ? 'bg-green-100 text-green-800'
                                  : item.status === 'rejected'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {submissionStatusLabel(item.status)}
                            </span>
                          </div>
                          <p className="mt-1 truncate text-sm font-medium text-tg-text">{item.title}</p>
                          <p className="mt-1.5 text-xs text-tg-hint">보상 대기 중</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>
      )}
    </>
  );
}
