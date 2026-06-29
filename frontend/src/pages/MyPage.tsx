import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMySubmissions } from '../api/channels';
import { getMyProfile, registerUser } from '../api/users';
import { CategoryBadge } from '../components/CategoryBadge';
import { useCategories } from '../hooks/useCategories';
import { notifyUser, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';
import type { AppUser } from '../types/user';
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
  const { user, webApp, isLocalBrowser } = useTelegram();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [profile, setProfile] = useState<AppUser | null>(null);
  const [submissions, setSubmissions] = useState<Channel[]>([]);
  const [wallet, setWallet] = useState('');
  const [loading, setLoading] = useState(true);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { searchCategories } = useCategories();

  const myCategories = useMemo(() => {
    const names = [...new Set(submissions.map((item) => item.category).filter(Boolean))];
    return names.map((name) => ({
      name,
      ...getCategoryMeta(searchCategories, name),
    }));
  }, [submissions, searchCategories]);

  useEffect(() => {
    getMyProfile()
      .then((data) => {
        setProfile(data);
        setWallet(data.tonWalletAddress ?? '');
      })
      .catch(() => {
        setProfile(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
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
  }, []);

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ')
    : isLocalBrowser
      ? '로컬 사용자'
      : '게스트';

  const username = user?.username ? `@${user.username}` : '연결된 Telegram 계정 없음';

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = wallet.trim();
    if (!address) {
      notify('지갑 주소를 입력해 주세요.');
      return;
    }

    setSaving(true);
    try {
      const updated = await registerUser(address);
      setProfile(updated);
      setWallet(updated.tonWalletAddress ?? address);
      notify('회원가입이 완료되었습니다. 이제 제보할 수 있습니다.');
    } catch {
      notify('회원가입에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <header className="border-b border-black/5 px-4 py-5">
        <h1 className="text-xl font-bold text-tg-text">MY</h1>
        <p className="mt-1 text-sm text-tg-hint">내 정보 및 회원가입</p>
      </header>

      <section className="p-4">
        <div className="rounded-2xl bg-tg-secondary/70 p-5">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-tg-button text-2xl text-tg-button-text">
              {user?.first_name?.[0] ?? '?'}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-semibold text-tg-text">{displayName}</h2>
              <p className="mt-1 text-sm text-tg-hint">{username}</p>
              {profile && (
                <p className="mt-1 text-xs text-tg-hint">Telegram ID: {profile.telegramId}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 pb-4">
        <form onSubmit={handleRegister} className="rounded-2xl bg-tg-secondary/50 p-4">
          <h3 className="text-sm font-semibold text-tg-text">회원가입 (TON 지갑 등록)</h3>
          <p className="mt-1 text-xs text-tg-hint">제보 보상을 받을 TON 지갑 주소를 등록해 주세요.</p>
          {loading ? (
            <div className="mt-3 h-12 animate-pulse rounded-xl bg-tg-secondary" />
          ) : (
            <>
              <input
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="테스트용 아무 주소 입력"
                className="mt-3 w-full rounded-xl bg-tg-bg px-4 py-3 text-sm outline-none"
              />
              <button
                type="submit"
                disabled={saving}
                className="mt-3 w-full rounded-xl bg-tg-button py-3 text-sm font-medium text-tg-button-text disabled:opacity-50"
              >
                {profile?.isRegistered ? (saving ? '저장 중...' : '지갑 주소 수정') : (saving ? '가입 중...' : '회원가입 완료')}
              </button>
              {profile?.isRegistered && (
                <p className="mt-2 text-xs text-green-700">가입 완료 · 제보 가능</p>
              )}
            </>
          )}
        </form>
      </section>

      {myCategories.length > 0 && (
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

      <section className="flex flex-col gap-2 px-4 pb-6">
        {import.meta.env.DEV && (
          <Link
            to="/admin/pending"
            className="rounded-2xl bg-white px-4 py-3 text-sm text-tg-text ring-1 ring-black/5"
          >
            관리자 페이지 (개발용)
          </Link>
        )}
      </section>
    </>
  );
}