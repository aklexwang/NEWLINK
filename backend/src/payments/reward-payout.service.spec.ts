import { BadRequestException, ConflictException } from '@nestjs/common';
import { DUPLICATE_PAYOUT_MESSAGE, RewardPayoutService } from './reward-payout.service';

function serviceWith(opts?: {
  records?: Array<Record<string, unknown>>;
  channel?: Record<string, unknown>;
}) {
  const records = opts?.records ?? [];
  const recordRepository = {
    find: jest.fn().mockImplementation(async (args?: { where?: { status?: unknown } }) => {
      const status = args?.where?.status;
      if (typeof status === 'string') {
        return records.filter((row) => row.status === status);
      }
      return records;
    }),
    findOneBy: jest.fn().mockImplementation(async (where: { id?: string }) => {
      return records.find((row) => row.id === where.id) ?? null;
    }),
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => row),
  };
  const channelRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOneBy: jest.fn().mockResolvedValue({
      id: 'ch-1',
      submittedBy: 9,
      title: '뉴스',
      link: 'https://t.me/news',
      payoutStatus: 'pending',
      ...(opts?.channel ?? {}),
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
  return { svc, recordRepository, channelRepository };
}

describe('RewardPayoutService 중복 지급', () => {
  it('paid 원장이 있으면 409 메시지를 준다', async () => {
    const { svc } = serviceWith({ records: [{ status: 'paid' }] });
    await expect(
      svc.recordChannelPayout('ch-1', { amountTon: 1, phase: 'paid' }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      svc.recordChannelPayout('ch-1', { amountTon: 1, phase: 'paid' }),
    ).rejects.toMatchObject({ message: DUPLICATE_PAYOUT_MESSAGE });
  });

  it('force=true 이면 이중 기록을 진행한다', async () => {
    const { svc } = serviceWith({ records: [{ status: 'sending' }] });
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

describe('수단별 지급', () => {
  it('USDT는 amount 필드를 소수 4자리로 기록한다', async () => {
    const { svc } = serviceWith();
    const result = await svc.recordChannelPayout('ch-1', {
      amount: 1.23456,
      currency: 'USDT',
      sendMethod: 'external',
      memo: 'tx-1',
    });
    expect(result.payoutRecord.currency).toBe('USDT');
    expect(result.payoutRecord.amount).toBe(1.2346);
    expect(result.payoutRecord.sendMethod).toBe('external');
  });

  it('Stars는 정수만 받는다', async () => {
    const { svc } = serviceWith();
    await expect(
      svc.recordChannelPayout('ch-1', {
        amount: 1.5,
        currency: 'STARS',
        sendMethod: 'manual_gift',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('지급 안 함은 이유가 필요하다', async () => {
    const { svc } = serviceWith();
    await expect(svc.skipPayout('ch-1', '  ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('지급 안 함도 중복이면 409', async () => {
    const { svc } = serviceWith({ records: [{ status: 'paid' }] });
    await expect(svc.skipPayout('ch-1', '중복')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('지급 안 함은 skipped 로 남긴다', async () => {
    const { svc, channelRepository } = serviceWith();
    await svc.skipPayout('ch-1', '중복 제보');
    expect(channelRepository.update).toHaveBeenCalledWith('ch-1', {
      payoutStatus: 'skipped',
      payoutSkipReason: '중복 제보',
    });
  });

  it('sending 확정은 TX가 필요하다', async () => {
    const { svc } = serviceWith({
      records: [{ id: 'rec-1', channelId: 'ch-1', status: 'sending', amount: 1 }],
    });
    await expect(svc.confirmRecord('rec-1', '')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('sending 을 paid 로 확정한다', async () => {
    const record = {
      id: 'rec-1',
      channelId: 'ch-1',
      status: 'sending',
      amount: 2,
      currency: 'TON',
      sendMethod: 'tonconnect',
      walletAddress: 'EQ',
      txOrMemo: null,
    };
    const { svc } = serviceWith({ records: [record] });
    const result = await svc.confirmRecord('rec-1', 'abc123');
    expect(result.payoutRecord.status).toBe('paid');
    expect(result.payoutRecord.txOrMemo).toBe('abc123');
  });

  it('sending 을 실패 처리한다', async () => {
    const record = {
      id: 'rec-1',
      channelId: 'ch-1',
      status: 'sending',
      amount: 2,
      currency: 'TON',
    };
    const { svc } = serviceWith({ records: [record] });
    const result = await svc.failRecord('rec-1', '지갑 취소');
    expect(result.payoutRecord.status).toBe('failed');
  });

  it('void 는 삭제하지 않고 상태를 바꾼다', async () => {
    const record = {
      id: 'rec-1',
      channelId: 'ch-1',
      status: 'paid',
      currency: 'TON',
      amount: 1,
    };
    const { svc, recordRepository } = serviceWith({ records: [record] });
    const saved = await svc.voidRecord('rec-1', '잘못 기록');
    expect(saved.status).toBe('void');
    expect(recordRepository.save).toHaveBeenCalled();
    expect(recordRepository.find).toHaveBeenCalled();
  });

  it('회원 합계는 paid 만 더한다', async () => {
    const { svc } = serviceWith({
      records: [
        { telegramId: 9, status: 'paid', currency: 'TON', amount: 1.5 },
        { telegramId: 9, status: 'paid', currency: 'USDT', amount: 2 },
        { telegramId: 9, status: 'paid', currency: 'STARS', amount: 50 },
        { telegramId: 9, status: 'sending', currency: 'TON', amount: 9 },
        { telegramId: 9, status: 'void', currency: 'TON', amount: 3 },
      ],
    });
    const totals = await svc.paidTotalsByTelegramId();
    expect(totals['9']).toEqual({
      payoutCount: 3,
      payoutTon: 1.5,
      payoutUsdt: 2,
      payoutStars: 50,
    });
  });
});
