import {
  canJoinAnother,
  isJoinableChannelInvite,
  joinedChannelFromUpdates,
  MTPROTO_JOIN_MIN_GAP_MS,
  parseJoinDaily,
} from './mtproto-join.logic';

describe('비공개 채널 자동 가입', () => {
  it('하루 기본 15개, 0이면 끔', () => {
    expect(parseJoinDaily(undefined)).toBe(15);
    expect(parseJoinDaily('')).toBe(15);
    expect(parseJoinDaily('0')).toBe(0);
    expect(parseJoinDaily('20')).toBe(20);
    expect(parseJoinDaily('abc')).toBe(15);
  });

  it('채널형 초대만 가입한다 (그룹·승인 필요·이미 회원 제외)', () => {
    expect(
      isJoinableChannelInvite({ className: 'ChatInvite', broadcast: true }),
    ).toBe(true);
    expect(
      isJoinableChannelInvite({
        className: 'ChatInvite',
        broadcast: true,
        requestNeeded: true,
      }),
    ).toBe(false);
    expect(
      isJoinableChannelInvite({ className: 'ChatInvite', megagroup: true }),
    ).toBe(false);
    expect(isJoinableChannelInvite({ className: 'ChatInviteAlready' })).toBe(
      false,
    );
  });

  it('하루 한도·전체 950·간격 3분을 지킨다', () => {
    const base = {
      joinsToday: 0,
      dailyMax: 15,
      joinedTotal: 0,
      lastJoinAt: 0,
      now: 1_000_000_000,
    };
    expect(canJoinAnother(base)).toBe(true);
    expect(canJoinAnother({ ...base, joinsToday: 15 })).toBe(false);
    expect(canJoinAnother({ ...base, joinedTotal: 950 })).toBe(false);
    expect(canJoinAnother({ ...base, dailyMax: 0 })).toBe(false);
    expect(canJoinAnother({ ...base, blocked: true })).toBe(false);
    expect(canJoinAnother({ ...base, lastJoinAt: base.now - 60_000 })).toBe(
      false,
    );
    expect(
      canJoinAnother({
        ...base,
        lastJoinAt: base.now - MTPROTO_JOIN_MIN_GAP_MS,
      }),
    ).toBe(true);
  });

  it('가입 결과에서 채널을 찾는다', () => {
    expect(
      joinedChannelFromUpdates({
        chats: [
          {
            className: 'Channel',
            id: 5,
            accessHash: 9,
            title: 'A',
            broadcast: true,
          },
        ],
      }),
    ).toEqual({
      id: 5,
      accessHash: 9,
      title: 'A',
      date: undefined,
      megagroup: false,
      broadcast: true,
    });
    expect(joinedChannelFromUpdates({ chats: [] })).toBeNull();
    expect(joinedChannelFromUpdates(null)).toBeNull();
  });
});
