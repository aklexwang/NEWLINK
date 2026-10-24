import { telegramIdKey } from '../common/telegram-id';

export type ChannelPayoutStatus =
  | 'not_eligible'
  | 'pending'
  | 'paid'
  | 'skipped';

/** 회원 제보(submitted_by 있음)만 pending. 어드민·발견·대량은 not_eligible. */
export function initialPayoutStatus(input: {
  submittedBy: unknown;
}): ChannelPayoutStatus {
  return telegramIdKey(input.submittedBy) ? 'pending' : 'not_eligible';
}

/**
 * 백필: reward>0 → paid, submitted_by 없음 → not_eligible,
 * rejected → not_eligible, 나머지 → pending.
 */
export function backfillPayoutStatus(row: {
  rewardTonAmount?: number | null;
  submittedBy?: unknown;
  status?: string | null;
}): ChannelPayoutStatus {
  const amount = Number(row.rewardTonAmount);
  if (Number.isFinite(amount) && amount > 0) return 'paid';
  if (!telegramIdKey(row.submittedBy)) return 'not_eligible';
  if (row.status === 'rejected') return 'not_eligible';
  return 'pending';
}

export function isBlockingPayoutStatus(status: string): boolean {
  return status === 'paid' || status === 'sending';
}

export function submitRequiresWallet(input: {
  rewardsEnabled: boolean;
  methods: Array<{ enabled: boolean; destinationKind: string }>;
}): boolean {
  if (!input.rewardsEnabled) return false;
  const hasTelegramAccount = input.methods.some(
    (method) => method.enabled && method.destinationKind === 'telegram_account',
  );
  return !hasTelegramAccount;
}
