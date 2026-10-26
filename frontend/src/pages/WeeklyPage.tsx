import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getWeeklyStats } from '../api/stats';
import type { WeeklyStats, WeeklyStatsEvent } from '../types/stats';
import {
  formatIsoWeek,
  formatKstYmd,
  isoWeekFromYmd,
  shiftIsoWeek,
} from '../utils/isoWeek';
import { channelDetailPath } from '../utils/channelDetailPath';
import { ChannelQuickActions } from '../components/ChannelQuickActions';

const EVENT_TITLE: Record<string, string> = {
  title_changed: '제목 변경',
  username_changed: '아이디 변경',
  first_seen: '새로 관측',
  rank_up: '순위 상승',
};

export function WeeklyPage() {
  const [params, setParams] = useSearchParams();
  const week = params.get('week') ?? undefined;
  const [data, setData] = useState<WeeklyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void getWeeklyStats(week)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        if (!week) {
          setParams({ week: result.week }, { replace: true });
        }
      })
      .catch(() => {
        if (!cancelled) setError('주간 기록을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [week, setParams]);

  const thisWeekParts = isoWeekFromYmd(formatKstYmd());
  const thisWeekLabel = formatIsoWeek(thisWeekParts.year, thisWeekParts.week);
  const displayedWeek = data?.week ?? week;
  const canGoNext = Boolean(displayedWeek) && displayedWeek !== thisWeekLabel;

  const go = (delta: number) => {
    const current = displayedWeek;
    if (!current) return;
    if (delta > 0 && !canGoNext) return;
    const next = new URLSearchParams(params);
    next.set('week', shiftIsoWeek(current, delta));
    setParams(next);
  };

  const goThisWeek = () => {
    const next = new URLSearchParams(params);
    next.set('week', thisWeekLabel);
    setParams(next);
  };

  return (
    <div className="px-4 pb-8 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-tg-text">주간 변화</h1>
        <Link to="/ranking" className="text-[13px] font-semibold text-tg-open-text">
          랭킹
        </Link>
      </div>
      <p className="mt-2 rounded-xl bg-tg-secondary px-3 py-2 text-[12px] leading-snug text-tg-hint">
        관측된 기록이며 판정이 아닙니다.
      </p>

      <div className="mt-4 flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} className="rounded-full bg-tg-secondary px-3 py-1.5 text-[13px] font-semibold">
          이전
        </button>
        <div className="text-center">
          <p className="text-[15px] font-bold text-tg-text">{data?.week ?? week ?? '—'}</p>
          {data && (
            <p className="text-[11px] text-tg-hint">
              {data.start} ~ {data.end}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!canGoNext}
          className="rounded-full bg-tg-secondary px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          다음
        </button>
      </div>
      <div className="mt-2 flex justify-center">
        <button
          type="button"
          onClick={goThisWeek}
          className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
            displayedWeek === thisWeekLabel
              ? 'bg-tg-open-bg text-tg-open-text'
              : 'bg-tg-secondary text-tg-hint'
          }`}
        >
          이번 주
        </button>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-tg-secondary" />
          ))}
        </div>
      ) : error ? (
        <p className="mt-8 text-center text-sm text-tg-hint">{error}</p>
      ) : data ? (
        <div className="mt-4 space-y-4">
          <WeeklySection title="이름·아이디 변경" count={data.counts.titleChanged + data.counts.usernameChanged} items={[...data.titleChanged, ...data.usernameChanged]} />
          <WeeklySection title="새로 관측" count={data.counts.firstSeen} items={data.firstSeen} />
          <WeeklySection title="순위 상승" count={data.counts.rankUp} items={data.rankUp} />
        </div>
      ) : null}
    </div>
  );
}

function WeeklySection({
  title,
  count,
  items,
}: {
  title: string;
  count: number;
  items: WeeklyStatsEvent[];
}) {
  const sorted = [...items].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return (
    <section className="rounded-2xl bg-tg-secondary/70 p-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold text-tg-text">{title}</h2>
        <span className="text-[13px] font-bold text-tg-link">{count}</span>
      </div>
      {sorted.length === 0 ? (
        <p className="mt-2 text-[13px] text-tg-hint">해당 주 기록이 없습니다.</p>
      ) : (
        <ul className="mt-2 divide-y divide-black/[0.06]">
          {sorted.map((item) => {
            const handle = item.username?.replace(/^@/, '');
            const path = channelDetailPath({
              id: item.channelId,
              username: item.username,
            });
            const inner = (
              <>
                <p className="truncate text-[14px] font-medium text-tg-text">
                  {item.channelTitle ?? handle ?? item.channelId}
                </p>
                <p className="text-[12px] text-tg-hint">
                  {EVENT_TITLE[item.type] ?? item.type}
                  {item.before || item.after ? ` · ${item.before ?? '—'} → ${item.after ?? '—'}` : ''}
                </p>
              </>
            );
            return (
              <li key={item.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  {path ? (
                    <Link to={path} className="block">
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </div>
                {handle && (
                  <ChannelQuickActions
                    channelId={item.channelId}
                    link={`https://t.me/${handle}`}
                    title={item.channelTitle ?? handle}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
