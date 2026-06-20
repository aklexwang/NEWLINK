import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { submitChannel } from '../api/channels';
import { getMyProfile } from '../api/users';
import { useCategories } from '../hooks/useCategories';
import { notifyUser, useTelegram } from '../hooks/useTelegram';
import type { LinkType } from '../types/channel';

export function SubmitPage() {
  const navigate = useNavigate();
  const { webApp, isLocalBrowser } = useTelegram();
  const { submitCategories, loading: categoriesLoading } = useCategories();
  const notify = (message: string) => notifyUser(webApp, isLocalBrowser, message);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null);
  const [form, setForm] = useState({
    linkType: 'channel' as LinkType,
    title: '',
    link: '',
    category: '',
    description: '',
  });

  useEffect(() => {
    getMyProfile()
      .then((profile) => setIsRegistered(profile.isRegistered && Boolean(profile.tonWalletAddress)))
      .catch(() => setIsRegistered(false));
  }, []);

  const defaultCategory = submitCategories[0] ?? '';
  const categoryValue = form.category || defaultCategory;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isRegistered) {
      notify('제보 전 MY 페이지에서 TON 지갑 회원가입을 완료해 주세요.');
      return;
    }
    setIsSubmitting(true);
    try {
      await submitChannel({ ...form, category: categoryValue });
      notify('제보가 접수되었습니다. 관리자 승인 후 노출됩니다.');
      navigate('/');
    } catch {
      notify('제보 접수에 실패했습니다. 회원가입(TON 지갑)을 확인해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <header className="border-b border-black/5 px-4 py-5">
        <h1 className="text-xl font-bold text-tg-text">채널/그룹 제보</h1>
        <p className="mt-1 text-sm text-tg-hint">새로운 채널/그룹 정보를 등록해 주세요</p>
      </header>

      {isRegistered === false && (
        <div className="mx-4 mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
          제보하려면 먼저{' '}
          <Link to="/my" className="font-semibold text-tg-link underline">MY 회원가입</Link>
          에서 TON 지갑 주소를 등록해 주세요.
        </div>
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
          <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={form.linkType === 'group' ? '그룹 이름' : '채널 이름'} className="w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm outline-none" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tg-hint">링크</label>
          <input required type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://t.me/..." className="w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm outline-none" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tg-hint">카테고리</label>
          <select value={categoryValue} onChange={(e) => setForm({ ...form, category: e.target.value })} disabled={categoriesLoading || submitCategories.length === 0} className="w-full rounded-xl bg-tg-secondary px-4 py-3 text-sm outline-none">
            {submitCategories.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-tg-hint">설명</label>
          <textarea required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="채널/그룹에 대한 간단한 설명" rows={4} className="w-full resize-none rounded-xl bg-tg-secondary px-4 py-3 text-sm outline-none" />
        </div>
        <button type="submit" disabled={isSubmitting || submitCategories.length === 0 || isRegistered === false} className="mt-2 w-full rounded-xl bg-tg-button py-3.5 text-sm font-medium text-tg-button-text disabled:opacity-50">
          {isSubmitting ? '접수 중...' : '제보하기'}
        </button>
      </form>
    </>
  );
}