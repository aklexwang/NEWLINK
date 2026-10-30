import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminUserActivity,
  getAdminUserAiSummary,
  type MemberActivityItem,
  type MemberActivityProfile,
} from '../../api/admin';
import type { AdminUser } from '../../types/user';

const KIND_LABEL: Record<MemberActivityItem['kind'], string> = {
  search: '🔎 검색',
  open: '✈️ 이동',
  view: '👀 상세',
  favorite: '⭐ 즐겨찾기',
  category: '📂 카테고리',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

/** 회원 관리: 회원을 누르면 오른쪽에 열리는 성향·활동 패널 */
export function MemberActivityPanel({ user, onClose }: { user: AdminUser; onClose: () => void }) {
  const [profile, setProfile] = useState<MemberActivityProfile | null>(null);
  const [recent, setRecent] = useState<MemberActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ai, setAi] = useState<{ busy: boolean; text: string }>({ busy: false, text: '' });

  useEffect(() => {
    // 회원이 바뀌면 부모가 key 로 새로 그려서 상태가 처음부터 시작한다
    let alive = true;
    getAdminUserActivity(user.telegramId)
      .then((d) => {
        if (!alive) return;
        setProfile(d.profile);
        setRecent(d.recent);
      })
      .catch(() => alive && setError('활동 기록을 불러오지 못했어요.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user.telegramId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const runAi = async () => {
    setAi({ busy: true, text: '' });
    try {
      const r = await getAdminUserAiSummary(user.telegramId);
      setAi({ busy: false, text: r.summary ?? r.reason ?? 'AI 요약을 만들지 못했어요.' });
    } catch {
      setAi({ busy: false, text: 'AI 요약 중 오류가 났어요.' });
    }
  };

  const maxHour = Math.max(1, ...(profile?.hours ?? [0]));

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col overflow-hidden bg-card shadow-2xl ring-1 ring-border">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary">
            {(user.firstName?.[0] ?? user.username?.[0] ?? '?').toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold text-foreground">{user.firstName ?? '-'}</p>
            <p className="truncate text-sm text-muted-foreground">
              {user.username ? `@${user.username}` : 'username 없음'} · {user.telegramId}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm ring-1 ring-border hover:bg-muted">
            닫기
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : !profile || profile.total === 0 ? (
            <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
              최근 90일 동안 기록된 활동이 없어요. (로그인한 상태에서 검색·이동·상세 보기 등을 하면 쌓여요)
            </p>
          ) : (
            <>
              <section className="rounded-2xl bg-primary/10 px-4 py-3 ring-1 ring-primary/30">
                <p className="text-xs font-semibold text-primary">성향</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {profile.labels.map((l) => (
                    <span key={l} className="rounded-full bg-primary px-2.5 py-1 text-xs font-bold text-white">
                      {l}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-sm text-foreground">{profile.summary}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  활동 {profile.total}건 · 비공개방 비율 {profile.privateShare}% ·{' '}
                  {profile.lastAt ? `마지막 활동 ${timeAgo(profile.lastAt)}` : ''}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={ai.busy}
                    onClick={() => void runAi()}
                    className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {ai.busy ? 'AI 요약 중…' : '🤖 AI 요약'}
                  </button>
                  <span className="text-xs text-muted-foreground">누를 때만 AI 하루 한도를 1번 써요</span>
                </div>
                {ai.text && <p className="mt-2 rounded-xl bg-card px-3 py-2 text-sm leading-relaxed text-foreground ring-1 ring-border">{ai.text}</p>}
              </section>

              {profile.categories.length > 0 && (
                <section>
                  <p className="mb-2 text-sm font-semibold text-foreground">관심 카테고리</p>
                  <div className="space-y-1.5">
                    {profile.categories.map((c) => (
                      <div key={c.name} className="flex items-center gap-2 text-sm">
                        <span className="w-24 shrink-0 truncate text-foreground">{c.name}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${c.share}%` }} />
                        </div>
                        <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">{c.share}%</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">이동·즐겨찾기를 상세 보기보다 크게 쳐서 계산해요</p>
                </section>
              )}

              {profile.keywords.length > 0 && (
                <section>
                  <p className="mb-2 text-sm font-semibold text-foreground">검색한 키워드</p>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.keywords.map((k) => (
                      <span key={k.keyword} className="rounded-full bg-muted px-2.5 py-1 text-sm text-foreground ring-1 ring-border">
                        {k.keyword}
                        {k.count > 1 && <b className="ml-1 text-primary">{k.count}</b>}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {profile.topRooms.length > 0 && (
                <section>
                  <p className="mb-2 text-sm font-semibold text-foreground">자주 간 방</p>
                  <ul className="space-y-1">
                    {profile.topRooms.map((r) => (
                      <li key={r.channelId} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted">
                        <Link to={`/admin/links?q=${encodeURIComponent(r.title)}`} className="min-w-0 flex-1 truncate text-foreground hover:underline">
                          {r.title}
                        </Link>
                        <span className="shrink-0 text-xs text-muted-foreground">{r.category}</span>
                        <span className="shrink-0 text-xs tabular-nums text-foreground">이동 {r.opens} · 상세 {r.views}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <p className="mb-2 text-sm font-semibold text-foreground">활동 시간대 (한국 시간)</p>
                <div className="flex h-16 items-end gap-[3px]">
                  {profile.hours.map((n, h) => (
                    <div key={h} className="flex flex-1 flex-col items-center gap-0.5" title={`${h}시 · ${n}건`}>
                      <div className="w-full rounded-sm bg-primary/70" style={{ height: `${Math.round((n / maxHour) * 52)}px` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
                  <span>0시</span>
                  <span>6시</span>
                  <span>12시</span>
                  <span>18시</span>
                  <span>23시</span>
                </div>
              </section>

              <section>
                <p className="mb-2 text-sm font-semibold text-foreground">최근 활동</p>
                <ul className="divide-y divide-border rounded-xl ring-1 ring-border">
                  {recent.map((item, i) => (
                    <li key={`${item.at}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground">{KIND_LABEL[item.kind]}</span>
                      <span className="min-w-0 flex-1 truncate text-foreground">
                        {item.kind === 'search'
                          ? `"${item.keyword}"`
                          : item.kind === 'category'
                            ? item.category
                            : (item.title ?? '(삭제된 방)')}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(item.at)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
          <p className="text-[11px] text-muted-foreground">
            최근 90일 기록만 보관해요. 회원을 삭제하면 기록도 같이 지워져요. 어드민만 볼 수 있어요.
          </p>
        </div>
      </aside>
    </>
  );
}
