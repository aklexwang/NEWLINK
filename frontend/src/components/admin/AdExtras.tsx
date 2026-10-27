import { useEffect, useState } from 'react';
import { getAdminUsers } from '../../api/admin';
import { getAdDaily, type AdDailyRow } from '../../api/ads';

const selectClass =
  'mt-1.5 h-11 w-full rounded-xl bg-background px-3.5 text-[15px] text-foreground ring-1 ring-border outline-none focus:ring-2 focus:ring-primary/50';

type Option = { telegramId: number; label: string };

let cache: Option[] | null = null;

/** 광고 입력칸: 이 광고를 낸 광고회원 고르기 */
export function AdvertiserPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [options, setOptions] = useState<Option[]>(cache ?? []);

  useEffect(() => {
    if (cache) return;
    getAdminUsers()
      .then((users) => {
        cache = users
          .filter((u) => u.isAdvertiser)
          .map((u) => ({
            telegramId: u.telegramId,
            label: u.username ? `@${u.username}${u.firstName ? ` (${u.firstName})` : ''}` : u.firstName || String(u.telegramId),
          }));
        setOptions(cache);
      })
      .catch(() => setOptions([]));
  }, []);

  return (
    <label className="block text-sm font-medium text-subtle">
      광고회원
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        <option value="">연결 안 함</option>
        {options.map((o) => (
          <option key={o.telegramId} value={String(o.telegramId)}>
            {o.label}
          </option>
        ))}
        {value && !options.some((o) => String(o.telegramId) === value) && (
          <option value={value}>회원 {value}</option>
        )}
      </select>
      <span className="mt-1 block text-xs text-muted-foreground">
        목록에 없으면 회원 관리에서 [광고회원으로]를 먼저 눌러 주세요.
      </span>
    </label>
  );
}

function pct(clicks: number, impressions: number): string {
  if (impressions <= 0) return '-';
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
}

/** 목록 한 줄: 노출 · 클릭 · 클릭률 */
export function AdPerfLine({ impressions, clicks }: { impressions: number; clicks: number }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs">
      <span className="rounded-full bg-sky-100 px-2.5 py-0.5 font-semibold text-sky-800">👀 노출 {impressions.toLocaleString()}</span>
      <span className="rounded-full bg-violet-100 px-2.5 py-0.5 font-semibold text-violet-800">👆 클릭 {clicks.toLocaleString()}</span>
      <span className="rounded-full bg-muted px-2.5 py-0.5 font-semibold text-subtle">클릭률 {pct(clicks, impressions)}</span>
    </span>
  );
}

/** [📈 성과] 를 누르면 최근 14일 날짜별 노출·클릭 막대 */
export function AdPerfPanel({ kind, id }: { kind: 'banner' | 'rank'; id: string }) {
  const [rows, setRows] = useState<AdDailyRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    getAdDaily(kind, id)
      .then((data) => {
        if (alive) setRows(data);
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, [kind, id]);

  if (error) return <p className="text-sm text-destructive">성과를 불러오지 못했어요.</p>;
  if (!rows) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;

  const maxImp = Math.max(1, ...rows.map((r) => r.impressions));
  const totalImp = rows.reduce((a, r) => a + r.impressions, 0);
  const totalClk = rows.reduce((a, r) => a + r.clicks, 0);

  return (
    <div className="rounded-xl bg-background p-4 ring-1 ring-border">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-bold text-foreground">📈 최근 14일 성과</p>
        <AdPerfLine impressions={totalImp} clicks={totalClk} />
      </div>
      <div className="mt-4 flex h-32 items-end gap-1.5">
        {rows.map((r) => (
          <div key={r.day} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${r.day} · 노출 ${r.impressions} · 클릭 ${r.clicks}`}>
            {r.clicks > 0 && <span className="text-[10px] font-bold text-violet-600">{r.clicks}</span>}
            <div
              className="w-full rounded-t-md bg-sky-400/80"
              style={{ height: `${Math.max(2, (r.impressions / maxImp) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">
        {rows.map((r, i) => (
          <span key={r.day} className="flex-1 text-center text-[10px] text-muted-foreground">
            {i % 2 === 0 ? r.day.slice(5).replace('-', '/') : ''}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">파란 막대 = 노출, 보라 숫자 = 그날 클릭. 같은 사람의 같은 광고 노출은 하루 한 번만 세요.</p>
    </div>
  );
}
