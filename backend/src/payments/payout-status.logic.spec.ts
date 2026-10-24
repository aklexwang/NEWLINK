import {
  backfillPayoutStatus,
  initialPayoutStatus,
  isBlockingPayoutStatus,
  submitRequiresWallet,
} from './payout-status.logic';

describe('initialPayoutStatus', () => {
  it('회원 제보만 pending 이고 나머지는 not_eligible 이다', () => {
    expect(initialPayoutStatus({ submittedBy: 12 })).toBe('pending');
    expect(initialPayoutStatus({ submittedBy: '12' })).toBe('pending');
    expect(initialPayoutStatus({ submittedBy: null })).toBe('not_eligible');
    expect(initialPayoutStatus({ submittedBy: undefined })).toBe('not_eligible');
    expect(initialPayoutStatus({ submittedBy: '' })).toBe('not_eligible');
  });
});

describe('backfillPayoutStatus', () => {
  it('reward>0 이 가장 먼저 paid 다', () => {
    expect(
      backfillPayoutStatus({
        rewardTonAmount: 1,
        submittedBy: null,
        status: 'rejected',
      }),
    ).toBe('paid');
  });

  it('submitted_by 없으면 not_eligible 이다', () => {
    expect(
      backfillPayoutStatus({
        rewardTonAmount: 0,
        submittedBy: null,
        status: 'active',
      }),
    ).toBe('not_eligible');
  });

  it('거절된 제보는 not_eligible 이다', () => {
    expect(
      backfillPayoutStatus({
        rewardTonAmount: null,
        submittedBy: 9,
        status: 'rejected',
      }),
    ).toBe('not_eligible');
  });

  it('나머지는 pending 이다', () => {
    expect(
      backfillPayoutStatus({
        rewardTonAmount: null,
        submittedBy: 9,
        status: 'pending',
      }),
    ).toBe('pending');
  });
});

describe('isBlockingPayoutStatus', () => {
  it('paid 와 sending 만 중복 지급을 막는다', () => {
    expect(isBlockingPayoutStatus('paid')).toBe(true);
    expect(isBlockingPayoutStatus('sending')).toBe(true);
    expect(isBlockingPayoutStatus('failed')).toBe(false);
    expect(isBlockingPayoutStatus('void')).toBe(false);
  });
});

describe('submitRequiresWallet', () => {
  it('보상이 꺼져 있으면 지갑이 필요 없다', () => {
    expect(
      submitRequiresWallet({
        rewardsEnabled: false,
        methods: [
          { enabled: true, destinationKind: 'wallet_address' },
        ],
      }),
    ).toBe(false);
  });

  it('Stars 수단이 켜져 있으면 지갑이 필요 없다', () => {
    expect(
      submitRequiresWallet({
        rewardsEnabled: true,
        methods: [
          { enabled: true, destinationKind: 'telegram_account' },
          { enabled: true, destinationKind: 'wallet_address' },
        ],
      }),
    ).toBe(false);
  });

  it('지갑 수단만 켜져 있으면 지갑이 필요하다', () => {
    expect(
      submitRequiresWallet({
        rewardsEnabled: true,
        methods: [
          { enabled: true, destinationKind: 'wallet_address' },
          { enabled: false, destinationKind: 'telegram_account' },
        ],
      }),
    ).toBe(true);
  });
});
