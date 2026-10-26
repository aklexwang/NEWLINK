import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminCategories, getAdminChannels } from '../../api/admin';
import {
  createAdminRankAd,
  deleteAdminRankAd,
  getAdminRankAds,
  updateAdminRankAd,
  type AdminRankAd,
  type RankAdScope,
  type RankAdState,
} from '../../api/rankAds';
import { AdPaymentChips, AdPaymentFields } from '../../components/admin/AdPayment';
import { AdminDatePicker } from '../../components/admin/AdminDatePicker';
import type { Channel } from '../../types/channel';
import type { CategoryItem } from '../../types/categoryItem';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { isoToKstYmd } from '../../utils/ymd';
import { AdminAdsManagePage } from './AdminAdsManagePage';

const SLOTS = [1, 2, 3, 4, 5];

const STATE_LABEL: Record<RankAdState, { text: string; cls: string }> = {
  live: { text: '노출 중', cls: 'bg-green-100 text-green-800' },
  scheduled: { text: '예약', cls: 'bg-blue-100 text-blue-800' },
  ended: { text: '기간 끝', cls: 'bg-muted text-subtle' },
  off: { text: '꺼짐', cls: 'bg-muted text-subtle' },
};

const STATE_ORDER: Record<RankAdState, number> = { live: 0, scheduled: 1, off: 2, ended: 3 };

const inputClass =
  'mt-1.5 h-11 w-full rounded-xl bg-background px-3.5 text-[15px] text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50';

type PickedChannel = { id: string; title: string; username: string | null; category: string };

/** 방 검색해서 하나 고르기 */
function ChannelSearch({
  picked,
  onPick,
  category,
}: {
  picked: PickedChannel | null;
  onPick: (channel: PickedChannel | null) => void;
  category?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Channel[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 1) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      setBusy(true);
      getAdminChannels({ q, category, pageSize: 8, page: 1, status: 'active' })
        .then((data) => {
          if (alive) setResults(data.items);
        })
        .catch(() => {
          if (alive) setResults([]);
        })
        .finally(() => {
          if (alive) setBusy(false);
        });
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, category]);

  if (picked) {
    return (
      <div className="mt-1.5 flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-3 ring-1 ring-primary/30">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold text-foreground">{picked.title}</p>
          <p className="truncate text-sm text-subtle">
            {picked.username ? `@${picked.username.replace(/^@/, '')} · ` : ''}
            {picked.category}
          </p>
        </div>
        <button type="button" onClick={() => onPick(null)} className="h-9 rounded-lg bg-card px-3 text-sm font-semibold text-foreground ring-1 ring-border">
          다른 방
        </button>
      </div>
    );
  }

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={category ? `${category} 안에서 방 이름·@아이디 검색` : '방 이름·@아이디 검색'}
        className={inputClass}
      />
      {query.trim() && (
        <div className="mt-2 max-h-72 overflow-y-auto rounded-xl bg-background ring-1 ring-border">
          {busy && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">찾는 중…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">맞는 방이 없어요.</p>
          ) : (
            results.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  onPick({ id: ch.id, title: ch.title, username: ch.username ?? null, category: ch.category });
                  setQuery('');
                }}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-b-0 hover:bg-muted"
              >
                <span className="text-lg">{ch.linkType === 'group' ? '👥' : '📢'}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold text-foreground">{ch.title}</span>
                  <span className="block truncate text-xs text-subtle">
                    {ch.username ? `@${ch.username.replace(/^@/, '')} · ` : ''}
                    {ch.category} · 회원 {(ch.memberCount ?? 0).toLocaleString()}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/** 광고 추가·수정 칸 */
function RankAdEditor({
  scope,
  category,
  slot: initialSlot,
  ad,
  onDone,
  onCancel,
}: {
  scope: RankAdScope;
  category: string | null;
  slot: number;
  ad?: AdminRankAd;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [picked, setPicked] = useState<PickedChannel | null>(
    ad?.channel
      ? { id: ad.channel.id, title: ad.channel.title, username: ad.channel.username, category: ad.channel.category }
      : null,
  );
  const [slot, setSlot] = useState(ad?.slot ?? initialSlot);
  const [startsOn, setStartsOn] = useState(isoToKstYmd(ad?.startsAt ?? null));
  const [endsOn, setEndsOn] = useState(isoToKstYmd(ad?.endsAt ?? null, true));
  const [memo, setMemo] = useState(ad?.memo ?? '');
  const [isActive, setIsActive] = useState(ad?.isActive ?? true);
  const [paidUsdt, setPaidUsdt] = useState(ad?.paidUsdt != null ? String(ad.paidUsdt) : '');
  const [paidOn, setPaidOn] = useState(ad?.paidOn ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const save = async () => {
    if (!picked) {
      setMessage('광고할 방을 골라 주세요.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const form = {
        channelId: picked.id,
        scope,
        category: scope === 'category' ? category : null,
        slot,
        startsOn,
        endsOn,
        memo,
        isActive,
        paidUsdt,
        paidOn,
      };
      if (ad) await updateAdminRankAd(ad.id, form);
      else await createAdminRankAd(form);
      onDone();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '저장하지 못했습니다.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl bg-background p-5 ring-2 ring-primary/40">
      <p className="text-base font-bold text-foreground">
        {ad ? '광고 수정' : '광고 넣기'} ·{' '}
        <span className="text-primary">{scope === 'global' ? '전체 카테고리' : category}</span>
      </p>
      <div className="text-sm font-medium text-subtle">
        광고할 방
        <ChannelSearch picked={picked} onPick={setPicked} category={scope === 'category' ? (category ?? undefined) : undefined} />
      </div>
      <div className="text-sm font-medium text-subtle">
        자리
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SLOTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSlot(n)}
              className={`h-11 min-w-[64px] rounded-xl px-4 text-[15px] font-bold ${
                slot === n ? 'bg-primary text-white' : 'bg-muted text-subtle hover:bg-muted/70'
              }`}
            >
              {n}위
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="text-sm font-medium text-subtle">
          시작일 (비우면 바로)
          <AdminDatePicker className="mt-1.5" value={startsOn} onChange={setStartsOn} placeholder="바로 시작" />
        </div>
        <div className="text-sm font-medium text-subtle">
          종료일 (이 날까지, 비우면 계속)
          <AdminDatePicker
            className="mt-1.5"
            value={endsOn}
            onChange={setEndsOn}
            placeholder="계속 노출"
            min={startsOn || undefined}
            quickBase={startsOn || undefined}
          />
        </div>
        <AdPaymentFields usdt={paidUsdt} onUsdt={setPaidUsdt} paidOn={paidOn} onPaidOn={setPaidOn} />
        <label className="block text-sm font-medium text-subtle">
          광고주·메모 (관리용)
          <input value={memo} onChange={(e) => setMemo(e.target.value)} className={inputClass} placeholder="예: @광고주 · 30일 · 50 TON" />
        </label>
        <label className="flex items-center gap-2.5 self-end pb-3 text-sm text-foreground">
          <input type="checkbox" className="h-5 w-5" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          노출 켜기
        </label>
      </div>
      {message && <p className="text-sm text-destructive">{message}</p>}
      <div className="flex gap-2">
        <button type="button" disabled={saving} onClick={() => void save()} className="h-11 rounded-xl bg-primary px-6 text-[15px] font-semibold text-white disabled:opacity-50">
          {saving ? '저장 중…' : ad ? '수정 저장' : '광고 넣기'}
        </button>
        <button type="button" onClick={onCancel} className="h-11 rounded-xl bg-muted px-5 text-[15px] font-semibold text-foreground">
          취소
        </button>
      </div>
    </div>
  );
}

function AdLine({
  ad,
  readOnly,
  onEdit,
  onRemove,
}: {
  ad: AdminRankAd;
  readOnly?: boolean;
  onEdit?: () => void;
  onRemove?: () => void;
}) {
  const label = STATE_LABEL[ad.state];
  const dim = ad.state === 'ended' || ad.state === 'off';
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-xl bg-background px-4 py-3 ring-1 ring-border ${dim ? 'opacity-60' : ''}`}>
      <span className="text-xl">{ad.channel?.linkType === 'group' ? '👥' : '📢'}</span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-[15px] font-bold text-foreground">
          <span className="truncate">{ad.channel?.title ?? '(지워진 방)'}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${label.cls}`}>{label.text}</span>
          {readOnly && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">전체 광고</span>
          )}
        </p>
        <p className="mt-0.5 truncate text-sm text-subtle">
          {ad.channel?.username ? `@${ad.channel.username.replace(/^@/, '')} · ` : ''}
          {isoToKstYmd(ad.startsAt) || '처음부터'} ~ {isoToKstYmd(ad.endsAt, true) || '계속'} · 클릭{' '}
          {ad.clicks.toLocaleString()}회{ad.memo ? ` · ${ad.memo}` : ''}
        </p>
        {!readOnly && (
          <p className="mt-1.5">
            <AdPaymentChips
              paidUsdt={ad.paidUsdt}
              paidOn={ad.paidOn}
              daysLeft={ad.daysLeft}
              live={ad.state === 'live' || ad.state === 'scheduled'}
            />
          </p>
        )}
      </div>
      {!readOnly && (
        <>
          <button type="button" onClick={onEdit} className="h-10 rounded-xl bg-muted px-4 text-sm font-semibold text-foreground">
            수정
          </button>
          <button type="button" onClick={onRemove} className="h-10 rounded-xl px-4 text-sm font-semibold text-destructive hover:bg-destructive/10">
            삭제
          </button>
        </>
      )}
    </div>
  );
}

/** 어드민 > 광고 관리 > 텔레그램방 광고 */
export function AdminRankAdsPage() {
  const [scope, setScope] = useState<RankAdScope>('global');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [ads, setAds] = useState<AdminRankAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState<{ slot: number; ad?: AdminRankAd } | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAds(await getAdminRankAds());
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '광고를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    getAdminCategories()
      .then((list) => {
        const active = list.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
        setCategories(active);
        setCategory((prev) => prev || active[0]?.name || '');
      })
      .catch(() => setCategories([]));
  }, [load]);

  const globalAds = useMemo(() => ads.filter((ad) => ad.scope === 'global'), [ads]);
  const shown = useMemo(
    () =>
      scope === 'global'
        ? globalAds
        : ads.filter((ad) => ad.scope === 'category' && ad.category === category),
    [ads, globalAds, scope, category],
  );
  const liveByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const ad of ads) {
      if (ad.scope === 'category' && ad.state === 'live' && ad.category)
        map.set(ad.category, (map.get(ad.category) ?? 0) + 1);
    }
    return map;
  }, [ads]);

  const remove = async (ad: AdminRankAd) => {
    if (!window.confirm(`"${ad.channel?.title ?? '광고'}" ${ad.slot}위 광고를 삭제할까요?`)) return;
    await deleteAdminRankAd(ad.id);
    await load();
  };

  const sorted = (list: AdminRankAd[]) =>
    [...list].sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'global', label: '🌐 전체 카테고리 1~5위', desc: '모든 카테고리 목록(전체 포함) 맨 위에 나와요' },
              { id: 'category', label: '📂 카테고리별 1~5위', desc: '고른 카테고리 목록 맨 위에만 나와요' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setScope(item.id);
                setEditor(null);
              }}
              className={`min-w-[240px] flex-1 rounded-2xl px-5 py-4 text-left ring-1 transition-colors ${
                scope === item.id ? 'bg-primary text-white ring-primary' : 'bg-background text-foreground ring-border hover:bg-muted'
              }`}
            >
              <p className="text-[16px] font-bold">{item.label}</p>
              <p className={`mt-1 text-sm ${scope === item.id ? 'text-white/80' : 'text-subtle'}`}>{item.desc}</p>
            </button>
          ))}
        </div>

        {scope === 'category' && (
          <div className="mt-4">
            <p className="text-sm font-medium text-subtle">카테고리</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {categories.map((c) => {
                const live = liveByCategory.get(c.name) ?? 0;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setCategory(c.name);
                      setEditor(null);
                    }}
                    className={`h-10 rounded-xl px-3.5 text-sm font-semibold ${
                      category === c.name ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/70'
                    }`}
                  >
                    {c.emoji} {c.name}
                    {live > 0 && (
                      <span className={`ml-1.5 rounded-full px-1.5 text-xs ${category === c.name ? 'bg-white/25' : 'bg-green-100 text-green-800'}`}>
                        {live}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-subtle">
              같은 자리에 <b>전체 광고</b>가 있으면 카테고리 광고는 바로 다음 빈 자리로 밀려 나와요.
            </p>
          </div>
        )}
      </div>

      {message && <p className="text-sm text-foreground">{message}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : (
        <div className="space-y-3">
          {SLOTS.map((slot) => {
            const mine = sorted(shown.filter((ad) => ad.slot === slot));
            const globalHere =
              scope === 'category'
                ? globalAds.filter((ad) => ad.slot === slot && (ad.state === 'live' || ad.state === 'scheduled'))
                : [];
            const live = mine.some((ad) => ad.state === 'live');
            return (
              <div key={slot} className="rounded-2xl bg-card p-5 shadow-[var(--hz-shadow)]">
                <div className="flex flex-wrap items-center gap-3">
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-2xl text-lg font-extrabold ${
                      live ? 'bg-amber-400 text-slate-900' : 'bg-muted text-subtle'
                    }`}
                  >
                    {slot}위
                  </span>
                  <p className="flex-1 text-sm text-subtle">
                    {live ? '지금 광고가 나오고 있어요' : mine.length ? '지금 나오는 광고는 없어요' : '비어 있어요'}
                  </p>
                  {editor?.slot !== slot && (
                    <button
                      type="button"
                      onClick={() => setEditor({ slot })}
                      className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
                    >
                      + 이 자리에 광고 넣기
                    </button>
                  )}
                </div>
                {(globalHere.length > 0 || mine.length > 0) && (
                  <div className="mt-3 space-y-2">
                    {globalHere.map((ad) => (
                      <AdLine key={ad.id} ad={ad} readOnly />
                    ))}
                    {mine.map((ad) =>
                      editor?.ad?.id === ad.id ? null : (
                        <AdLine key={ad.id} ad={ad} onEdit={() => setEditor({ slot, ad })} onRemove={() => void remove(ad)} />
                      ),
                    )}
                  </div>
                )}
                {editor?.slot === slot && (
                  <div className="mt-3">
                    <RankAdEditor
                      key={editor.ad?.id ?? `new-${slot}-${scope}-${category}`}
                      scope={scope}
                      category={scope === 'category' ? category : null}
                      slot={slot}
                      ad={editor.ad}
                      onCancel={() => setEditor(null)}
                      onDone={() => {
                        setEditor(null);
                        setMessage('저장했어요. 회원 화면에는 30초 안에 반영돼요.');
                        void load();
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-border pt-4">
        <button type="button" onClick={() => setShowLegacy((v) => !v)} className="text-sm text-muted-foreground underline">
          {showLegacy ? '예전 채널 광고 닫기' : '예전 채널 광고 보기 (회원 화면에는 더 이상 안 나옴)'}
        </button>
        {showLegacy && (
          <div className="-mx-6 mt-2">
            <AdminAdsManagePage />
          </div>
        )}
      </div>
    </div>
  );
}
