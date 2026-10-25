import { useCallback, useEffect, useState } from 'react';
import {
  createDiscoveryKeyword,
  getSearchInsights,
  type AnalyticsRange,
  type SearchInsightRow,
  type SearchInsights,
} from '../../api/admin';
import { adminApiErrorMessage } from '../../utils/adminApiError';

const RANGES: Array<{ id: AnalyticsRange; label: string }> = [
  { id: 'today', label: '오늘' },
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
];

function InsightTable({
  title,
  hint,
  rows,
  countOf,
  countLabel,
  action,
}: {
  title: string;
  hint: string;
  rows: SearchInsightRow[];
  countOf: (row: SearchInsightRow) => number;
  countLabel: string;
  action?: (row: SearchInsightRow) => React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="border-b border-black/5 px-4 py-3">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">데이터가 없습니다.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/5 bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">검색어</th>
              <th className="px-4 py-2 text-right font-medium">{countLabel}</th>
              {action && <th className="px-4 py-2 font-medium" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.query} className="border-b border-black/5 last:border-0">
                <td className="max-w-[260px] truncate px-4 py-2 text-slate-900">{row.sample}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                  {countOf(row).toLocaleString('ko-KR')}
                </td>
                {action && <td className="px-4 py-2 text-right">{action(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function AdminSearchInsightsPage() {
  const [range, setRange] = useState<AnalyticsRange>('today');
  const [data, setData] = useState<SearchInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [addingQuery, setAddingQuery] = useState<string | null>(null);
  const [addedQueries, setAddedQueries] = useState<Set<string>>(new Set());

  const load = useCallback(async (nextRange: AnalyticsRange) => {
    try {
      setData(await getSearchInsights(nextRange));
      setMessage('');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '검색 인사이트를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const handleAddKeyword = async (row: SearchInsightRow) => {
    setAddingQuery(row.query);
    try {
      await createDiscoveryKeyword({ word: row.sample });
      setAddedQueries((prev) => new Set(prev).add(row.query));
      setMessage(`"${row.sample}" 을(를) 발견 키워드로 추가했습니다.`);
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '발견 키워드로 추가하지 못했습니다.'));
    } finally {
      setAddingQuery(null);
    }
  };

  return (
    <>
      <header className="px-4 pt-1 pb-4 md:px-7">
        <p className="mt-1 text-sm text-slate-500">
          회원이 확정한 검색만 집계합니다(입력 중 자동완성 제외, 관리자·봇 제외). 회원 ID·IP 는 저장하지 않습니다.
        </p>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center gap-2">
          {RANGES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setLoading(true);
                setRange(item.id);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ring-1 ${
                range === item.id
                  ? 'bg-slate-900 text-white ring-slate-900'
                  : 'bg-white text-slate-700 ring-black/10 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
          {data && (
            <span className="ml-2 text-xs text-slate-500">
              {data.from === data.to ? data.from : `${data.from} ~ ${data.to}`} (KST)
            </span>
          )}
        </div>

        {message && (
          <div className="rounded-xl bg-white px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-black/5">
            {message}
          </div>
        )}

        {loading || !data ? (
          <div className="h-40 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: '전체 검색', value: data.totals.searchCount },
                { label: '결과 0건', value: data.totals.zeroCount },
                { label: '금지어로 막힘', value: data.totals.blockedCount },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">
                    {card.value.toLocaleString('ko-KR')}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <InsightTable
                title="인기 검색어"
                hint="막힌 검색은 제외한 검색 횟수 순"
                rows={data.popular}
                countOf={(row) => row.searchCount - row.blockedCount}
                countLabel="횟수"
              />
              <InsightTable
                title="결과 0건 검색어"
                hint="찾는 사람은 있는데 채널이 없는 검색어"
                rows={data.zero}
                countOf={(row) => row.zeroCount}
                countLabel="0건 횟수"
                action={(row) =>
                  addedQueries.has(row.query) ? (
                    <span className="text-xs text-emerald-600">추가됨</span>
                  ) : (
                    <button
                      type="button"
                      disabled={addingQuery === row.query}
                      onClick={() => void handleAddKeyword(row)}
                      className="whitespace-nowrap rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-100 hover:bg-blue-100 disabled:opacity-50"
                    >
                      {addingQuery === row.query ? '추가 중...' : '발견 키워드로 추가'}
                    </button>
                  )
                }
              />
              <InsightTable
                title="막힌 검색어"
                hint="금지어에 걸려 결과가 나가지 않은 검색어"
                rows={data.blocked}
                countOf={(row) => row.blockedCount}
                countLabel="막힌 횟수"
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}
