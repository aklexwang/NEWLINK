import { useState } from 'react';
import type { PendingChannel } from '../types/channel';
import { recordTonPayment } from '../utils/tonPaymentHistory';

interface ReporterTonPanelProps {
  item: PendingChannel;
}

type DialogState = 'confirm' | 'success' | null;

export function ReporterTonPanel({ item }: ReporterTonPanelProps) {
  const [amount, setAmount] = useState('1');
  const [dialog, setDialog] = useState<DialogState>(null);
  const reporter = item.reporter;
  const telegramId = reporter?.telegramId ?? item.submittedBy;
  const wallet = reporter?.tonWalletAddress ?? '';
  const tonAmount = amount.trim() || '1';

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      window.alert(`${label} 복사됨`);
    } catch {
      window.alert('복사에 실패했습니다.');
    }
  };

  const openConfirm = () => {
    if (!wallet) {
      window.alert('제보자 TON 지갑이 등록되지 않았습니다.');
      return;
    }
    setDialog('confirm');
  };

  const handleConfirm = () => {
    recordTonPayment({
      amount: Number.parseFloat(tonAmount) || 0,
      wallet,
      telegramId: telegramId ?? null,
      reporterName: reporter?.username
        ? `@${reporter.username}`
        : reporter?.firstName ?? null,
      channelId: item.id,
      channelTitle: item.title,
      channelLink: item.link,
    });
    setDialog('success');
  };

  return (
    <>
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
        <h3 className="text-xs font-semibold text-tg-text">제보자 정보 · TON 지급</h3>
        <div className="mt-2 space-y-1 text-xs text-tg-hint">
          <p>
            Telegram ID: <span className="font-medium text-tg-text">{telegramId ?? '알 수 없음'}</span>
            {telegramId && (
              <button type="button" onClick={() => copyText(String(telegramId), 'Telegram ID')} className="ml-2 text-tg-link">
                복사
              </button>
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
              <button type="button" onClick={() => copyText(wallet, 'TON 지갑')} className="ml-2 text-tg-link">
                복사
              </button>
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
            onClick={openConfirm}
            disabled={!wallet}
            className="ml-auto rounded-xl bg-tg-button px-4 py-2 text-sm font-medium text-tg-button-text disabled:opacity-40"
          >
            TON 지급
          </button>
        </div>
      </div>

      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          onClick={() => setDialog(null)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {dialog === 'confirm' ? (
              <>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5 text-center text-white">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-2xl">
                    💎
                  </div>
                  <h3 className="mt-3 text-lg font-bold">TON 송금 확인</h3>
                  <p className="mt-1 text-sm text-blue-100">내 지갑에서 직접 송금했는지 확인해 주세요</p>
                </div>

                <div className="px-6 py-5">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center ring-1 ring-slate-100">
                    <p className="text-xs font-medium text-slate-500">송금 수량</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{tonAmount} TON</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-500">수신 지갑</p>
                    <p className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-700 ring-1 ring-slate-100">
                      {wallet}
                    </p>
                  </div>

                  <p className="mt-4 text-center text-sm text-slate-600">
                    내 지갑에서 <span className="font-semibold text-slate-900">{tonAmount} TON</span> 송금을
                    완료했습니까?
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog(null)}
                      className="rounded-xl bg-white py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirm}
                      className="rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      완료했습니다
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="px-6 py-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
                  ✓
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">지급 확인 완료</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {tonAmount} TON 지급이 확인되었습니다.
                </p>
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-800"
                >
                  확인
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
