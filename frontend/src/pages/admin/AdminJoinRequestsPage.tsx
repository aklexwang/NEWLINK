import { useCallback, useEffect, useState } from 'react';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/admin/ui/table';

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

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl rounded-xl border border-border bg-secondary/30 p-4 text-sm">
          <p className="font-semibold">입장 요청은 텔레그램 앱에서 직접 해요</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
            <li>
              아래 후보에서 <b>텔레그램에서 열기</b> → 수집 계정(3번)으로 <b>입장 요청</b>을
              누르세요.
            </li>
            <li>
              여기서 <b>요청함</b>을 누르면 대기 목록으로 옮겨져요. (서버는 텔레그램에 아무것도
              보내지 않고 기록만 해요)
            </li>
            <li>
              서버가 <b>3시간마다</b> 대기 중인 방을 확인해서, 승인됐으면 <b>승인됨</b>으로
              바꾸고 글·조회수까지 가져와요. 급하면 대기 목록의 <b>지금 확인</b>.
            </li>
            <li>
              바로 가입되는 방(승인 필요 없음)에 들어갔으면 요청함 대신 <b>지금 수집</b>만
              누르면 돼요.
            </li>
          </ol>
          <p className="mt-2 text-xs text-muted-foreground">
            승인된 방은 이 화면에서 빠지고 채널·그룹 관리에서 보여요. 새 계정 보호를 위해
            텔레그램 앱에서는 하루 2~3건 정도, 간격을 두고 눌러 주세요.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()}>
          새로고침
        </Button>
      </div>

      {message && <AdminMessage message={message} />}

      <div className="mt-6 rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-lg font-semibold">요청 후보 · 회원수 많은순</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              아직 요청 안 한 비공개 초대방이에요. 큰 방부터 보여 줍니다.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {budget != null && (
              <Badge variant="secondary">오늘 요청함 {budget.today}건</Badge>
            )}
            {candidates != null && (
              <Badge variant="outline">
                {candidates.length.toLocaleString()}개
              </Badge>
            )}
          </div>
        </div>
        {candidates == null ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : candidates.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            요청할 비공개 초대방 후보가 없습니다.
          </p>
        ) : (
          <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
            {candidates.map((c, i) => (
              <li
                key={c.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
              >
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  <span className="w-8 shrink-0 text-center text-lg font-bold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{c.title}</div>
                    <div className="mt-0.5 text-base text-muted-foreground">
                      회원{' '}
                      <b className="text-foreground tabular-nums">
                        {c.memberCount != null ? c.memberCount.toLocaleString() : '-'}
                      </b>
                      명
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2 sm:pl-4">
                  <a
                    href={c.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={c.link}
                    className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary"
                  >
                    텔레그램에서 열기
                  </a>
                  <Button
                    type="button"
                    size="lg"
                    title="텔레그램 앱에서 입장 요청을 누른 뒤 눌러 주세요(기록만 해요)"
                    disabled={busy != null}
                    onClick={() => void handleMark(c)}
                  >
                    {busy === `mark:${c.id}` ? '표시 중…' : '요청함'}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    title="바로 가입되는 방에 이미 들어갔으면 바로 글을 읽어요"
                    disabled={busy != null}
                    onClick={() => void handleCollect(c)}
                  >
                    {busy === `collect:${c.id}` ? '수집 중…' : '지금 수집'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 rounded-xl border border-border p-4">
        <p className="text-sm font-semibold">목록에 없는 방</p>
        <p className="mt-1 text-xs text-muted-foreground">
          텔레그램에서 입장 요청한 방이 위 목록에 없으면 초대 링크(t.me/+…)를 붙여넣으세요.
          없으면 등록하고 요청함으로 표시해요.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleMarkByLink();
            }}
            placeholder="https://t.me/+초대코드"
            className="flex-1"
          />
          <Button
            type="button"
            disabled={busy != null || !link.trim()}
            onClick={() => void handleMarkByLink()}
          >
            {busy === 'link' ? '표시 중…' : '등록 + 요청함'}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-xl">
        <div className="rounded-xl border border-border bg-secondary/40 px-4 py-4 text-center">
          <div className="text-3xl font-bold tabular-nums">{counts.pending}</div>
          <div className="mt-1 text-sm font-medium text-muted-foreground">대기</div>
        </div>
        <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-4 text-center">
          <div className="text-3xl font-bold tabular-nums text-primary">{counts.approved}</div>
          <div className="mt-1 text-sm font-medium text-muted-foreground">승인됨</div>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-4 text-center">
          <div className="text-3xl font-bold tabular-nums text-destructive">{counts.unanswered}</div>
          <div className="mt-1 text-sm font-medium text-muted-foreground">미승인</div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-border">
        {waitingRows == null ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : waitingRows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            승인 기다리는 방이 없습니다.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>방</TableHead>
                <TableHead className="w-24 text-right">회원</TableHead>
                <TableHead className="w-32">요청 계정</TableHead>
                <TableHead className="w-28">요청일</TableHead>
                <TableHead className="w-40">상태</TableHead>
                <TableHead className="w-44 text-right">동작</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waitingRows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.title}</div>
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline"
                    >
                      {r.link}
                    </a>
                  </TableCell>
                  <TableCell className="text-right">
                    {r.memberCount != null ? r.memberCount.toLocaleString() : '-'}
                  </TableCell>
                  <TableCell className="text-sm">
                    {r.joinRequestAccount ? (
                      <Badge variant="outline">{r.joinRequestAccount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatKst(r.joinRequestedAt)}
                  </TableCell>
                  <TableCell>
                    {statusBadge(r.joinRequestStatus, r.joinRequestedAt)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mr-2"
                      title={
                        r.joinRequestStatus === 'approved'
                          ? '글·조회 새로 읽기'
                          : '승인됐는지 지금 확인(승인됐으면 글까지 읽어요)'
                      }
                      disabled={busy != null}
                      onClick={() => void handleCollect(r)}
                    >
                      {busy === `collect:${r.id}`
                        ? '확인 중…'
                        : r.joinRequestStatus === 'approved'
                          ? '지금 수집'
                          : '지금 확인'}
                    </Button>
                    {r.joinRequestStatus !== 'approved' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title="잘못 눌렀으면 취소(후보 목록으로 돌아가요)"
                        disabled={busy != null}
                        onClick={() => void handleUnmark(r)}
                      >
                        {busy === `unmark:${r.id}` ? '취소 중…' : '취소'}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      </div>
    </div>
  );
}
