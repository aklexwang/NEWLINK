import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { searchChannels } from '../api/channels';
import { getCompareStats } from '../api/stats';
import { GradeBadge } from '../components/GradeBadge';
import { toastMessage } from '../providers/ToastProvider';
import type { Channel } from '../types/channel';
import type { CompareStatsItem } from '../types/stats';
import { extractTelegramUsername } from '../utils/channelAvatar';
import { addCompareId, COMPARE_MAX, getCompareIds, removeCompareId } from '../utils/compareChannels';
import { formatCount, formatPercent, formatSignedPercent } from '../utils/formatCount';

const LINE_COLORS = ['#2481cc', '#059669', '#d97706'];

export function ComparePage() {
  const [items, setItems] = useState<CompareStatsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Channel[]>([]);
  const [searching, setSearching] = useState(false);

  const reload = useCallback(async (nextIds: string[]) => {
    if (nextIds.length === 0) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const result = await getCompareStats(nextIds);
      setItems(result.items);
    } catch {
      toastMessage('비교 데이터를 불러오지 못했습니다.', 'error');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload(getCompareIds());
  }, [reload]);

  useEffect(() => {
    const keyword = query.trim();
    if (!keyword) {
      setHits([]);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void searchChannels({ q: keyword })
        .then((result) => setHits(result.items.slice(0, 8)))
        .catch(() => setHits([]))
        .finally(() => setSearching(false));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [query]);

  const chartData = useMemo(() => {
    const dates = new Set<string>();
    for (const item of items) {
      for (const point of item.stats) dates.add(point.date);
    }
    const sorted = [...dates].sort();
    return sorted.map((date) => {
      const row: Record<string, string | number | null> = { date: date.slice(5) };
      for (const item of items) {
        const point = item.stats.find((p) => p.date === date);
        row[item.id] = point?.memberCount ?? null;
      }
      return row;
    });
  }, [items]);

  const handleAdd = (channel: Channel) => {
    const result = addCompareId(channel.id);
    toastMessage(result.message, result.added ? 'success' : 'info');
    if (result.added) {
      setQuery('');
      setHits([]);
      void reload(result.ids);
    }
  };

  const handleRemove = (id: string) => {
    const next = removeCompareId(id);
    void reload(next);
  };

  const rows: { label: string; render: (item: CompareStatsItem) => string }[] = [
    { label: '구독자', render: (item) => formatCount(item.memberCount) },
    { label: '점수', render: (item) => (item.score == null ? '—' : String(item.score)) },
    { label: '조회율', render: (item) => formatPercent(item.viewRate) },
    { label: '7일 성장', render: (item) => formatSignedPercent(item.growth7d) },
  ];

  return (
    <div className="px-4 pb-10 pt-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-tg-text">비교</h1>
        <Link to="/ranking" className="text-[13px] font-semibold text-tg-open-text">
          랭킹
        </Link>
      </div>
      <p className="mt-1 text-[12px] text-tg-hint">최대 {COMPARE_MAX}개 채널을 같은 기준으로 나란히 봅니다.</p>

      <div className="relative mt-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="채널 검색해서 추가"
          className="w-full rounded-2xl bg-tg-secondary px-4 py-2.5 text-sm outline-none"
        />
        {(searching || hits.length > 0) && query.trim() && (
          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-2xl border border-black/10 bg-white shadow-lg">
            {searching && hits.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-tg-hint">검색 중...</li>
            ) : hits.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-tg-hint">결과가 없습니다.</li>
            ) : (
              hits.map((channel) => (
                <li key={channel.id}>
                  <button
                    type="button"
                    onClick={() => handleAdd(channel)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[13px] active:bg-tg-secondary"
                  >
                    <span className="truncate font-medium text-tg-text">{channel.title}</span>
                    <span className="ml-2 shrink-0 text-tg-hint">
                      @{extractTelegramUsername(channel.link) ?? '초대링크'}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-40 animate-pulse rounded-2xl bg-tg-secondary" />
      ) : items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-tg-hint">비교할 채널이 없습니다. 검색으로 추가해 주세요.</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-2xl bg-tg-secondary/60">
            <table className="w-full min-w-[320px] text-left text-[12px]">
              <thead>
                <tr>
                  <th className="px-2 py-2 font-medium text-tg-hint">항목</th>
                  {items.map((item, index) => {
                    const handle = item.username?.replace(/^@/, '');
                    return (
                      <th key={item.id} className="px-2 py-2">
                        <div className="flex items-start justify-between gap-1">
                          {handle ? (
                            <Link to={`/c/${handle}`} className="font-semibold text-tg-text">
                              {item.title}
                            </Link>
                          ) : (
                            <span className="font-semibold text-tg-text">{item.title}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemove(item.id)}
                            className="text-[11px] text-tg-hint"
                            aria-label="비교에서 제거"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1">
                          <GradeBadge grade={item.grade} size="sm" />
                          <span className="h-2 w-2 rounded-full" style={{ background: LINE_COLORS[index] }} />
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} className="border-t border-black/[0.06]">
                    <td className="px-2 py-2 text-tg-hint">{row.label}</td>
                    {items.map((item) => (
                      <td key={item.id} className="px-2 py-2 font-semibold text-tg-text">
                        {row.render(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 className="mt-5 text-[15px] font-semibold text-tg-text">30일 구독자 추이</h2>
          <div className="mt-2 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} width={48} />
                <Tooltip />
                <Legend />
                {items.map((item, index) => (
                  <Line
                    key={item.id}
                    type="monotone"
                    dataKey={item.id}
                    name={item.title}
                    stroke={LINE_COLORS[index]}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
