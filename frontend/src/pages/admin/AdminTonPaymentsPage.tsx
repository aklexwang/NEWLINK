import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  deleteTonPaymentRecord,
  getTonPaymentHistory,
  recordReporterReward,
} from '../../api/admin';
import type { TonPaymentRecord } from '../../types/tonPayment';

export function AdminTonPaymentsPage() {
  const [records, setRecords] = useState<TonPaymentRecord[]>([]);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await getTonPaymentHistory();
      setRecords(
        items.map((item) => ({
          ...item,
          paidAt: typeof item.paidAt === 'string' ? item.paidAt : new Date(item.paidAt).toISOString(),
        })),
      );
      setMessage('');
    } catch {
      setMessage('TON 지급 이력을 불러오지 못했습니다. 백엔드 연결을 확인해 주세요.');
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
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
    const headers = [
      '지급일시',
      '방식',
      '금액(TON)',
      '수신 지갑',
      'Telegram ID',
      '제보자',
      '채널/그룹',
      '링크',
      '채널 ID',
      '메모',
    ];
    const escapeCell = (value: string | number | null | undefined) => {
      const text = value == null ? '' : String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = filtered.map((item) =>
      [
        new Date(item.paidAt).toLocaleString('ko-KR'),
        item.method === 'external' ? '외부 지갑' : 'Wallet',
        item.amount,
        item.wallet,
        item.telegramId,
        item.reporterName,
        item.channelTitle,
        item.channelLink,
        item.channelId,
        item.memo,
      ]
        .map(escapeCell)
        .join(','),
    );
    const csv = `\uFEFF${headers.join(',')}\n${rows.join('\n')}`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `newlink-ton-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMessage(`${filtered.length}건 CSV로 저장했습니다.`);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 지급 이력을 삭제할까요?')) return;
    try {
      await deleteTonPaymentRecord(id);
      await load();
      setMessage('이력을 삭제했습니다.');
    } catch {
      setMessage('이력 삭제에 실패했습니다.');
    }
  };

  const handleSyncToMember = async (item: TonPaymentRecord) => {
    if (!item.channelId) {
      setMessage('채널 ID가 없어 회원 MY에 반영할 수 없습니다.');
      return;
    }
    setSyncingId(item.id);
    setMessage('');
    try {
      await recordReporterReward(item.channelId, {
        amountTon: item.amount,
        wallet: item.wallet,
        method: item.method ?? 'external',
        memo: item.memo ?? undefined,
      });
      setMessage(`「${item.channelTitle}」보상을 회원 MY에 다시 반영했습니다.`);
      await load();
    } catch {
      setMessage(`회원 MY 반영 실패: 「${item.channelTitle}」— 채널 ID를 확인해 주세요.`);
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <>
      <header className="border-b border-black/5 bg-white px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">TON 지급 이력</h2>
            <p className="mt-1 text-sm text-slate-500">
              {filtered.length}건 · 합계 {totalAmount.toLocaleString('ko-KR')} TON (서버 DB 저장)
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
        <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          보상 기록(Wallet/외부 송금) 시 서버에 저장됩니다. 다른 PC·브라우저에서도 같은 이력을 볼 수
          있습니다.
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

        {loading ? (
          <div className="h-32 animate-pulse rounded-2xl bg-white shadow-sm" />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm ring-1 ring-black/5">
            저장된 TON 지급 이력이 없습니다.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="border-b border-black/5 bg-slate-50 text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">지급일시</th>
                    <th className="px-4 py-3 font-medium">방식</th>
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
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            item.method === 'external'
                              ? 'bg-violet-50 text-violet-700'
                              : 'bg-sky-50 text-sky-700'
                          }`}
                        >
                          {item.method === 'external' ? '외부 지갑' : 'Wallet'}
                        </span>
                        {item.memo && (
                          <p
                            className="mt-1 max-w-[120px] truncate text-[11px] text-slate-400"
                            title={item.memo}
                          >
                            {item.memo}
                          </p>
                        )}
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
                      <td className="space-x-2 px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={syncingId === item.id}
                          onClick={() => void handleSyncToMember(item)}
                          className="text-xs font-medium text-blue-600 hover:underline disabled:opacity-50"
                        >
                          {syncingId === item.id ? '반영 중…' : '회원 MY 재반영'}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item.id)}
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
          </div>
        )}
      </div>
    </>
  );
}
