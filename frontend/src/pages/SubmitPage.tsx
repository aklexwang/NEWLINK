import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { submitChannel } from '../api/channels';
import { TonWalletConnectCard } from '../components/TonWalletConnectCard';
import { useCategories } from '../hooks/useCategories';
import { useTonWalletLink } from '../hooks/useTonWalletLink';
import { useAuth } from '../providers/AuthProvider';
import { notifyUser, useTelegram } from '../hooks/useTelegram';
import type { LinkType } from '../types/channel';

export function SubmitPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { webApp, isLocalBrowser } = useTelegram();
  const { user, status: authStatus } = useAuth();
  const { submitCategories, loading: categoriesLoading } = useCategories();
  const { isLinked, connect, savedAddress } = useTonWalletLink();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingSubmitRef = useRef(false);
  const [form, setForm] = useState({
    linkType: 'channel' as LinkType,
    title: '',
    link: '',
    category: '',
    description: '',
  });

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);
  const hasWallet = Boolean((user?.isRegistered && user.tonWalletAddress) || isLinked || savedAddress);
  const requireWallet = Boolean((location.state as { requireWallet?: boolean } | null)?.requireWallet);
  const defaultCategory = submitCategories[0] ?? '';
  const categoryValue = form.category || defaultCategory;

  const doSubmit = useCallback(async () => {
    setIsSubmitting(true);
    try {
      await submitChannel({
        linkType: form.linkType,
        title: form.title,
        link: form.link,
        description: form.description,
        category: categoryValue,
      });
      notifyUser(webApp, isLocalBrowser, '제보가 접수되었습니다. 관리자 승인 후 노출됩니다.');
      navigate('/');
    } catch {
      notifyUser(webApp, isLocalBrowser, '제보 접수에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [form, categoryValue, webApp, isLocalBrowser, navigate]);

  useEffect(() => {
    if (requireWallet && isLoggedIn && !hasWallet) {
      void connect().catch(() => undefined);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [requireWallet, isLoggedIn, hasWallet, connect, navigate, location.pathname]);

  useEffect(() => {
    if (!pendingSubmitRef.current || !hasWallet) return;
    pendingSubmitRef.current = false;
    void doSubmit();
  }, [hasWallet, doSubmit]);

  const handleWalletLinked = (address: string) => {
    notifyUser(webApp, isLocalBrowser, '텔레그램 Wallet이 연결되었습니다.');
    if (pendingSubmitRef.current && address) {
      pendingSubmitRef.current = false;
      void doSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLoggedIn) {
      notifyUser(webApp, isLocalBrowser, '제보하기는 로그인후 가능합니다');
      navigate('/my');
      return;
    }

    if (!hasWallet) {
      pendingSubmitRef.current = true;
      try {
        await connect();
      } catch {
        pendingSubmitRef.current = false;
        notifyUser(webApp, isLocalBrowser, '텔레그램 Wallet 연결이 필요합니다.');
      }
      return;
    }

    await doSubmit();
  };

  return (
    <>
      <header className="border-b border-black/5 px-4 py-5">
        <h1 className="text-xl font-bold text-tg-text">채널/그룹 제보</h1>
        <p className="mt-1 text-sm text-tg-hint">새로운 채널/그룹 정보를 등록해 주세요</p>
      </header>

      {!isLoggedIn && (
        <div className="mx-4 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          제보하려면 먼저{' '}
          <Link to="/my" className="font-semibold text-tg-link underline">
            MY
          </Link>
          에서 로그인해 주세요.
        </div>
      )}

      {isLoggedIn && <TonWalletConnectCard onLinked={handleWalletLinked} />}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tg-hint">유형</label>
          <div className="inline-flex gap-1.5">
            {([
              { value: 'channel', label: '채널' },
              { value: 'group', label: '그룹' },
            ] as const).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setForm({ ...form, linkType: option.value })}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  form.linkType === option.value
                    ? 'bg-tg-button text-tg-button-text'
                    : 'bg-tg-secondary text-tg-hint'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tg-hint">제목</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder={form.linkType === 'group' ? '그룹 이름' : '채널 이름'}
            className="w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tg-hint">링크</label>
          <input
            required
            type="url"
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
            placeholder="https://t.me/..."
            className="w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tg-hint">카테고리</label>
          <select
            value={categoryValue}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            disabled={categoriesLoading || submitCategories.length === 0}
            className="w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm outline-none"
          >
            {submitCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tg-hint">설명</label>
          <textarea
            required
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="채널/그룹에 대한 간단한 설명"
            rows={4}
            className="w-full resize-none rounded-xl bg-tg-secondary px-4 py-3 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting || submitCategories.length === 0 || !isLoggedIn}
          className="mt-2 w-full rounded-xl bg-tg-button py-3.5 text-sm font-medium text-tg-button-text disabled:opacity-50"
        >
          {isSubmitting ? '접수 중...' : '제보하기'}
        </button>
      </form>
    </>
  );
}
