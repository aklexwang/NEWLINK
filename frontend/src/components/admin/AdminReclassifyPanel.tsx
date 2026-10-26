import { useCallback, useEffect, useState } from 'react';
import {
  applyReclassify,
  getReclassifyItems,
  getReclassifyStatus,
  startReclassify,
  stopReclassify,
  type ReclassifyItem,
  type ReclassifyStatus,
} from '../../api/reclassify';
import { Badge } from '@/components/admin/ui/badge';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card';

const PAGE = 100;

function pct(value: number | null): string {
  return value == null ? '-' : `${Math.round(value * 100)}%`;
}

/**
 * 전체 카테고리 재분류. 미리보기(AI 가 다시 본 결과 저장) → 목록 확인·체크 해제 → 적용.
 * 진행 중에는 3초마다 상태를 불러 무료 서버가 잠들지 않게 한다.
 */
export function AdminReclassifyPanel({ onApplied }: { onApplied?: () => void }) {
  const [status, setStatus] = useState<ReclassifyStatus | null>(null);
  const [filter, setFilter] = useState<{ from?: string; to?: string }>({});
  const [items, setItems] = useState<ReclassifyItem[]>([]);
  const [total, setTotal] = useState(0);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getReclassifyStatus());
    } catch {
      setMessage('상태를 불러오지 못했습니다.');
    }
  }, []);

  const loadItems = useCallback(async (offset = 0) => {
    const data = await getReclassifyItems({ ...filter, offset, limit: PAGE });
    setTotal(data.total);
    setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
  }, [filter]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (!status?.running) return;
    const timer = window.setInterval(() => void loadStatus(), 3000);
    return () => window.clearInterval(timer);
  }, [status?.running, loadStatus]);

  useEffect(() => {
    if (status?.batchId && !status.running) void loadItems(0);
  }, [status?.batchId, status?.running, loadItems]);

  const pending = status?.counts.pending ?? 0;
  const canResume = Boolean(status?.batchId) && !status?.running && (status?.done ?? 0) < (status?.targets ?? 0);

  const handleStart = async (resume: boolean) => {
    if (!resume && !window.confirm('전체 채널을 AI 로 다시 봅니다. 실제 카테고리는 "적용"을 누르기 전까지 바뀌지 않아요. 시작할까요?')) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await startReclassify(resume);
      if (!result.started) {
        setMessage(result.reason === 'no_ai_key' ? 'AI 키가 설정되지 않았습니다.' : '이미 진행 중입니다.');
      }
      setExcluded(new Set());
      await loadStatus();
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    const count = pending - [...excluded].length;
    if (!window.confirm(`${count}개 채널의 카테고리를 바꿉니다. 적용할까요?`)) return;
    setBusy(true);
    try {
      const result = await applyReclassify([...excluded]);
      setMessage(`${result.applied}개 적용, ${result.skipped}개 건너뜀(체크 해제·그사이 수정·잠금)`);
      setExcluded(new Set());
      await loadStatus();
      await loadItems(0);
      onApplied?.();
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">전체 재분류 (AI)</CardTitle>
        <p className="text-sm text-muted-foreground">
          잠금 안 된 전체 채널을 딥시크로 다시 분류해 <b>바뀔 목록만</b> 먼저 보여줍니다. 체크를 풀면 그 채널은 빼고 적용해요.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <div className="text-sm text-subtle">
            대상 {status.targets.toLocaleString()}개
            {status.batchId && (
              <>
                {' '}· 본 채널 {status.done.toLocaleString()}개 · 바뀔 채널 {pending.toLocaleString()}개
                {status.counts.applied ? ` · 적용됨 ${status.counts.applied}개` : ''}
              </>
            )}
            {status.stopReason && <span className="ml-2 text-destructive">({status.stopReason})</span>}
          </div>
        )}
        {status?.running && (
          <div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${status.total ? (status.processed / status.total) * 100 : 0}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {status.processed.toLocaleString()} / {status.total.toLocaleString()} · AI {status.aiCalls}회 · 이 화면을 열어 두면 서버가 잠들지 않아요
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {status?.running ? (
            <Button variant="outline" onClick={() => void stopReclassify().then(loadStatus)}>중지</Button>
          ) : (
            <>
              <Button disabled={busy} onClick={() => void handleStart(false)}>미리보기 시작</Button>
              {canResume && (
                <Button variant="outline" disabled={busy} onClick={() => void handleStart(true)}>이어서 보기</Button>
              )}
              {pending > 0 && (
                <Button variant="default" disabled={busy} onClick={() => void handleApply()}>
                  적용 ({(pending - excluded.size).toLocaleString()}개)
                </Button>
              )}
            </>
          )}
        </div>
        {message && <p className="text-sm text-foreground">{message}</p>}

        {status && status.transitions.length > 0 && !status.running && (
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">바뀌는 방향 (누르면 그 목록만)</p>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFilter({})}
                className={`rounded-full px-3 py-1 text-xs ring-1 ring-border ${!filter.from && !filter.to ? 'bg-primary text-white' : 'bg-card text-subtle hover:bg-muted'}`}
              >
                전체
              </button>
              {status.transitions.map((t) => {
                const active = filter.from === t.from && filter.to === t.to;
                return (
                  <button
                    key={`${t.from}-${t.to}`}
                    type="button"
                    onClick={() => setFilter({ from: t.from, to: t.to })}
                    className={`rounded-full px-3 py-1 text-xs ring-1 ring-border ${active ? 'bg-primary text-white' : 'bg-card text-subtle hover:bg-muted'}`}
                  >
                    {t.from} → {t.to} <b>{t.count}</b>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {items.length > 0 && !status?.running && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="w-10 px-2 px-2 py-2">적용</th>
                  <th className="px-2 py-2">채널</th>
                  <th className="px-2 py-2 text-right">회원</th>
                  <th className="px-2 py-2">바뀜</th>
                  <th className="px-2 py-2 text-right">확신</th>
                  <th className="px-2 py-2">AI 이유</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-2 py-2">
                      {item.status === 'pending' ? (
                        <input type="checkbox" checked={!excluded.has(item.id)} onChange={() => toggle(item.id)} />
                      ) : (
                        <Badge variant="secondary">{item.status === 'applied' ? '적용됨' : '건너뜀'}</Badge>
                      )}
                    </td>
                    <td className="max-w-[260px] px-2 py-2">
                      <div className="truncate font-medium text-foreground">{item.title}</div>
                      {item.username && <div className="truncate text-xs text-muted-foreground">@{item.username}</div>}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-subtle">{item.memberCount?.toLocaleString() ?? '-'}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      <span className="text-muted-foreground">{item.before}</span> → <b className="text-primary">{item.after}</b>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-subtle">{pct(item.confidence)}</td>
                    <td className="max-w-[240px] truncate px-2 py-2 text-xs text-muted-foreground" title={item.reason ?? ''}>
                      {item.source === 'ai' ? item.reason : `키워드 (${item.reason ?? ''})`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length < total && (
              <Button variant="outline" className="mt-3" onClick={() => void loadItems(items.length)}>
                더 보기 ({items.length} / {total})
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
