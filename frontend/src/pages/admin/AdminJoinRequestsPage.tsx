import { useCallback, useEffect, useState } from 'react';
import {
  collectAdminChannel,
  getAdminJoinBudget,
  getAdminJoinCandidates,
  getAdminJoinRequests,
  requestAdminChannelJoin,
  requestAdminJoinByLink,
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
  const [sending, setSending] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);

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

  // 오늘 한도를 다 썼는가(버튼 비활성화용)
  const limitReached =
    budget != null && budget.limit > 0 && budget.today >= budget.limit;

  // 텔레그램 앱에서 수집 계정으로 직접 들어간 방: 요청 없이 바로 읽기(하루 요청 한도와 무관)
  const [collectingId, setCollectingId] = useState<string | null>(null);
  const handleCollectById = async (id: string, title: string) => {
    if (collectingId) return;
    setCollectingId(id);
    try {
      const updated = await collectAdminChannel(id);
      const note = (updated as { collectNote?: string | null }).collectNote;
      setMessage(`${title}: 수집 끝${note ? ` · ${note}` : ''}`);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '수집에 실패했습니다.'));
    } finally {
      setCollectingId(null);
    }
  };

  const handleRequestById = async (id: string) => {
    if (sendingId) return;
    setSendingId(id);
    try {
      const res = await requestAdminChannelJoin(id);
      setMessage(`입장 요청: ${res.outcome}`);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '입장 요청에 실패했습니다.'));
    } finally {
      setSendingId(null);
    }
  };

  const handleSendByLink = async () => {
    const value = link.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      const res = await requestAdminJoinByLink(value);
      setMessage(`입장 요청: ${res.outcome}`);
      if (res.ok) setLink('');
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '입장 요청에 실패했습니다.'));
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const counts = {
    pending: rows?.filter((r) => r.joinRequestStatus === 'pending').length ?? 0,
    approved: rows?.filter((r) => r.joinRequestStatus === 'approved').length ?? 0,
    unanswered:
      rows?.filter((r) => r.joinRequestStatus === 'unanswered').length ?? 0,
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          승인이 필요한 비공개 방에 보낸 입장 요청과 그 결과입니다. 승인되면 글·조회까지
          자동으로 채워집니다. 요청은 밴 방지를 위해 하루 소량(큰 방 우선)만 자동으로 보냅니다.
          특정 방은 채널·그룹 관리에서 직접 요청할 수 있습니다.
        </p>
        <Button type="button" variant="outline" onClick={() => void load()}>
          새로고침
        </Button>
      </div>

      {message && <AdminMessage message={message} />}

      <div className="mt-4 rounded-xl border border-border p-4">
        <p className="text-sm font-semibold">초대 링크로 바로 입장 요청</p>
        <p className="mt-1 text-xs text-muted-foreground">
          승인 필요 비공개 방의 초대 링크(t.me/+…)를 붙여넣으면, 없으면 자동으로 등록하고
          입장 요청까지 보냅니다. 승인되면 글·조회가 채워집니다.
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSendByLink();
            }}
            placeholder="https://t.me/+초대코드"
            className="flex-1"
          />
          <Button
            type="button"
            disabled={sending || !link.trim() || limitReached}
            onClick={() => void handleSendByLink()}
          >
            {sending ? '요청 중…' : limitReached ? '오늘 한도 끝' : '입장 요청 보내기'}
          </Button>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-border">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">
              요청 후보 · 회원수 많은순
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              아직 요청 안 보낸 비공개 초대방이에요. 큰 방부터 보여 줍니다.
              버튼을 누르면 입장 요청이 나가고 아래 대기로 넘어가요. (자동 요청도
              같은 순서로 하루 소량씩 보냅니다.) 텔레그램 앱에서 수집 계정으로 직접
              들어간 방은 "지금 수집"을 누르면 바로 글이 채워지고 목록에서 빠져요.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {budget != null && budget.limit > 0 && (
              <Badge variant={limitReached ? 'destructive' : 'secondary'}>
                오늘 {budget.today}/{budget.limit}건
              </Badge>
            )}
            {candidates != null && (
              <Badge variant="outline">
                {candidates.length.toLocaleString()}개
              </Badge>
            )}
          </div>
        </div>
        {limitReached && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
            오늘 입장 요청 한도({budget?.limit}건)를 다 썼어요. 내일 0시에 다시
            열려요. (새 계정 보호를 위해 하루 소량만 보냅니다)
          </div>
        )}
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
          <div className="max-h-[420px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-right">#</TableHead>
                  <TableHead>방</TableHead>
                  <TableHead className="w-24 text-right">회원</TableHead>
                  <TableHead className="w-56 text-right">수집 · 요청</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c, i) => (
                  <TableRow key={c.id}>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {i + 1}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c.title}</div>
                      <a
                        href={c.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline"
                      >
                        {c.link}
                      </a>
                    </TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {c.memberCount != null
                        ? c.memberCount.toLocaleString()
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mr-2"
                        title="앱에서 수집 계정으로 이미 들어간 방이면 바로 글을 읽어요(요청 한도와 무관)"
                        disabled={collectingId != null}
                        onClick={() => void handleCollectById(c.id, c.title)}
                      >
                        {collectingId === c.id ? '수집 중…' : '지금 수집'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={sendingId != null || limitReached}
                        onClick={() => void handleRequestById(c.id)}
                      >
                        {sendingId === c.id
                          ? '요청 중…'
                          : limitReached
                            ? '오늘 한도 끝'
                            : '입장 요청'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
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
        {rows == null ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">
            아직 입장 요청을 보낸 방이 없습니다. 새벽 수집에서 승인필요 큰 방을 찾으면
            자동으로 요청하거나, 채널·그룹 관리에서 직접 요청하세요.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>방</TableHead>
                <TableHead className="w-24 text-right">회원</TableHead>
                <TableHead className="w-28">요청 계정</TableHead>
                <TableHead className="w-28">요청일</TableHead>
                <TableHead className="w-40">상태</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
