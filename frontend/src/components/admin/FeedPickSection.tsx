import { useCallback, useEffect, useState } from 'react';
import { getAdminFeedRooms, setAdminFeedPicked, type AdminFeedRoom } from '../../api/admin';
import type { CategoryItem } from '../../types/categoryItem';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { resolveMediaUrl } from '../../utils/mediaUrl';

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
      setRooms((list) =>
        view === 'picked' && room.feedPicked
          ? list.filter((r) => r.id !== room.id)
          : list.map((r) => (r.id === room.id ? { ...r, feedPicked: !r.feedPicked } : r)),
      );
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
            채널 {total.toLocaleString()}개{total > rooms.length ? ` · 구독자 많은 순 ${rooms.length}개까지 보여요 (검색으로 좁히세요)` : ''}
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
          rooms.map((room) => (
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
                <p className="truncate text-[15px] font-bold text-foreground">{room.title}</p>
                <p className="mt-0.5 text-xs text-subtle">
                  {room.category} · 구독 {(room.memberCount ?? 0).toLocaleString()}
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
