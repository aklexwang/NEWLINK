import { useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { recordReporterReward } from '../api/admin';
import type { PendingChannel } from '../types/channel';
import type { TonPaymentMethod } from '../types/tonPayment';
import { toNanoTon } from '../utils/tonAmount';
import { identifyWalletAddress } from '../utils/walletAddress';
import { WalletNetworkBadge } from './WalletNetworkBadge';

interface ReporterTonPanelProps {
  item: PendingChannel;
  onRecorded?: () => void;
}

type DialogState = 'wallet-confirm' | 'external-confirm' | 'sending' | 'success' | null;

export function ReporterTonPanel({ item, onRecorded }: ReporterTonPanelProps) {
  const [tonConnectUI] = useTonConnectUI();
  const [amount, setAmount] = useState('1');
  const [memo, setMemo] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [sendError, setSendError] = useState('');
  const [lastMethod, setLastMethod] = useState<TonPaymentMethod>('tonconnect');
  const reporter = item.reporter;
  const telegramId = reporter?.telegramId ?? item.submittedBy;
  const wallet = reporter?.tonWalletAddress ?? '';
  const walletInfo = identifyWalletAddress(wallet);
  const tonAmount = amount.trim() || '1';
  const amountNum = Number.parseFloat(tonAmount) || 0;
  const canPay = Boolean(wallet) && walletInfo.kind === 'ton' && amountNum > 0;
  const alreadyRewarded = item.rewardTonAmount != null && item.rewardTonAmount > 0;

  const copyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      window.alert(`${label} 복사됨`);
    } catch {
      window.alert('복사에 실패했습니다.');
    }
  };

  const openDialog = (next: 'wallet-confirm' | 'external-confirm') => {
    if (!wallet) {
      window.alert('제보자 TON 지갑이 등록되지 않았습니다.');
      return;
    }
    if (!walletInfo.valid || walletInfo.kind !== 'ton') {
      window.alert(`지갑 형식을 확인하세요.\n${walletInfo.label}\n${walletInfo.hint}`);
      return;
    }
    if (amountNum <= 0) {
      window.alert('지급 수량을 입력해 주세요.');
      return;
    }
    setSendError('');
    setDialog(next);
  };

  const persistPayment = async (method: TonPaymentMethod): Promise<boolean> => {
    try {
      await recordReporterReward(item.id, {
        amountTon: amountNum,
        wallet,
        method,
        memo: memo.trim() || (method === 'external' ? '외부 지갑 송금' : undefined),
      });
      setLastMethod(method);
      onRecorded?.();
      return true;
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : '회원 MY·지급 이력 반영에 실패했습니다.';
      setSendError(message);
      setLastMethod(method);
      return false;
    }
  };

  const handleWalletSend = async () => {
    if (!wallet) return;
    setDialog('sending');
    setSendError('');
    try {
      if (!tonConnectUI.connected) {
        await tonConnectUI.openModal();
        setDialog('wallet-confirm');
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

      const saved = await persistPayment('tonconnect');
      setDialog(saved ? 'success' : 'wallet-confirm');
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : '송금이 취소되었거나 실패했습니다.';
      setSendError(message);
      setDialog('wallet-confirm');
    }
  };

  const handleExternalRecord = async () => {
    if (!wallet) return;
    setDialog('sending');
    setSendError('');
    const saved = await persistPayment('external');
    setDialog(saved ? 'success' : 'external-confirm');
  };

  if (alreadyRewarded) {
    return (
      <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
        <p className="text-xs font-semibold text-emerald-900">① 보상 기록 완료</p>
        <p className="mt-1 text-xs text-emerald-800">
          {item.rewardTonAmount?.toLocaleString('ko-KR')} TON/Gram 반영됨
          {item.rewardPaidAt && (
            <span className="text-emerald-700/80">
              {' '}
              · {new Date(item.rewardPaidAt).toLocaleString('ko-KR')}
            </span>
          )}
        </p>
        <p className="mt-2 text-[11px] leading-snug text-emerald-900/80">
          아직 승인 대기 목록에 있다면, 아래 <strong>② 승인(회원 공개)</strong>을 눌러야 목록에서
          사라집니다. 보상 기록만으로는 승인되지 않습니다.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
        <h3 className="text-xs font-semibold text-tg-text">① 제보자 보상 (승인과 별개)</h3>
        <p className="mt-1 text-[11px] leading-snug text-tg-hint">
          여기서는 TON 보상만 회원 MY·지급 이력에 남깁니다. 목록에서 빼려면 아래 「② 승인」이
          필요합니다.
        </p>
        <div className="mt-2 space-y-1 text-xs text-tg-hint">
          <p>
            Telegram ID: <span className="font-medium text-tg-text">{telegramId ?? '알 수 없음'}</span>
            {telegramId && (
              <button
                type="button"
                onClick={() => copyText(String(telegramId), 'Telegram ID')}
                className="ml-2 text-tg-link"
              >
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
            지갑 주소: <span className="font-medium text-tg-text">{wallet || '미등록'}</span>
            {wallet && (
              <button type="button" onClick={() => copyText(wallet, '지갑 주소')} className="ml-2 text-tg-link">
                복사
              </button>
            )}
          </p>
          {wallet && <WalletNetworkBadge address={wallet} className="pt-1" />}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="수량"
            className="w-24 rounded-lg bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/5"
          />
          <span className="text-xs font-semibold text-sky-700">
            {walletInfo.kind === 'ton' ? 'TON/Gram' : '수량'}
          </span>
          <input
            type="text"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모(선택, 외부 TX 등)"
            className="min-w-[10rem] flex-1 rounded-lg bg-white px-3 py-2 text-sm outline-none ring-1 ring-black/5"
          />
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => openDialog('wallet-confirm')}
            disabled={!canPay}
            className="rounded-xl bg-tg-button px-4 py-2 text-sm font-medium text-tg-button-text disabled:opacity-40"
          >
            Wallet 송금
          </button>
          <button
            type="button"
            onClick={() => openDialog('external-confirm')}
            disabled={!canPay}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-800 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
          >
            외부 송금 기록
          </button>
        </div>
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
            {dialog === 'success' ? (
              <div className="px-6 py-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl">
                  ✓
                </div>
                <h3 className="mt-4 text-lg font-bold text-slate-900">① 보상 기록 완료</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {tonAmount} TON/Gram이 회원 MY·TON 지급 이력에 저장되었습니다.
                </p>
                <p className="mt-2 text-xs text-amber-800">
                  승인 대기에서 없애려면 카드 아래 「② 승인(회원 공개)」을 눌러 주세요.
                </p>
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="mt-6 w-full rounded-xl bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-800"
                >
                  확인
                </button>
              </div>
            ) : (
              <>
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-5 text-center text-white">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-2xl">
                    💎
                  </div>
                  <h3 className="mt-3 text-lg font-bold">
                    {dialog === 'external-confirm' || (dialog === 'sending' && lastMethod === 'external')
                      ? '외부 지갑 송금 기록'
                      : 'TON Wallet 송금'}
                  </h3>
                  <p className="mt-1 text-sm text-blue-100">
                    {dialog === 'external-confirm'
                      ? '이미 외부 지갑으로 보낸 뒤, 여기선 기록만 남깁니다'
                      : '관리자 지갑에서 제보자에게 직접 전송합니다'}
                  </p>
                </div>

                <div className="px-6 py-5">
                  <div className="rounded-xl bg-slate-50 px-4 py-3 text-center ring-1 ring-slate-100">
                    <p className="text-xs font-medium text-slate-500">지급 수량</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{tonAmount} TON/Gram</p>
                  </div>

                  <div className="mt-4">
                    <p className="text-xs font-medium text-slate-500">수신 지갑</p>
                    <WalletNetworkBadge address={wallet} className="mt-2" />
                    <p className="mt-1 break-all rounded-xl bg-slate-50 px-3 py-2.5 font-mono text-xs leading-relaxed text-slate-700 ring-1 ring-slate-100">
                      {wallet}
                    </p>
                  </div>

                  {dialog === 'external-confirm' && (
                    <p className="mt-3 text-center text-xs text-amber-800">
                      외부에서 송금 완료했는지 확인한 뒤 기록하세요. 체인 검증은 하지 않습니다.
                    </p>
                  )}

                  {sendError && <p className="mt-3 text-center text-xs text-amber-700">{sendError}</p>}

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDialog(null)}
                      disabled={dialog === 'sending'}
                      className="rounded-xl bg-white py-3 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
                    >
                      취소
                    </button>
                    {dialog === 'external-confirm' ||
                    (dialog === 'sending' && lastMethod === 'external') ? (
                      <button
                        type="button"
                        onClick={() => {
                          setLastMethod('external');
                          void handleExternalRecord();
                        }}
                        disabled={dialog === 'sending'}
                        className="rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {dialog === 'sending' ? '기록 중…' : '송금 완료로 기록'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setLastMethod('tonconnect');
                          void handleWalletSend();
                        }}
                        disabled={dialog === 'sending'}
                        className="rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {dialog === 'sending' ? '지갑 대기…' : 'Wallet으로 송금'}
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
