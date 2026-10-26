import { inviteHashFromLink } from '../channels/telegram-username';
import { memberChatFromInvite } from './mtproto-access.logic';

describe('초대 링크 방 (가입 없이, 이미 회원일 때만)', () => {
  it('초대 링크 해시', () => {
    expect(inviteHashFromLink('https://t.me/+AbCd_123-xY')).toBe('AbCd_123-xY');
    expect(inviteHashFromLink('t.me/joinchat/AAAAAEhy12')).toBe('AAAAAEhy12');
    expect(inviteHashFromLink('https://t.me/public_name')).toBeNull();
  });

  it('이미 회원(ChatInviteAlready)이면 채널을 돌려준다', () => {
    const chat = memberChatFromInvite({
      className: 'ChatInviteAlready',
      chat: {
        className: 'Channel',
        id: 123n,
        accessHash: 456n,
        title: '표검사',
        broadcast: true,
      },
    });
    expect(chat).toMatchObject({
      id: 123n,
      accessHash: 456n,
      title: '표검사',
      broadcast: true,
    });
  });

  it('회원이 아니면(ChatInvite) null — 가입하지 않는다', () => {
    expect(
      memberChatFromInvite({
        className: 'ChatInvite',
        title: '표검사',
        participantsCount: 4000,
      }),
    ).toBeNull();
    expect(memberChatFromInvite(null)).toBeNull();
  });
});
