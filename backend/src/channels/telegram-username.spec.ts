import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
  usernameFromChannelLink,
  usernameToFillFromLink,
  usernamesToFillFromLinks,
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
    expect(usernameFromChannelLink('https://t.me/chasul_trader')).toBe(
      'chasul_trader',
    );
    expect(usernameFromChannelLink('https://t.me/+xxxx')).toBeNull();
  });

  it('비어 있는 username 만 link 에서 채운다', () => {
    expect(
      usernameToFillFromLink(null, 'https://t.me/chasul_trader'),
    ).toBe('chasul_trader');
    expect(
      usernameToFillFromLink('  ', 'https://t.me/chasul_trader'),
    ).toBe('chasul_trader');
    expect(
      usernameToFillFromLink('kept', 'https://t.me/chasul_trader'),
    ).toBeNull();
    expect(usernameToFillFromLink(null, 'https://t.me/+invite')).toBeNull();
    expect(
      usernamesToFillFromLinks([
        { id: '1', username: null, link: 'https://t.me/chasul_trader' },
        { id: '2', username: 'already', link: 'https://t.me/durov' },
        { id: '3', username: null, link: 'https://t.me/+xxxx' },
      ]),
    ).toEqual([{ id: '1', username: 'chasul_trader' }]);
  });
});
