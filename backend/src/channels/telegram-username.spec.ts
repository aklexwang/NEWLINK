import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from './telegram-username';

describe('초대 링크 분류', () => {
  it('joinchat·플러스 초대는 invite_only 대상이다', () => {
    expect(isInviteOnlyLink('https://t.me/+7ljzi2uA2bE0NzNl')).toBe(true);
    expect(isInviteOnlyLink('https://t.me/joinchat/AAAA')).toBe(true);
    expect(isInviteOnlyLink('https://t.me/durov')).toBe(false);
  });

  it('초대 링크에서는 username 을 뽑지 않는다', () => {
    expect(extractTelegramUsernameFromLink('https://t.me/+xxxx')).toBeNull();
    expect(extractTelegramUsernameFromLink('https://t.me/durov')).toBe('durov');
  });
});
