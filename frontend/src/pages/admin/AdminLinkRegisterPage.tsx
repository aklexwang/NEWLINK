import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminCategories,
  lookupAdminChannel,
  registerAdminChannel,
  type AdminChannelLookup,
} from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';
import type { LinkType } from '../../types/channel';
import type { CategoryItem } from '../../types/categoryItem';
import { resolveMediaUrl } from '../../utils/mediaUrl';

interface AdminLinkRegisterPageProps {
  linkType: LinkType;
  title: string;
  subtitle: string;
  itemLabel: string;
  managePath: string;
  placeholder: string;
}

export function AdminLinkRegisterPage({
  linkType,
  title,
  subtitle,
  itemLabel,
  managePath,
  placeholder,
}: AdminLinkRegisterPageProps) {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [linkInput, setLinkInput] = useState('');
  const [lookup, setLookup] = useState<AdminChannelLookup | null>(null);
  const [titleValue, setTitleValue] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [isPromoted, setIsPromoted] = useState(false);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    getAdminCategories()
      .then((items) => {
        const active = items.filter((item) => item.isActive);
        setCategories(active);
        if (active[0]) setCategory(active[0].name);
      })
      .catch(() => setCategories([]));
  }, []);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword = linkInput.trim();
    if (!keyword) return;

    setSearching(true);
    setError('');
    setMessage('');
    setLookup(null);

    try {
      const result = await lookupAdminChannel(keyword);
      setLookup(result);
      setTitleValue(result.title);
      setDescription(result.description);
      if (result.alreadyRegistered) {
        setError(`이미 등록된 링크입니다. ${itemLabel} 관리에서 확인해 주세요.`);
      }
    } catch {
      setError(`텔레그램에서 ${itemLabel} 정보를 찾지 못했습니다. 링크를 확인해 주세요.`);
    } finally {
      setSearching(false);
    }
  };

  const handleRegister = async () => {
    if (!lookup) return;
    if (!titleValue.trim() || !category) {
      setError('제목과 카테고리를 입력해 주세요.');
      return;
    }
    if (lookup.alreadyRegistered) {
      setError('이미 등록된 링크입니다.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      await registerAdminChannel({
        title: titleValue.trim(),
        link: lookup.link,
        linkType,
        category,
        description: description.trim() || titleValue.trim(),
        isPromoted,
      });
      setMessage(`${itemLabel}이 등록되었습니다. 랭킹 페이지에 노출됩니다.`);
      setLookup(null);
      setLinkInput('');
      setTitleValue('');
      setDescription('');
      setIsPromoted(false);
    } catch {
      setError('등록에 실패했습니다. 링크 중복 여부를 확인해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const avatarSrc = lookup?.avatarUrl ? resolveMediaUrl(lookup.avatarUrl) : '';

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <h2 className="text-xl font-bold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        {message && <AdminMessage message={message} />}
        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleLookup} className="mb-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
          <label className="block text-sm font-medium text-slate-700">텔레그램 링크 검색</label>
          <p className="mt-1 text-xs text-slate-500">
            예: https://t.me/example · @username · 비공개 초대 링크
          </p>
          <div className="mt-3 flex gap-2">
            <input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 rounded-xl bg-slate-50 px-4 py-3 text-sm outline-none ring-1 ring-black/5 focus:ring-blue-300"
            />
            <button
              type="submit"
              disabled={searching || !linkInput.trim()}
              className="shrink-0 rounded-xl bg-blue-600 px-5 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {searching ? '검색 중...' : '찾기'}
            </button>
          </div>
        </form>

        {lookup && (
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
            <div className="flex gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
                {avatarSrc ? (
                  <img src={avatarSrc} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl">{linkType === 'group' ? '👥' : '📢'}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-slate-500">미리보기</p>
                <p className="mt-0.5 truncate text-lg font-semibold text-slate-900">
                  {titleValue || '이름 없음'}
                </p>
                <a
                  href={lookup.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-xs text-blue-600 hover:underline"
                >
                  {lookup.link}
                </a>
                {lookup.memberCount && (
                  <p className="mt-1 text-xs text-slate-500">구독자/멤버 {lookup.memberCount}</p>
                )}
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600">제목</label>
                <input
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  className="mt-1 w-full rounded-xl bg-slate-50 px-4 py-2.5 text-sm outline-none ring-1 ring-black/5 focus:ring-blue-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">설명</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full resize-none rounded-xl bg-slate-50 px-4 py-2.5 text-sm outline-none ring-1 ring-black/5 focus:ring-blue-300"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">카테고리</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 block w-full rounded-lg bg-slate-50 px-3 py-2 text-sm outline-none ring-1 ring-black/5"
                >
                  {categories.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={isPromoted}
                  onChange={(e) => setIsPromoted(e.target.checked)}
                  className="rounded border-slate-300"
                />
                등록과 함께 Promoted(홈 상단) 노출
              </label>

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleRegister}
                  disabled={saving || lookup.alreadyRegistered}
                  className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? '등록 중...' : '등록하기'}
                </button>
                {lookup.existingChannelId && (
                  <Link
                    to={managePath}
                    className="rounded-xl bg-white px-5 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-black/10 hover:bg-slate-50"
                  >
                    {itemLabel} 관리에서 보기
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
