import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TonPaymentRecord } from '../../types/tonPayment';
import {
  deleteTonPayment,
  exportTonPaymentsCsv,
  getTonPayments,
} from '../../utils/tonPaymentHistory';

export function AdminTonPaymentsPage() {
  const [records, setRecords] = useState<TonPaymentRecord[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    setRecords(getTonPayments());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((item) =>
      [
        item.channelTitle,
        item.channelLink,
        item.wallet,
        item.reporterName,
        item.telegramId != null ? String(item.telegramId) : '',
        item.memo,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [query, records]);

  const totalAmount = useMemo(
    () => filtered.reduce((sum, item) => sum + item.amount, 0),
    [filtered],
  );

  const handleExport = () => {
    if (filtered.length === 0) {
      setMessage('보낼 이력이 없습니다.');
      return;
    }
    exportTonPaymentsCsv(filtered);
    setMessage(`${filtered.length}건 CSV로 저장했습니다.`);
  };

  const handleDelete = (id: string) => {
    if (!window.confirm('이 지급 이력을 삭제할까요?')) return;
    deleteTonPayment(id);
    load();
    setMessage('이력을 삭제했습니다.');
  };

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">TON 지급 이력</h2>
            <p className="mt-1 text-sm text-slate-500">
              {filtered.length}건 · 합계 {totalAmount.toLocaleString('ko-KR')} TON
            </p>
          </div>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            CSV 저장 (엑셀)
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          데모 버전: 이 브라우저에만 저장됩니다. 정기적으로 CSV로 백업해 주세요. (추후 DB 연동 예정)
        </div>

        {message && (
          <div className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-black/5">
            {message}
          </div>
        )}

        <div className="mb-4">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="채널명, 지갑, Telegram ID, 제보자 검색"
            className="w-full max-w-md rounded-xl bg-white px-4 py-3 text-sm shadow-sm ring-1 ring-black/5 outline-none focus:ring-blue-300"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm ring-1 ring-black/5">
            저장된 TON 지급 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-black/5 bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">지급일시</th>
                  <th className="px-4 py-3 font-medium">금액</th>
                  <th className="px-4 py-3 font-medium">제보자</th>
                  <th className="px-4 py-3 font-medium">수신 지갑</th>
                  <th className="px-4 py-3 font-medium">채널/그룹</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr key={item.id} className="border-b border-black/5 last:border-0">
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(item.paidAt).toLocaleString('ko-KR')}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {item.amount.toLocaleString('ko-KR')} TON
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.reporterName ?? '-'}</p>
                      <p className="text-xs text-slate-500">{item.telegramId ?? '-'}</p>
                    </td>
                    <td className="max-w-[180px] px-4 py-3">
                      <span className="break-all font-mono text-xs text-slate-600">{item.wallet}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.channelTitle}</p>
                      <a
                        href={item.channelLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        링크 열기
                      </a>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        삭제
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
