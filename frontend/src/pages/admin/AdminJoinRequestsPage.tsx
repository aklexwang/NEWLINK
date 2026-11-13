import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collectAdminChannel,
  getAdminJoinBudget,
  getAdminJoinCandidates,
  getAdminJoinRequests,
  markAdminJoinRequested,
  markAdminJoinRequestedByLink,
  unmarkAdminJoinRequested,
  type JoinBudget,
  type JoinCandidateChannel,
  type JoinRequestChannel,
  type JoinRequestStatus,
} from '../../api/admin';
import { AdminMessage } from '../../components/admin/AdminTable';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Input } from '@/components/admin/ui/input';
import { Skeleton } from '@/components/admin/ui/skeleton';

function formatKst(value: string | null): string {
  if (!value) return '-';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return '-';
  return at.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const at = new Date(value).getTime();
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.floor((Date.now() - at) / 86_400_000));
}

function statusBadge(status: JoinRequestStatus, requestedAt: string | null) {
  if (status === 'approved') {
    return <Badge variant="default">승인됨 · 글 읽는 중</Badge>;
  }
  if (status === 'unanswered') {
    return <Badge variant="destructive">미승인(응답 없음)</Badge>;
  }
  if (status === 'pending') {
    const d = daysSince(requestedAt);
    return (
      <Badge variant="secondary">
        대기{d != null ? ` ${d}일째` : ''}
      </Badge>
    );
  }
  return <Badge variant="outline">요청 없음</Badge>;
}

const PAGE = 30;

function fmt(n: number | null | undefined): string {
  return n != null ? n.toLocaleString() : '-';
}

export function AdminJoinRequestsPage() {
  const [rows, setRows] = useState<JoinRequestChannel[] | null>(null);
  const [candidates, setCandidates] = useState<JoinCandidateChannel[] | null>(
    null,
  );
  const [budget, setBudget] = useState<JoinBudget | null>(null);
  const [message, setMessage] = useState('');
  const [link, setLink] = useState('');
  /** 지금 처리 중인 버튼(한 번에 하나) */
  const [busy, setBusy] = useState<string | null>(null);
  /** 후보 카드는 30개씩 보여 준다 */
  const [shown, setShown] = useState(PAGE);

  const load = useCallback(async () => {
    try {
      const [requested, cands, bud] = await Promise.all([
        getAdminJoinRequests(),
        getAdminJoinCandidates().catch(() => [] as JoinCandidateChannel[]),
        getAdminJoinBudget().catch(() => null),
      ]);
      setRows(requested);
      setCandidates(cands);
      setBudget(bud);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '입장 요청 목록을 불러오지 못했습니다.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (
    key: string,
    action: () => Promise<string>,
    fallbackError: string,
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      setMessage(await action());
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, fallbackError));
    } finally {
      setBusy(null);
    }
  };

  /** 앱에서 입장 요청을 눌렀음 → 기록만(텔레그램엔 아무것도 안 보냄) */
  const handleMark = (c: { id: string; title: string }) =>
    run(
      `mark:${c.id}`,
      async () => `${c.title}: ${(await markAdminJoinRequested(c.id)).outcome}`,
      '요청함 표시에 실패했습니다.',
    );

  const handleUnmark = (r: { id: string; title: string }) =>
    run(
      `unmark:${r.id}`,
      async () => `${r.title}: ${(await unmarkAdminJoinRequested(r.id)).outcome}`,
      '취소에 실패했습니다.',
    );

  /** 수집 계정으로 바로 읽기(이미 들어간 방 / 승인됐는지 지금 확인) — 요청 한도와 무관 */
  const handleCollect = (c: { id: string; title: string }) =>
    run(
      `collect:${c.id}`,
      async () => {
        const updated = await collectAdminChannel(c.id);
        const note = (updated as { collectNote?: string | null }).collectNote;
        return `${c.title}: 확인 끝${note ? ` · ${note}` : ''}`;
      },
      '확인에 실패했습니다.',
    );

  const handleMarkByLink = () => {
    const value = link.trim();
    if (!value) return;
    return run(
      'link',
      async () => {
        const res = await markAdminJoinRequestedByLink(value);
        if (res.ok) setLink('');
        return `초대 링크: ${res.outcome}`;
      },
      '요청함 표시에 실패했습니다.',
    );
  };

  // 승인된 방은 데이터를 이미 가져오므로 목록에서 빼고(채널·그룹 관리에서 봄) 숫자만 센다
  const waitingRows = rows?.filter((r) => r.joinRequestStatus !== 'approved') ?? null;

  const counts = {
    pending: rows?.filter((r) => r.joinRequestStatus === 'pending').length ?? 0,
    approved: rows?.filter((r) => r.joinRequestStatus === 'approved').length ?? 0,
    unanswered:
      rows?.filter((r) => r.joinRequestStatus === 'unanswered').length ?? 0,
  };

  const maxMembers = useMemo(
    () => Math.max(1, ...(candidates ?? []).map((c) => c.memberCount ?? 0)),
    [candidates],
  );
  const waitingCount = counts.pending + counts.unanswered;

  const tiles = [
    { label: '오늘 요청함', value: budget?.today ?? null },
    { label: '요청 후보', value: candidates?.length ?? null },
    { label: '승인 대기', value: rows ? waitingCount : null },
    { label: '승인됨', value: rows ? counts.approved : null },
  ];

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-[2240px] px-4 py-6 sm:px-6 xl:px-10">
        {/* 상단: 콘솔 헤더 + 숫자 타일 */}
        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1230] via-[#122a6e] to-[#1d4ed8] p-6 text-white shadow-lg">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.07)_1px,transparent_1px)] [background-size:28px_28px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-sky-400/30 blur-3xl"
          />
          <div className="relative flex flex-wrap items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="font-mono text-[11px] tracking-[0.3em] text-sky-300">
                JOIN REQUEST CONSOLE
              </p>
              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">비공개 방 입장 요청</h1>
              <p className="mt-2 text-sm text-white/70">
                텔레그램 앱에서 요청 → 여기서 <b className="text-white">요청함</b> → 승인되면
                서버가 자동으로 글·조회수를 가져와요
              </p>
            </div>
            <div className="flex items-end gap-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {tiles.map((t) => (
                  <div
                    key={t.label}
                    className="min-w-[120px] rounded-xl bg-white/10 px-4 py-3 ring-1 ring-white/15 backdrop-blur"
                  >
                    <div className="text-xs text-white/60">{t.label}</div>
                    <div className="mt-1 font-mono text-3xl font-bold tabular-nums">
                      {t.value == null ? '–' : t.value.toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                className="border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={() => void load()}
              >
                새로고침
              </Button>
            </div>
          </div>
        </section>

        {message && <AdminMessage message={message} />}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px] min-[2000px]:grid-cols-[minmax(0,1fr)_440px]">
          {/* 왼쪽: 요청 후보 카드 */}
          <section className="min-w-0">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">요청 후보</h2>
                <p className="text-sm text-muted-foreground">
                  아직 요청 안 한 비공개 초대방 · 회원 많은 순
                </p>
              </div>
            </div>

            {candidates == null ? (
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3 min-[2000px]:grid-cols-4">
                {Array.from({ length: 6 }).map((_, k) => (
                  <Skeleton key={k} className="h-48 rounded-2xl" />
                ))}
              </div>
            ) : candidates.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                요청할 비공개 초대방 후보가 없어요.
              </p>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3 min-[2000px]:grid-cols-4">
                  {candidates.slice(0, shown).map((c, i) => {
                    const pct = Math.max(
                      4,
                      Math.round(((c.memberCount ?? 0) / maxMembers) * 100),
                    );
                    return (
                      <article
                        key={c.id}
                        className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                            #{String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                            PRIVATE · INVITE
                          </span>
                        </div>
                        <h3 className="mt-3 truncate text-xl font-bold" title={c.title}>
                          {c.title}
                        </h3>
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className="font-mono text-2xl font-bold tabular-nums">
                            {fmt(c.memberCount)}
                          </span>
                          <span className="text-sm text-muted-foreground">명</span>
                        </div>
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-600"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="mt-5 grid grid-cols-3 gap-2">
                          <a
                            href={c.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={c.link}
                            className="inline-flex h-10 items-center justify-center rounded-md border border-border text-sm font-medium hover:bg-secondary"
                          >
                            텔레그램
                          </a>
                          <Button
                            type="button"
                            className="h-10"
                            title="텔레그램 앱에서 입장 요청을 누른 뒤 눌러 주세요(기록만 해요)"
                            disabled={busy != null}
                            onClick={() => void handleMark(c)}
                          >
                            {busy === `mark:${c.id}` ? '표시 중…' : '요청함'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className="h-10"
                            title="바로 가입되는 방에 이미 들어갔으면 바로 글을 읽어요"
                            disabled={busy != null}
                            onClick={() => void handleCollect(c)}
                          >
                            {busy === `collect:${c.id}` ? '수집 중…' : '지금 수집'}
                          </Button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {shown < candidates.length && (
                  <div className="mt-5 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      onClick={() => setShown((n) => n + PAGE)}
                    >
                      더 보기 · 남은 {(candidates.length - shown).toLocaleString()}개
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* 오른쪽: 사용 순서 · 링크 입력 · 승인 대기 */}
          <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="font-mono text-[11px] tracking-[0.25em] text-primary">HOW IT WORKS</p>
              <ol className="mt-3 space-y-3 text-sm">
                {[
                  ['텔레그램', '카드의 텔레그램 → 3번 계정으로 입장 요청'],
                  ['요청함', '여기서 요청함 → 승인 대기로 이동(기록만)'],
                  ['자동 확인', '3시간마다 승인 확인 → 글·조회 수집'],
                  ['바로 가입', '승인 필요 없는 방은 지금 수집만'],
                ].map(([t, d], k) => (
                  <li key={t} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">
                      {k + 1}
                    </span>
                    <div>
                      <div className="font-semibold">{t}</div>
                      <div className="text-muted-foreground">{d}</div>
                    </div>
                  </li>
                ))}
              </ol>
              <p className="mt-4 rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
                새 계정 보호: 앱에서는 하루 2~3건, 간격을 두고 요청해 주세요.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="font-semibold">목록에 없는 방</p>
              <p className="mt-1 text-xs text-muted-foreground">
                요청한 방이 후보에 없으면 초대 링크를 붙여넣으세요.
              </p>
              <div className="mt-3 flex gap-2">
                <Input
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleMarkByLink();
                  }}
                  placeholder="https://t.me/+초대코드"
                  className="h-10 flex-1 font-mono text-sm"
                />
                <Button
                  type="button"
                  className="h-10"
                  disabled={busy != null || !link.trim()}
                  onClick={() => void handleMarkByLink()}
                >
                  {busy === 'link' ? '…' : '요청함'}
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-border px-5 py-4">
                <p className="font-semibold">승인 대기</p>
                <span className="font-mono text-sm font-bold tabular-nums text-primary">
                  {waitingRows ? waitingRows.length : '–'}
                </span>
              </div>
              {waitingRows == null ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-14 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : waitingRows.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                  승인 기다리는 방이 없어요.
                </p>
              ) : (
                <ul className="max-h-[520px] divide-y divide-border overflow-y-auto">
                  {waitingRows.map((r) => (
                    <li key={r.id} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-2">
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="min-w-0 truncate font-semibold hover:underline"
                          title={r.link}
                        >
                          {r.title}
                        </a>
                        {statusBadge(r.joinRequestStatus, r.joinRequestedAt)}
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">
                        {fmt(r.memberCount)}명 · {formatKst(r.joinRequestedAt)}
                        {r.joinRequestAccount ? ` · ${r.joinRequestAccount}` : ''}
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          title="승인됐는지 지금 확인(승인됐으면 글까지 읽어요)"
                          disabled={busy != null}
                          onClick={() => void handleCollect(r)}
                        >
                          {busy === `collect:${r.id}` ? '확인 중…' : '지금 확인'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          title="오래 기다렸거나 잘못 눌렀으면 취소(후보로 돌아가요)"
                          disabled={busy != null}
                          onClick={() => void handleUnmark(r)}
                        >
                          {busy === `unmark:${r.id}` ? '취소 중…' : '취소'}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
