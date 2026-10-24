import { isUuidId } from '../common/uuid-id';
import { newDiscoveryKeywordInsertRows } from '../stats/discovery-keywords';
import {
  collectRewardSeedIds,
  newPayoutMethodSeedRows,
  newPayoutRecordId,
  newRewardSettingsRow,
  payoutRecordFromTonPayment,
  shouldCopyTonPayment,
  shouldGapFillRewardChannel,
  shouldInsertWhenEmpty,
} from './reward-seed.logic';

describe('시드·백필 id 는 uuid 형식이다', () => {
  it('보상 설정·수단·원장·발견 키워드 시드 id 가 모두 uuid 다', () => {
    const ids = [
      ...collectRewardSeedIds(),
      ...newDiscoveryKeywordInsertRows().map((row) => row.id),
    ];
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      expect(isUuidId(id)).toBe(true);
      expect(id).not.toBe('default');
    }
  });

  it('설정 한 행과 수단 시드도 uuid 다', () => {
    expect(isUuidId(newRewardSettingsRow().id)).toBe(true);
    for (const row of newPayoutMethodSeedRows()) {
      expect(isUuidId(row.id)).toBe(true);
    }
    expect(isUuidId(newPayoutRecordId())).toBe(true);
    expect(
      isUuidId(
        payoutRecordFromTonPayment({
          id: newPayoutRecordId(),
          channelId: newPayoutRecordId(),
          telegramId: 1,
          reporterName: null,
          amount: 1,
          wallet: 'EQ',
          method: 'external',
          memo: null,
          paidAt: null,
        }).id,
      ),
    ).toBe(true);
  });
});

describe('온모듈 백필 멱등', () => {
  it('테이블에 이미 행이 있으면 시드하지 않는다', () => {
    expect(shouldInsertWhenEmpty(0)).toBe(true);
    expect(shouldInsertWhenEmpty(1)).toBe(false);
  });

  it('이미 복사한 ton_payments 는 다시 넣지 않는다', () => {
    const seen = new Set(['pay-1']);
    expect(shouldCopyTonPayment('pay-1', seen)).toBe(false);
    expect(shouldCopyTonPayment('pay-2', seen)).toBe(true);
    expect(shouldCopyTonPayment('', seen)).toBe(false);
  });

  it('채널에 원장이 있으면 보강 행을 넣지 않는다', () => {
    expect(shouldGapFillRewardChannel(0)).toBe(true);
    expect(shouldGapFillRewardChannel(1)).toBe(false);
  });
});
