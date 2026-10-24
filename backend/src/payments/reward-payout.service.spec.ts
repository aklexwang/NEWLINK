import { ConflictException } from '@nestjs/common';
import { DUPLICATE_PAYOUT_MESSAGE, RewardPayoutService } from './reward-payout.service';

function serviceWith(records: Array<{ status: string }>) {
  const recordRepository = {
    find: jest.fn().mockResolvedValue(records),
    findOneBy: jest.fn(),
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => row),
  };
  const channelRepository = {
    findOneBy: jest.fn().mockResolvedValue({
      id: 'ch-1',
      submittedBy: 9,
      title: '뉴스',
      link: 'https://t.me/news',
    }),
    update: jest.fn(),
  };
  const svc = new RewardPayoutService(
    { findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() } as never,
    { find: jest.fn().mockResolvedValue([]), findOne: jest.fn() } as never,
    recordRepository as never,
    channelRepository as never,
    {
      recordReporterReward: jest.fn().mockResolvedValue({}),
      findById: jest.fn().mockResolvedValue({ id: 'ch-1', rewardTonAmount: 1 }),
    } as never,
    { getReporterOrNull: jest.fn().mockResolvedValue(null) } as never,
    { create: jest.fn().mockResolvedValue({}) } as never,
  );
  return { svc, recordRepository };
}

describe('RewardPayoutService 중복 지급', () => {
  it('paid 원장이 있으면 409 메시지를 준다', async () => {
    const { svc } = serviceWith([{ status: 'paid' }]);
    await expect(
      svc.recordChannelPayout('ch-1', { amountTon: 1, phase: 'paid' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      svc.recordChannelPayout('ch-1', { amountTon: 1, phase: 'paid' }),
    ).rejects.toMatchObject({ message: DUPLICATE_PAYOUT_MESSAGE });
  });

  it('force=true 이면 이중 기록을 진행한다', async () => {
    const { svc } = serviceWith([{ status: 'sending' }]);
    const result = await svc.recordChannelPayout('ch-1', {
      amountTon: 1,
      phase: 'paid',
      method: 'external',
      force: true,
    });
    expect(result.payoutRecord.status).toBe('paid');
    expect(result.payoutRecord.amount).toBe(1);
  });
});
