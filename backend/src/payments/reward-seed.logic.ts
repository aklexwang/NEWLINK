import { randomUUID } from 'crypto';
import type { PayoutDestinationKind } from './payout-method.entity';
import type { PayoutRecord } from './payout-record.entity';

export const PAYOUT_METHOD_SEEDS: Array<{
  code: string;
  label: string;
  destinationKind: PayoutDestinationKind;
  network: string | null;
  currency: string;
  defaultAmount: number;
  enabled: boolean;
  sort: number;
}> = [
  {
    code: 'ton',
    label: 'TON',
    destinationKind: 'wallet_address',
    network: 'ton',
    currency: 'TON',
    defaultAmount: 1,
    enabled: true,
    sort: 0,
  },
  {
    code: 'stars',
    label: 'Telegram Stars',
    destinationKind: 'telegram_account',
    network: null,
    currency: 'STARS',
    defaultAmount: 50,
    enabled: true,
    sort: 1,
  },
  {
    code: 'usdt_trc20',
    label: 'USDT TRC-20',
    destinationKind: 'wallet_address',
    network: 'trc20',
    currency: 'USDT',
    defaultAmount: 1,
    enabled: true,
    sort: 2,
  },
];

export function shouldInsertWhenEmpty(count: number): boolean {
  return count === 0;
}

export function shouldCopyTonPayment(
  paymentId: string | null | undefined,
  seenSourceIds: Set<string>,
): boolean {
  return Boolean(paymentId) && !seenSourceIds.has(paymentId as string);
}

export function shouldGapFillRewardChannel(
  existingLedgerCount: number,
): boolean {
  return existingLedgerCount === 0;
}

export function newRewardSettingsRow(now = new Date()) {
  return {
    id: randomUUID(),
    enabled: true,
    updatedAt: now,
  };
}

export function newPayoutMethodSeedRows(now = new Date()) {
  return PAYOUT_METHOD_SEEDS.map((row) => ({
    ...row,
    id: randomUUID(),
    createdAt: now,
  }));
}

export function newPayoutRecordId(): string {
  return randomUUID();
}

/** 시드·백필이 넣는 uuid 컬럼 값을 한곳에 모읍니다. */
export function collectRewardSeedIds(): string[] {
  const settings = newRewardSettingsRow();
  const methods = newPayoutMethodSeedRows();
  return [settings.id, ...methods.map((row) => row.id), newPayoutRecordId()];
}

export type TonPaymentLike = {
  id: string;
  channelId: string;
  telegramId: number | null;
  reporterName: string | null;
  amount: number;
  wallet: string;
  method: string;
  memo: string | null;
  paidAt: Date | null;
};

export function payoutRecordFromTonPayment(
  payment: TonPaymentLike,
  _now = new Date(),
): Pick<PayoutRecord, 'id' | 'sourceTonPaymentId' | 'channelId'> & {
  id: string;
} {
  return {
    id: randomUUID(),
    sourceTonPaymentId: payment.id,
    channelId: payment.channelId,
  };
}
