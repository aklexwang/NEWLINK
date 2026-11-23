import { useCallback, useEffect, useState } from 'react';
import { getAdminFeedRooms, setAdminFeedPicked, type AdminFeedRoom } from '../../api/admin';
import type { CategoryItem } from '../../types/categoryItem';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { resolveMediaUrl } from '../../utils/mediaUrl';

/** 텔레그램 방을 오른쪽 작은 새 창으로 */
function openTelegramWindow(e: { preventDefault(): void }, link: string) {
  const w = 560;
  const h = Math.min(820, window.screen.availHeight - 80);
  const left = Math.max(0, window.screen.availWidth - w - 40);
  const win = window.open(link, 'telllink_telegram', `popup=yes,width=${w},height=${h},left=${left},top=40`);
  if (win) {
    e.preventDefault();
    win.focus();
  }
}

function ago(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}시간 전`;
  return `${Math.round(h / 24)}일 전`;
}

/** 홈 피드 방 고르기 (tele.wiki 방식: 고른 방의 최신 글 1개씩, 새 글 순) */
export function FeedPickSection({ categories }: { categories: CategoryItem[] }) {
  const [view, setView] = useState<'search' | 'picked'>('search');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  // 고른 방 보기: 카테고리 칸으로 거르기 (화면에서만)
  const [pickedCat, setPickedCat] = useState('');
  const [rooms, setRooms] = useState<AdminFeedRoom[]>([]);
  const [total, setTotal] = useState(0);
  const [pickedTotal, setPickedTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminFeedRooms(
        view === 'picked' ? { picked: true, limit: 200 } : { q: query, category, limit: 80 },
      );
      setRooms(data.items);
      setTotal(data.total);
      setPickedTotal(data.pickedTotal);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '방을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [view, query, category]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (room: AdminFeedRoom) => {
    setBusy(room.id);
    try {
      await setAdminFeedPicked(room.id, !room.feedPicked);
      // 방 찾기에서 넣으면 목록에서 사라지고, 고른 방에서 빼면 거기서 사라진다
      setRooms((list) => list.filter((r) => r.id !== room.id));
      if (view === 'search') setTotal((n) => Math.max(0, n - 1));
      setPickedTotal((n) => n + (room.feedPicked ? -1 : 1));
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '바꾸지 못했습니다.'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-[20px] bg-card p-5 shadow-[var(--hz-shadow)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[17px] font-bold">홈 피드 방 고르기</p>
          <p className="mt-1 text-sm text-subtle">
            고른 방의 <b>최신 글 1개씩</b>이 새 글 순으로 회원 홈 피드에 나와요.{' '}
            {pickedTotal > 0
              ? '지금 홈 피드는 고른 방만 나와요.'
              : '아직 고른 방이 없어서 지금은 아래 "광고 거르기" 자동 피드가 나와요.'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            새 글 확인: 공개 채널 15분마다 · 비공개(초대 링크) 방은 30분마다 (고른 비공개 방이 많아지면 수집 계정 한도에 맞춰 간격이 늘어나요)
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setView('search')}
            className={`h-14 rounded-2xl px-7 text-lg font-bold ${view === 'search' ? 'bg-primary text-white' : 'bg-muted text-subtle'}`}
          >
            🔍 방 찾기
          </button>
          <button
            type="button"
            onClick={() => setView('picked')}
            className={`h-14 rounded-2xl px-7 text-lg font-bold ${view === 'picked' ? 'bg-primary text-white' : 'bg-muted text-subtle'}`}
          >
            ✅ 고른 방 {pickedTotal}
          </button>
        </div>
      </div>

      {view === 'picked' && rooms.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-subtle">카테고리별 고른 방</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              ['', rooms.length] as const,
              ...Object.entries(
                rooms.reduce<Record<string, number>>((m, r) => {
                  m[r.category] = (m[r.category] ?? 0) + 1;
                  return m;
                }, {}),
              ).sort((a, b) => b[1] - a[1]),
            ].map(([name, n]) => (
              <button
                key={name || 'all'}
                type="button"
                onClick={() => setPickedCat(name)}
                className={`h-9 rounded-xl px-3.5 text-sm font-semibold ${
                  pickedCat === name ? 'bg-primary text-white' : 'bg-muted text-foreground hover:bg-muted/70'
                }`}
              >
                {name || '전체'} <span className="ml-0.5 opacity-80">{n}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {view === 'search' && (
        <div className="mt-4 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(q.trim());
            }}
            className="flex gap-2"
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="방 이름 · @아이디 검색"
              className="h-11 flex-1 rounded-xl bg-background px-3.5 text-[15px] ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button type="submit" className="h-11 rounded-xl bg-primary px-5 text-[15px] font-semibold text-white">
              검색
            </button>
          </form>
          <div className="flex flex-wrap gap-1.5">
            {[{ id: '', name: '전체' }, ...categories.filter((c) => c.isActive !== false)].map((c) => (
              <button
                key={c.id || 'all'}
                type="button"
                onClick={() => setCategory(c.id ? c.name : '')}
                className={`h-8 rounded-lg px-3 text-[13px] font-semibold ${
                  (c.id ? c.name : '') === category ? 'bg-primary text-white' : 'bg-muted text-subtle hover:bg-muted/70'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            채널 {total.toLocaleString()}개 · 최근 글 올라온 순{total > rooms.length ? ` · 최근 글 순 ${rooms.length}개까지 보여요 (검색으로 좁히세요)` : ''}
          </p>
        </div>
      )}

      {message && <p className="mt-3 text-sm text-destructive">{message}</p>}

      <div className="mt-4 space-y-2">
        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : rooms.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {view === 'picked' ? '아직 고른 방이 없어요. [방 찾기]에서 골라 주세요.' : '찾는 방이 없어요.'}
          </p>
        ) : (
          rooms
            .filter(
              (room) =>
                view !== 'picked' ||
                !pickedCat ||
                !rooms.some((r) => r.category === pickedCat) ||
                room.category === pickedCat,
            )
            .map((room) => (
            <div
              key={room.id}
              className={`flex items-start gap-3 rounded-xl p-3 ring-1 ${room.feedPicked ? 'bg-primary/5 ring-primary/40' : 'bg-background ring-border'}`}
            >
              {room.avatarUrl ? (
                <img src={resolveMediaUrl(room.avatarUrl)} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
              ) : (
                <div className="h-11 w-11 shrink-0 rounded-full bg-muted" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-[15px] font-bold text-foreground">{room.title}</p>
                  <a
                    href={room.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => openTelegramWindow(e, room.link)}
                    title={room.link}
                    className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-[#2AABEE] px-2.5 text-xs font-bold text-white hover:bg-[#229ED9]"
                  >
                    ✈ 텔레그램 열기
                  </a>
                </div>
                <p className="mt-0.5 text-xs text-subtle">
                  {room.linkType === 'group' ? '그룹' : '채널'} · {room.category} · {room.linkType === 'group' ? '회원' : '구독'}{' '}
                  {(room.memberCount ?? 0).toLocaleString()}
                  {room.username && (
                    <a
                      href={`https://t.me/${room.username}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1.5 text-primary hover:underline"
                    >
                      @{room.username}
                    </a>
                  )}
                </p>
                <p className="mt-1 line-clamp-2 text-[13px] text-foreground/80">
                  {room.latestPost
                    ? `${ago(room.latestPost.postedAt)} · ${room.latestPost.text?.trim() || (room.latestPost.mediaType !== 'text' ? '[사진·영상]' : '')}`
                    : '최근 30일 글 없음'}
                </p>
              </div>
              <button
                type="button"
                disabled={busy === room.id}
                onClick={() => void toggle(room)}
                className={`h-10 shrink-0 rounded-xl px-4 text-sm font-bold disabled:opacity-50 ${
                  room.feedPicked ? 'bg-muted text-destructive' : 'bg-primary text-white'
                }`}
              >
                {room.feedPicked ? '빼기' : '+ 피드에 넣기'}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
