import { useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { recordReporterReward } from '../api/admin';
import type { PendingChannel } from '../types/channel';
import { toNanoTon } from '../utils/tonAmount';
import { identifyWalletAddress } from '../utils/walletAddress';
import { recordTonPayment } from '../utils/tonPaymentHistory';
import { WalletNetworkBadge } from './WalletNetworkBadge';

interface ReporterTonPanelProps {
  item: PendingChannel;
}

type DialogState = 'confirm' | 'sending' | 'success' | null;

export function ReporterTonPanel({ item }: ReporterTonPanelProps) {
  const [tonConnectUI] = useTonConnectUI();
  const [amount, setAmount] = useState('1');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [sendError, setSendError] = useState('');
  const reporter = item.reporter;
  const telegramId = reporter?.telegramId ?? item.submittedBy;
  const wallet = reporter?.tonWalletAddress ?? '';
  const walletInfo = identifyWalletAddress(wallet);
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
    if (!walletInfo.valid || walletInfo.kind !== 'ton') {
      window.alert(`지갑 형식을 확인하세요.\n${walletInfo.label}\n${walletInfo.hint}`);
      return;
    }
    setSendError('');
    setDialog('confirm');
  };

  const handleSend = async () => {
    if (!wallet) return;
    setDialog('sending');
    setSendError('');
    try {
      if (!tonConnectUI.connected) {
        await tonConnectUI.openModal();
        // User must confirm connection then press send again
        setDialog('confirm');
        setSendError('관리자 지갑을 연결한 뒤 다시 「Wallet으로 송금」을 눌러 주세요.');
        return;
      }

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          {
            address: wallet,
            amount: toNanoTon(tonAmount),
          },
        ],
      });

      const amountNum = Number.parseFloat(tonAmount) || 0;
      try {
        await recordReporterReward(item.id, { amountTon: amountNum, wallet });
      } catch {
        // Keep local history even if rate API fails briefly
      }

      recordTonPayment({
        amount: amountNum,
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
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : '송금이 취소되었거나 실패했습니다.';
      setSendError(message);
      setDialog('confirm');
    }
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
            지갑 주소:{' '}
            <span className="font-medium text-tg-text">{wallet || '미등록'}</span>
            {wallet && (
              <button type="button" onClick={() => copyText(wallet, '지갑 주소')} className="ml-2 text-tg-link">
                복사
              </button>
            )}
          </p>
          {wallet && <WalletNetworkBadge address={wallet} className="pt-1" />}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="수량"
            className="w-24 rounded-lg bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/5"
          />
          <span className="text-xs font-semibold text-sky-700">{walletInfo.kind === 'ton' ? 'TON/Gram' : '수량'}</span>
          <button
            type="button"
            onClick={openConfirm}
            disabled={!wallet || walletInfo.kind !== 'ton'}
            className="ml-auto rounded-xl bg-tg-button px-4 py-2 text-sm font-medium text-tg-button-text disabled:opacity-40"
          >
            Wallet 송금
          </button>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-tg-hint">
          송금 전 위 배지로 코인 종류를 확인하세요. TON 네트워크(Gram)만 전송됩니다.
        </p>
      </div>

      {dialog && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
          onClick={() => (dialog === 'sending' ? undefined : setDialog(null))}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {dialog === 'confirm' || dialog === 'sending' ? (
              <>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5 text-center text-white">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-2xl">
                    💎
                  </div>
                  <h3 className="mt-3 text-lg font-bold">TON Wallet 송금</h3>
                  <p className="mt-1 text-sm text-blue-100">관리자 지갑에서 제보자에게 직접 전송합니다</p>
                </div>

                <div className="px-6 py-5">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center ring-1 ring-slate-100">
                    <p className="text-xs font-medium text-slate-500">송금 수량</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{tonAmount} TON/Gram</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-500">수신 지갑</p>
                    <WalletNetworkBadge address={wallet} className="mt-2" />
                    <p className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-700 ring-1 ring-slate-100">
                      {wallet}
                    </p>
                  </div>

                  {sendError && (
                    <p className="mt-3 text-center text-xs text-amber-700">{sendError}</p>
                  )}

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog(null)}
                      disabled={dialog === 'sending'}
                      className="rounded-xl bg-white py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSend()}
                      disabled={dialog === 'sending'}
                      className="rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {dialog === 'sending' ? '지갑 대기…' : 'Wallet으로 송금'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="px-6 py-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
                  ✓
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">송금 승인 완료</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {tonAmount} TON/Gram 지급이 지갑에서 승인되었습니다.
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
