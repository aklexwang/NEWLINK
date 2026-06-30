import type { CreateTonPaymentInput, TonPaymentRecord } from '../types/tonPayment';

const STORAGE_KEY = 'newlink_ton_payment_history';

function readAll(): TonPaymentRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TonPaymentRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: TonPaymentRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function getTonPayments(): TonPaymentRecord[] {
  return readAll().sort((a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
}

export function recordTonPayment(input: CreateTonPaymentInput): TonPaymentRecord {
  const record: TonPaymentRecord = {
    id: crypto.randomUUID(),
    paidAt: new Date().toISOString(),
    amount: input.amount,
    wallet: input.wallet,
    telegramId: input.telegramId,
    reporterName: input.reporterName,
    channelId: input.channelId,
    channelTitle: input.channelTitle,
    channelLink: input.channelLink,
    memo: input.memo ?? null,
  };

  writeAll([record, ...readAll()]);
  return record;
}

export function deleteTonPayment(id: string): void {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function exportTonPaymentsCsv(records: TonPaymentRecord[]): void {
  const headers = [
    '지급일시',
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

  const rows = records.map((item) =>
    [
      new Date(item.paidAt).toLocaleString('ko-KR'),
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
  const stamp = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = `newlink-ton-payments-${stamp}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
