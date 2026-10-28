import { useEffect, useMemo, useState } from 'react';
import {
  getAdminCategories,
  getFeedFilter,
  saveFeedFilter,
  type FeedFilterSettings,
} from '../../api/admin';
import type { CategoryItem } from '../../types/categoryItem';
import { adminApiErrorMessage } from '../../utils/adminApiError';

/** 홈 "최근 활발한 채널"에서 광고성 채널·글을 빼는 설정 */
export function AdminFeedFilterPage() {
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [settings, setSettings] = useState<FeedFilterSettings | null>(null);
  const [wordsText, setWordsText] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([getFeedFilter(), getAdminCategories()])
      .then(([f, cats]) => {
        if (!alive) return;
        setSettings(f);
        setWordsText(f.adWords.join('\n'));
        setCategories(cats);
      })
      .catch((error: unknown) => {
        if (alive) setMessage(adminApiErrorMessage(error, '설정을 불러오지 못했습니다.'));
      });
    return () => {
      alive = false;
    };
  }, []);

  const excluded = useMemo(() => new Set(settings?.excludeCategories ?? []), [settings]);
  const words = useMemo(
    () => [...new Set(wordsText.split(/[\n,]/).map((w) => w.trim()).filter(Boolean))],
    [wordsText],
  );
  const wordsLength = JSON.stringify(words).length;

  const toggle = (name: string) => {
    if (!settings) return;
    const next = new Set(excluded);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSettings({ ...settings, excludeCategories: [...next] });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const saved = await saveFeedFilter({ ...settings, adWords: words });
      setSettings(saved);
      setWordsText(saved.adWords.join('\n'));
      setMessage('저장했어요. 회원 홈에 바로 반영돼요.');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-10 md:px-7">
      <p className="text-sm text-muted-foreground">
        회원 홈 “최근 활발한 채널”에만 적용돼요. 카테고리·랭킹·검색에는 그대로 나와요.
      </p>
      {message && (
        <p className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium ring-1 ring-primary/30">{message}</p>
      )}
      {settings && (
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <section className="rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
            <p className="text-[15px] font-bold">1. 홈에서 뺄 카테고리</p>
            <p className="mt-1 text-sm text-subtle">체크한 카테고리의 채널은 홈 피드에 나오지 않아요.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {categories.map((c) => {
                const on = excluded.has(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.name)}
                    className={`rounded-full px-3.5 py-2 text-sm font-medium ring-1 transition ${
                      on ? 'bg-red-500 text-white ring-red-500' : 'bg-background text-subtle ring-border hover:bg-muted'
                    }`}
                  >
                    {on ? '✕ ' : ''}
                    {c.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
            <p className="text-[15px] font-bold">2. 광고 단어</p>
            <p className="mt-1 text-sm text-subtle">
              최근 글에 이 단어가{' '}
              <select
                value={settings.minHits}
                onChange={(e) => setSettings({ ...settings, minHits: Number(e.target.value) })}
                className="mx-1 rounded-lg bg-background px-2 py-1 text-sm ring-1 ring-border"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
              이상 들어가면 광고로 보고 홈에서 빼요. 한 줄에 하나씩 넣으세요.
            </p>
            <textarea
              value={wordsText}
              onChange={(e) => setWordsText(e.target.value)}
              rows={12}
              className="mt-3 w-full rounded-xl bg-muted px-3 py-2 text-sm outline-none ring-1 ring-border focus:ring-primary/50"
            />
            <p className={`mt-1 text-xs ${wordsLength > 500 ? 'text-red-600' : 'text-muted-foreground'}`}>
              {words.length}개 · 저장 공간 {wordsLength}/500
              {wordsLength > 500 ? ' (넘치는 단어는 뒤에서부터 빠져요)' : ''}
            </p>
          </section>
        </div>
      )}
      {settings && (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-5 h-12 w-full max-w-sm rounded-xl bg-primary text-base font-bold text-white disabled:opacity-50"
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      )}
    </div>
  );
}
