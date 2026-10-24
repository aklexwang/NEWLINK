import { useCallback, useEffect, useState } from 'react';
import { isAxiosError } from 'axios';
import { useTonConnectUI } from '@tonconnect/ui-react';
import {
  getAdminPendingPayouts,
  recordReporterReward,
  skipAdminPayout,
  type AdminPayoutMethod,
  type PendingPayoutItem,
} from '../../../api/admin';
import { CandidateAvatar } from '../../../components/admin/CandidateAvatar';
import { Button } from '@/components/admin/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/admin/ui/card';
import { Input } from '@/components/admin/ui/input';
import { Skeleton } from '@/components/admin/ui/skeleton';
import { adminApiErrorMessage } from '../../../utils/adminApiError';
import {
  formatPayoutAmount,
  payoutWalletMismatch,
  walletKindLabel,
} from '../../../utils/payoutDisplay';
import { toNanoTon } from '../../../utils/tonAmount';

type Draft = {
  methodId: string;
  amount: string;
  memo: string;
  skipReason: string;
};

function currencyOf(method: AdminPayoutMethod): 'TON' | 'USDT' | 'STARS' {
  const code = method.currency.toUpperCase();
  if (code === 'USDT') return 'USDT';
  if (code === 'STARS') return 'STARS';
  return 'TON';
}

export function PendingPayoutTab() {
  const [tonConnectUI] = useTonConnectUI();
  const [items, setItems] = useState<PendingPayoutItem[]>([]);
  const [methods, setMethods] = useState<AdminPayoutMethod[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminPendingPayouts();
      setItems(data.items);
      setMethods(data.methods);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const item of data.items) {
          const fallback = data.methods[0];
          if (!next[item.id] && fallback) {
            next[item.id] = {
              methodId: fallback.id,
              amount: String(fallback.defaultAmount ?? 0),
              memo: '',
              skipReason: '',
            };
          }
        }
        return next;
      });
      setMessage('');
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '지급 대기 목록을 불러오지 못했습니다.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const pay = async (
    item: PendingPayoutItem,
    extra: {
      sendMethod: 'tonconnect' | 'external' | 'manual_gift';
      phase?: 'sending' | 'paid' | 'failed';
      payoutRecordId?: string;
      force?: boolean;
      memo?: string;
    },
  ) => {
    const draft = drafts[item.id];
    const method = methods.find((row) => row.id === draft?.methodId) ?? methods[0];
    if (!method || !draft) throw new Error('지급 수단을 선택해 주세요.');
    const currency = currencyOf(method);
    const amountNum = Number(draft.amount);
    const run = (force?: boolean) =>
      recordReporterReward(item.id, {
        amount: amountNum,
        amountTon: currency === 'TON' ? amountNum : undefined,
        wallet: item.reporter?.tonWalletAddress ?? undefined,
        method: extra.sendMethod === 'tonconnect' ? 'tonconnect' : 'external',
        sendMethod: extra.sendMethod,
        currency,
        methodId: method.id,
        memo: extra.memo ?? (draft.memo.trim() || undefined),
        phase: extra.phase,
        payoutRecordId: extra.payoutRecordId,
        force,
      });
    try {
      return await run(extra.force);
    } catch (error) {
      if (isAxiosError(error) && error.response?.status === 409) {
        if (window.confirm('이미 지급 기록이 있습니다. 계속할까요?')) {
          return run(true);
        }
      }
      throw error;
    }
  };

  const handleWalletSend = async (item: PendingPayoutItem) => {
    const wallet = item.reporter?.tonWalletAddress;
    if (!wallet) {
      setMessage('제보자 TON 지갑이 없습니다.');
      return;
    }
    setBusyId(item.id);
    let sendingId: string | undefined;
    try {
      const started = await pay(item, { sendMethod: 'tonconnect', phase: 'sending' });
      sendingId = started.payoutRecordId;
      if (!sendingId) return;
      if (!tonConnectUI.connected) {
        await tonConnectUI.openModal();
        setMessage('관리자 지갑을 연결한 뒤 다시 「Wallet 으로 보내기」를 눌러 주세요.');
        return;
      }
      const draft = drafts[item.id];
      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [{ address: wallet, amount: toNanoTon(draft.amount || '0') }],
      });
      await pay(item, {
        sendMethod: 'tonconnect',
        phase: 'paid',
        payoutRecordId: sendingId,
        memo: drafts[item.id]?.memo.trim() || 'tonconnect',
      });
      setMessage('Wallet 송금을 지급 완료로 기록했습니다.');
      await load();
    } catch (error) {
      if (sendingId) {
        try {
          await pay(item, {
            sendMethod: 'tonconnect',
            phase: 'failed',
            payoutRecordId: sendingId,
            force: true,
            memo: '송금 실패 또는 취소',
          });
        } catch {
          // 원장 sending 은 지급 이력에서 확인
        }
      }
      setMessage(adminApiErrorMessage(error, 'Wallet 송금에 실패했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleRecord = async (
    item: PendingPayoutItem,
    sendMethod: 'external' | 'manual_gift',
  ) => {
    const draft = drafts[item.id];
    if (sendMethod === 'external' && !draft?.memo.trim()) {
      setMessage('TX 또는 메모를 입력해 주세요.');
      return;
    }
    setBusyId(item.id);
    try {
      await pay(item, { sendMethod, phase: 'paid', memo: draft.memo.trim() || '직접 선물' });
      setMessage('지급을 기록했습니다.');
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '지급 기록에 실패했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  const handleSkip = async (item: PendingPayoutItem) => {
    const reason = drafts[item.id]?.skipReason.trim() ?? '';
    if (!reason) {
      setMessage('지급 안 함 이유를 입력해 주세요.');
      return;
    }
    setBusyId(item.id);
    try {
      const run = (force?: boolean) => skipAdminPayout(item.id, { reason, force });
      try {
        await run();
      } catch (error) {
        if (isAxiosError(error) && error.response?.status === 409) {
          if (!window.confirm('이미 지급 기록이 있습니다. 지급 안 함으로 처리할까요?')) throw error;
          await run(true);
        } else {
          throw error;
        }
      }
      setMessage('지급 안 함으로 처리했습니다.');
      await load();
    } catch (error) {
      setMessage(adminApiErrorMessage(error, '지급 안 함 처리에 실패했습니다.'));
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="space-y-3">
      {message && <p className="text-sm text-foreground">{message}</p>}
      {items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">지급 대기 제보가 없습니다.</p>
      ) : (
        items.map((item) => {
          const draft = drafts[item.id];
          const method = methods.find((row) => row.id === draft?.methodId) ?? methods[0];
          const currency = method ? currencyOf(method) : 'TON';
          const reporter = item.reporter;
          const telegramId = reporter?.telegramId ?? item.submittedBy;
          const mismatch = method
            ? payoutWalletMismatch(reporter?.walletKind, method)
            : null;
          const busy = busyId === item.id;
          return (
            <Card key={item.id}>
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                  <CandidateAvatar
                    link={item.link}
                    avatarUrl={item.avatarUrl}
                    linkType={item.linkType ?? 'channel'}
                  />
                </div>
                <div>
                  <CardTitle className="text-base">{item.title}</CardTitle>
                  <p className="text-xs text-muted-foreground">{item.link}</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {currency === 'STARS' ? (
                  <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
                    <p className="text-xs text-muted-foreground">받는 사람 (직접 선물)</p>
                    <p className="mt-1 text-2xl font-bold tracking-tight">
                      {telegramId ?? '알 수 없음'}
                      {telegramId != null && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="ml-2 align-middle"
                          onClick={() => void navigator.clipboard.writeText(String(telegramId))}
                        >
                          복사
                        </Button>
                      )}
                    </p>
                    <p className="text-xl font-semibold">
                      {reporter?.username ? `@${reporter.username}` : reporter?.firstName ?? '-'}
                      {reporter?.username && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="ml-2 align-middle"
                          onClick={() => void navigator.clipboard.writeText(`@${reporter.username}`)}
                        >
                          복사
                        </Button>
                      )}
                    </p>
                  </div>
                ) : (
                  <div className="text-sm">
                    <p>
                      텔레그램 ID {telegramId ?? '-'} ·{' '}
                      {reporter?.username ? `@${reporter.username}` : reporter?.firstName ?? '-'}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {walletKindLabel(reporter?.walletKind)} · {reporter?.tonWalletAddress || '지갑 없음'}
                    </p>
                  </div>
                )}

                {mismatch && <p className="text-sm text-destructive">{mismatch}</p>}

                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-muted-foreground">
                    수단
                    <select
                      className="mt-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                      value={draft?.methodId ?? ''}
                      onChange={(e) => {
                        const next = methods.find((row) => row.id === e.target.value);
                        patchDraft(item.id, {
                          methodId: e.target.value,
                          amount: String(next?.defaultAmount ?? draft?.amount ?? ''),
                        });
                      }}
                    >
                      {methods.map((row) => (
                        <option key={row.id} value={row.id}>
                          {row.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted-foreground">
                    금액
                    <Input
                      className="mt-1 w-28"
                      value={draft?.amount ?? ''}
                      onChange={(e) => patchDraft(item.id, { amount: e.target.value })}
                    />
                  </label>
                  <span className="pb-2 text-xs font-medium">
                    {currency === 'STARS'
                      ? `⭐ ${formatPayoutAmount('STARS', Number(draft?.amount) || 0)}`
                      : `${formatPayoutAmount(currency, Number(draft?.amount) || 0)} ${currency}`}
                  </span>
                  {currency !== 'STARS' && (
                    <Input
                      className="min-w-[12rem] flex-1"
                      placeholder="TX / 메모"
                      value={draft?.memo ?? ''}
                      onChange={(e) => patchDraft(item.id, { memo: e.target.value })}
                    />
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {currency === 'TON' && (
                    <Button
                      type="button"
                      disabled={busy || methods.length === 0}
                      onClick={() => void handleWalletSend(item)}
                    >
                      Wallet 으로 보내기
                    </Button>
                  )}
                  {currency !== 'STARS' && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void handleRecord(item, 'external')}
                    >
                      외부 송금 기록
                    </Button>
                  )}
                  {currency === 'STARS' && (
                    <Button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRecord(item, 'manual_gift')}
                    >
                      직접 선물 기록
                    </Button>
                  )}
                </div>

                <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
                  <Input
                    className="min-w-[12rem] flex-1"
                    placeholder="지급 안 함 이유 (필수)"
                    value={draft?.skipReason ?? ''}
                    onChange={(e) => patchDraft(item.id, { skipReason: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void handleSkip(item)}
                  >
                    지급 안 함
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
