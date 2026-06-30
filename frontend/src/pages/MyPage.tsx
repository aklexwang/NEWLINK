import { useEffect, useMemo, useState } from 'react';
import { AdminPageGate } from '../components/AdminPageGate';
import { getMySubmissions } from '../api/channels';
import { CategoryBadge } from '../components/CategoryBadge';
import { SlideToLogin } from '../components/SlideToLogin';
import { useCategories } from '../hooks/useCategories';
import { useAuth } from '../providers/AuthProvider';
import { notifyUser, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';
import { linkTypeBadgeClass, linkTypeLabel, submissionStatusLabel } from '../utils/linkType';

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
  const { user: authUser, status: authStatus, loginLocalDemo, logout } = useAuth();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [submissions, setSubmissions] = useState<Channel[]>([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const { searchCategories } = useCategories();

  const profile = authUser;
  const isLoggedIn = authStatus === 'authenticated' && Boolean(profile);

  const myCategories = useMemo(() => {
    const names = [...new Set(submissions.map((item) => item.category).filter(Boolean))];
    return names.map((name) => ({
      name,
      ...getCategoryMeta(searchCategories, name),
    }));
  }, [submissions, searchCategories]);

  useEffect(() => {
    if (!isLoggedIn) {
      setSubmissions([]);
      setSubmissionsLoading(false);
      return;
    }

    const loadSubmissions = () => {
      setSubmissionsLoading(true);
      getMySubmissions()
        .then(setSubmissions)
        .catch(() => setSubmissions([]))
        .finally(() => setSubmissionsLoading(false));
    };

    loadSubmissions();

    const onVisible = () => {
      if (document.visibilityState === 'visible') loadSubmissions();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [isLoggedIn]);

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

  const handleSlideLogin = () => {
    loginLocalDemo();
    notify('임의 회원 ID로 로그인되었습니다.');
  };

  const handleLogout = () => {
    if (!window.confirm('로그아웃할까요?')) return;
    logout();
    setSubmissions([]);
    notify('로그아웃되었습니다.');
  };

  return (
    <>
      <header className="border-b border-black/5 px-4 py-5">
        <h1 className="text-xl font-bold text-tg-text">MY</h1>
        <p className="mt-1 text-sm text-tg-hint">내 정보 · 제보 내역</p>
      </header>

      {!isLoggedIn && isLocalBrowser && (
        <section className="p-4">
          <SlideToLogin onComplete={handleSlideLogin} />
        </section>
      )}

      {!isLoggedIn && !isLocalBrowser && authStatus !== 'loading' && (
        <section className="mx-4 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          Telegram 미니앱에서 자동 로그인됩니다.
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
                  TON 지갑: {profile?.tonWalletAddress ? '등록됨' : '미등록 · 제보 시 1회 등록'}
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

      {isLoggedIn && myCategories.length > 0 && (
        <section className="px-4 pb-4">
          <div className="rounded-2xl bg-tg-secondary/50 p-4">
            <h3 className="text-sm font-semibold text-tg-text">내 카테고리</h3>
            <p className="mt-1 text-xs text-tg-hint">제보한 채널·그룹이 속한 카테고리입니다.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {myCategories.map((category) => (
                <CategoryBadge
                  key={category.name}
                  name={category.label}
                  emoji={category.emoji}
                  iconUrl={category.iconUrl}
                  className="px-2.5 py-1 text-xs"
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {isLoggedIn && (
        <section className="px-4 pb-4">
          <div className="rounded-2xl bg-tg-secondary/50 p-4">
            <h3 className="text-sm font-semibold text-tg-text">내 제보 내역</h3>
            <p className="mt-1 text-xs text-tg-hint">제보한 채널·그룹과 승인 상태를 확인할 수 있습니다.</p>
            {submissionsLoading ? (
              <div className="mt-3 space-y-2">
                <div className="h-14 animate-pulse rounded-xl bg-tg-secondary" />
                <div className="h-14 animate-pulse rounded-xl bg-tg-secondary" />
              </div>
            ) : submissions.length === 0 ? (
              <p className="mt-3 text-sm text-tg-hint">아직 제보한 항목이 없습니다.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {submissions.map((item) => {
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

      <section className="px-4 pb-6">
        <AdminPageGate />
      </section>
    </>
  );
}
