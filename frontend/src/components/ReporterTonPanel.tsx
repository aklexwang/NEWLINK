import { useState } from 'react';
import type { PendingChannel } from '../types/channel';

interface ReporterTonPanelProps {
  item: PendingChannel;
}

export function ReporterTonPanel({ item }: ReporterTonPanelProps) {
  const [amount, setAmount] = useState('1');
  const reporter = item.reporter;
  const telegramId = reporter?.telegramId ?? item.submittedBy;
  const wallet = reporter?.tonWalletAddress ?? '';

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      window.alert(`${label} 복사됨`);
    } catch {
      window.alert('복사에 실패했습니다.');
    }
  };

  const openTonTransfer = () => {
    if (!wallet) {
      window.alert('제보자 TON 지갑이 등록되지 않았습니다.');
      return;
    }
    const tonAmount = amount.trim() || '1';
    const url = `https://app.tonkeeper.com/transfer/${encodeURIComponent(wallet)}?amount=${encodeURIComponent(tonAmount)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
      <h3 className="text-xs font-semibold text-tg-text">제보자 정보 · TON 지급</h3>
      <div className="mt-2 space-y-1 text-xs text-tg-hint">
        <p>
          Telegram ID: <span className="font-medium text-tg-text">{telegramId ?? '알 수 없음'}</span>
          {telegramId && (
            <button type="button" onClick={() => copyText(String(telegramId), 'Telegram ID')} className="ml-2 text-tg-link">복사</button>
          )}
        </p>
        <p>
          사용자명:{' '}
          <span className="font-medium text-tg-text">
            {reporter?.username ? `@${reporter.username}` : reporter?.firstName ?? '-'}
          </span>
        </p>
        <p className="break-all">
          TON 지갑:{' '}
          <span className="font-medium text-tg-text">{wallet || '미등록'}</span>
          {wallet && (
            <button type="button" onClick={() => copyText(wallet, 'TON 지갑')} className="ml-2 text-tg-link">복사</button>
          )}
        </p>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="TON 수량"
          className="w-24 rounded-lg bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/5"
        />
        <span className="text-xs text-tg-hint">TON</span>
        <button
          type="button"
          onClick={openTonTransfer}
          disabled={!wallet}
          className="ml-auto rounded-xl bg-tg-button px-4 py-2 text-sm font-medium text-tg-button-text disabled:opacity-40"
        >
          TON 지급
        </button>
      </div>
    </div>
  );
}