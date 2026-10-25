import { useCallback, useEffect, useState } from 'react';
import { getOpenRanking, type AnalyticsRange, type OpenRanking } from '../../api/admin';
import { adminApiErrorMessage } from '../../utils/adminApiError';
import { channelDetailPath } from '../../utils/channelDetailPath';

const RANGES: Array<{ id: AnalyticsRange; label: string }> = [
  { id: 'today', label: '오늘' },
  { id: '7d', label: '7일' },
  { id: '30d', label: '30일' },
];

export function AdminOpensPage() {
  const [range, setRange] = useState<AnalyticsRange>('today');
  const [data, setData] = useState<OpenRanking | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const load = useCallback(async (nextRange: AnalyticsRange) => {
    try {
      setData(await getOpenRanking(nextRange));
      setMessage('');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '이동 순위를 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  return (
    <>
      <header className="px-4 pt-1 pb-4 md:px-7">
        <p className="mt-1 text-sm text-slate-500">
          &quot;텔레그램에서 열기&quot;를 누른 횟수입니다. 같은 사람이 같은 채널을 1시간 안에 다시 누르면 세지 않고,
          봇·관리자는 제외합니다. 이 숫자는 관리자에게만 보입니다.
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
        ) : data.items.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm ring-1 ring-black/5">
            아직 기록이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/5 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="w-14 px-4 py-3 font-medium">순위</th>
                  <th className="px-4 py-3 font-medium">채널·그룹</th>
                  <th className="px-4 py-3 font-medium">카테고리</th>
                  <th className="px-4 py-3 text-right font-medium">이동 수</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row, index) => {
                  const path = channelDetailPath({ id: row.channelId, username: null, link: row.link });
                  return (
                    <tr key={row.channelId} className="border-b border-black/5 last:border-0">
                      <td className="px-4 py-3 tabular-nums text-slate-500">{index + 1}</td>
                      <td className="max-w-[320px] px-4 py-3">
                        {path ? (
                          <a href={path} className="block truncate font-medium text-blue-700 hover:underline">
                            {row.title}
                          </a>
                        ) : (
                          <span className="block truncate font-medium text-slate-900">{row.title}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{row.category}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                        {row.opens.toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
