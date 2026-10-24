import { useCallback, useEffect, useState } from 'react';
import {
  confirmAdminPayoutRecord,
  failAdminPayoutRecord,
  getAdminPayoutRecords,
  voidAdminPayoutRecord,
  type AdminPayoutRecord,
} from '../../../api/admin';
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
import { adminApiErrorMessage } from '../../../utils/adminApiError';
import { formatPayoutAmount, payoutStatusLabel } from '../../../utils/payoutDisplay';

function toCsv(rows: AdminPayoutRecord[]): string {
  const header = [
    'id',
    'channel',
    'telegramId',
    'username',
    'currency',
    'amount',
    'sendMethod',
    'status',
    'txOrMemo',
    'createdAt',
  ];
  const lines = rows.map((row) =>
    [
      row.id,
      row.channelTitle ?? row.channelId,
      row.telegramId ?? '',
      row.username ?? '',
      row.currency,
      formatPayoutAmount(row.currency, row.amount),
      row.sendMethod,
      row.status,
      row.txOrMemo ?? '',
      row.createdAt,
    ]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(','),
  );
  return [header.join(','), ...lines].join('\n');
}

export function PendingLedgerTab() {
  const [rows, setRows] = useState<AdminPayoutRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [currency, setCurrency] = useState('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [txDraft, setTxDraft] = useState<Record<string, string>>({});
  const [voidDraft, setVoidDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminPayoutRecords({
        status: status || undefined,
        currency: currency || undefined,
        q: q.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
      });
      setRows(data);
      setMessage('');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '지급 이력을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, [status, currency, q, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `newlink-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirm = async (row: AdminPayoutRecord) => {
    const memo = (txDraft[row.id] ?? '').trim();
    if (!memo) {
      setMessage('TX 또는 메모를 입력해 주세요.');
      return;
    }
    try {
      await confirmAdminPayoutRecord(row.id, memo);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '확정에 실패했습니다.'));
    }
  };

  const handleFail = async (row: AdminPayoutRecord) => {
    try {
      await failAdminPayoutRecord(row.id, '실패 처리');
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '실패 처리에 실패했습니다.'));
    }
  };

  const handleVoid = async (row: AdminPayoutRecord) => {
    const reason = (voidDraft[row.id] ?? '').trim();
    if (!reason) {
      setMessage('취소 이유를 입력해 주세요.');
      return;
    }
    try {
      await voidAdminPayoutRecord(row.id, reason);
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '취소에 실패했습니다.'));
    }
  };

  return (
    <div className="space-y-4">
      {message && <p className="text-sm text-foreground">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">상태 전체</option>
          <option value="sending">확인 필요</option>
          <option value="paid">지급 완료</option>
          <option value="failed">실패</option>
          <option value="void">취소</option>
        </select>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          <option value="">수단 전체</option>
          <option value="TON">TON</option>
          <option value="USDT">USDT</option>
          <option value="STARS">Stars</option>
        </select>
        <Input
          type="date"
          className="w-40"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <Input type="date" className="w-40" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input
          className="min-w-[12rem] flex-1"
          placeholder="제보·아이디·TX 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="button" variant="outline" onClick={exportCsv}>
          CSV 내보내기
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">지급 이력이 없습니다.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>상태</TableHead>
              <TableHead>채널</TableHead>
              <TableHead>회원</TableHead>
              <TableHead>수단</TableHead>
              <TableHead>금액</TableHead>
              <TableHead>TX/메모</TableHead>
              <TableHead>처리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                className={row.status === 'sending' ? 'bg-accent' : undefined}
              >
                <TableCell>
                  <Badge variant={row.status === 'sending' ? 'default' : 'secondary'}>
                    {payoutStatusLabel(row.status)}
                  </Badge>
                </TableCell>
                <TableCell>{row.channelTitle ?? row.channelId}</TableCell>
                <TableCell className="text-xs">
                  {row.telegramId ?? '-'}
                  <br />
                  {row.username ?? ''}
                </TableCell>
                <TableCell>
                  {row.currency} · {row.sendMethod}
                </TableCell>
                <TableCell>
                  {formatPayoutAmount(row.currency, row.amount)}
                  {row.currency === 'STARS' ? ' ⭐' : ` ${row.currency}`}
                </TableCell>
                <TableCell className="max-w-[12rem] break-all text-xs">
                  {row.txOrMemo ?? row.voidOrFailReason ?? '-'}
                </TableCell>
                <TableCell className="space-y-2">
                  {row.status === 'sending' && (
                    <div className="flex flex-wrap gap-1">
                      <Input
                        className="h-8 w-36"
                        placeholder="TX"
                        value={txDraft[row.id] ?? ''}
                        onChange={(e) =>
                          setTxDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                      />
                      <Button type="button" size="sm" onClick={() => void handleConfirm(row)}>
                        지급 완료로 확정
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void handleFail(row)}
                      >
                        실패 처리
                      </Button>
                    </div>
                  )}
                  {row.status !== 'void' && (
                    <div className="flex flex-wrap gap-1">
                      <Input
                        className="h-8 w-36"
                        placeholder="취소 이유"
                        value={voidDraft[row.id] ?? ''}
                        onChange={(e) =>
                          setVoidDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleVoid(row)}
                      >
                        취소
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
