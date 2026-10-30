import { toPublicChannel } from './public-channel.logic';

describe('공개 채널 칸 허용 목록', () => {
  it('제보자·보상·광고주·수집 메모는 빼고 화면에 필요한 칸만 남긴다', () => {
    const out = toPublicChannel({
      id: 'x',
      title: '방',
      link: 'https://t.me/a',
      memberCount: 10,
      submittedBy: 123,
      rewardWallet: 'UQ...',
      rewardTonAmount: 1,
      promotionClientTelegramId: 9,
      promotionClientName: '광고주',
      promotionTonAmount: 5,
      verifiedOwnerTelegramId: 7,
      collectError: 'fetch:timeout',
      payoutStatus: 'paid',
    });
    expect(out).toEqual({
      id: 'x',
      title: '방',
      link: 'https://t.me/a',
      memberCount: 10,
    });
  });
});
