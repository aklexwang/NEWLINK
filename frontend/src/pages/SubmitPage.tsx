import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { submitChannel } from '../api/channels';
import { registerUser } from '../api/users';
import { WalletRegisterModal } from '../components/WalletRegisterModal';
import { useCategories } from '../hooks/useCategories';
import { useAuth } from '../providers/AuthProvider';
import { notifyUser, useTelegram } from '../hooks/useTelegram';
import type { LinkType } from '../types/channel';

export function SubmitPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { webApp, isLocalBrowser } = useTelegram();
  const { user, status: authStatus, refreshAuth } = useAuth();
  const { submitCategories, loading: categoriesLoading } = useCategories();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [submitAfterWallet, setSubmitAfterWallet] = useState(false);
  const [form, setForm] = useState({
    linkType: 'channel' as LinkType,
    title: '',
    link: '',
    category: '',
    description: '',
  });

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);
  const hasWallet = Boolean(user?.isRegistered && user.tonWalletAddress);
  const requireWallet = Boolean((location.state as { requireWallet?: boolean } | null)?.requireWallet);

  const defaultCategory = submitCategories[0] ?? '';
  const categoryValue = form.category || defaultCategory;

  useEffect(() => {
    if (requireWallet && isLoggedIn && !hasWallet) {
      setWalletModalOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [requireWallet, isLoggedIn, hasWallet, navigate, location.pathname]);

  const doSubmit = async () => {
    setIsSubmitting(true);
    try {
      await submitChannel({ ...form, category: categoryValue });
      notify('제보가 접수되었습니다. 관리자 승인 후 노출됩니다.');
      navigate('/');
    } catch {
      notify('제보 접수에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWalletRegister = async (wallet: string) => {
    await registerUser(wallet);
    await refreshAuth();
    notify('TON 지갑이 등록되었습니다.');
    setWalletModalOpen(false);
    if (submitAfterWallet) {
      setSubmitAfterWallet(false);
      await doSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLoggedIn) {
      notify('제보하려면 MY 페이지에서 로그인해 주세요.');
      navigate('/my');
      return;
    }

    if (!hasWallet) {
      setSubmitAfterWallet(true);
      setWalletModalOpen(true);
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

      {isLoggedIn && !hasWallet && (
        <section className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 p-4 ring-1 ring-blue-100">
          <h3 className="text-sm font-semibold text-slate-900">TON 지갑 등록 필요</h3>
          <p className="mt-1 text-xs text-slate-600">
            제보 보상을 받으려면 TON 지갑 주소를 최초 1회 등록해야 합니다.
          </p>
          <button
            type="button"
            onClick={() => setWalletModalOpen(true)}
            className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700"
          >
            TON 지갑 등록하기
          </button>
        </section>
      )}

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

      <WalletRegisterModal
        open={walletModalOpen}
        onClose={() => {
          setWalletModalOpen(false);
          setSubmitAfterWallet(false);
        }}
        onSubmit={handleWalletRegister}
        submitLabel={submitAfterWallet ? '등록 후 제보' : '등록하기'}
      />
    </>
  );
}
