import { useEffect, useState } from 'react';
import { getChannelOpenSummary, type ChannelOpenSummary } from '../../api/admin';

/** 채널 관리 행을 펼쳤을 때 보이는 텔레그램 이동 수(어드민 전용) */
export function AdminChannelOpens({ channelId }: { channelId: string }) {
  const [summary, setSummary] = useState<ChannelOpenSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getChannelOpenSummary(channelId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [channelId]);

  if (failed) {
    return <p className="text-[11px] text-muted-foreground">텔레그램 이동 수를 불러오지 못했습니다.</p>;
  }
  if (!summary) {
    return <p className="text-[11px] text-muted-foreground">텔레그램 이동 수 불러오는 중…</p>;
  }

  const max = Math.max(1, ...summary.daily.map((row) => row.count));
  return (
    <div className="space-y-1.5 rounded-xl bg-card px-3 py-2 ring-1 ring-border">
      <p className="text-xs text-subtle">
        텔레그램 이동 · 오늘 <b className="tabular-nums">{summary.today}</b> · 7일{' '}
        <b className="tabular-nums">{summary.last7d}</b> · 30일{' '}
        <b className="tabular-nums">{summary.last30d}</b>
      </p>
      <div className="flex h-8 items-end gap-px" aria-hidden>
        {summary.daily.map((row) => (
          <div
            key={row.date}
            title={`${row.date} · ${row.count}`}
            className="flex-1 rounded-sm bg-primary/40"
            style={{ height: `${Math.max(row.count > 0 ? 10 : 3, (row.count / max) * 100)}%`, opacity: row.count > 0 ? 1 : 0.35 }}
          />
        ))}
      </div>
    </div>
  );
}
