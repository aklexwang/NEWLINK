import {
  canJoinAnother,
  canSendJoinRequest,
  inviteMetadata,
  isJoinableChannelInvite,
  isRequestNeededChannel,
  JOIN_REQUEST_DAILY_DEFAULT,
  joinedChannelFromUpdates,
  joinRequestState,
  MTPROTO_JOIN_MIN_GAP_MS,
  parseJoinDaily,
  wasJoinRequestSent,
} from './mtproto-join.logic';

describe('입장 요청(승인 필요 방)', () => {
  it('isRequestNeededChannel: 승인 필요 + 채널이면 true', () => {
    expect(
      isRequestNeededChannel({ className: 'ChatInvite', requestNeeded: true, broadcast: true }),
    ).toBe(true);
  });
  it('isRequestNeededChannel: 승인 불필요·그룹·이미회원은 false', () => {
    expect(isRequestNeededChannel({ className: 'ChatInvite', requestNeeded: false, broadcast: true })).toBe(false);
    expect(isRequestNeededChannel({ className: 'ChatInvite', requestNeeded: true, megagroup: true })).toBe(false);
    expect(isRequestNeededChannel({ className: 'ChatInviteAlready' })).toBe(false);
  });

  it('wasJoinRequestSent: INVITE_REQUEST_SENT 에러면 true', () => {
    expect(wasJoinRequestSent(new Error('INVITE_REQUEST_SENT'))).toBe(true);
    expect(wasJoinRequestSent({ errorMessage: 'INVITE_REQUEST_SENT' })).toBe(true);
    expect(wasJoinRequestSent(new Error('FLOOD_WAIT_300'))).toBe(false);
  });

  it('joinRequestState: 요청없음/대기/승인/미승인', () => {
    const now = new Date('2026-11-20T00:00:00Z');
    expect(joinRequestState({ joinRequestedAt: null, hasAccess: false, now })).toBe('none');
    expect(joinRequestState({ joinRequestedAt: new Date('2026-11-19'), hasAccess: false, now })).toBe('pending');
    expect(joinRequestState({ joinRequestedAt: new Date('2026-11-01'), hasAccess: false, now })).toBe('unanswered');
    // 승인되면 멤버가 되어 access 가 생김
    expect(joinRequestState({ joinRequestedAt: new Date('2026-11-01'), hasAccess: true, now })).toBe('approved');
  });

  it('canSendJoinRequest: 한도·간격·중복 확인', () => {
    const base = { requestsToday: 0, dailyMax: JOIN_REQUEST_DAILY_DEFAULT, lastRequestAt: 0, now: 1_000_000_000, alreadyRequested: false };
    expect(canSendJoinRequest(base)).toBe(true);
    expect(canSendJoinRequest({ ...base, alreadyRequested: true })).toBe(false);
    expect(canSendJoinRequest({ ...base, requestsToday: 5 })).toBe(false);
    expect(canSendJoinRequest({ ...base, dailyMax: 0 })).toBe(false);
    // 간격 미달
    expect(canSendJoinRequest({ ...base, lastRequestAt: base.now - 60_000 })).toBe(false);
    // 간격 충분
    expect(canSendJoinRequest({ ...base, lastRequestAt: base.now - 6 * 60_000 })).toBe(true);
  });
});

describe('inviteMetadata (A안: 회원 아님 비공개방 공개 정보)', () => {
  it('ChatInvite 에서 제목·소개·참여자수를 뽑는다', () => {
    expect(
      inviteMetadata({
        className: 'ChatInvite',
        title: '공익제보 표검사 채널',
        about: '공익 채널',
        participantsCount: 7500,
      }),
    ).toEqual({ title: '공익제보 표검사 채널', about: '공익 채널', participantsCount: 7500 });
  });

  it('공백·0·없음은 null 로', () => {
    expect(
      inviteMetadata({ className: 'ChatInvite', title: '  ', participantsCount: 0 }),
    ).toBeNull();
  });

  it('일부만 있어도 그 값만 담는다', () => {
    expect(
      inviteMetadata({ className: 'ChatInvite', participantsCount: 1200 }),
    ).toEqual({ title: null, about: null, participantsCount: 1200 });
  });

  it('이미 회원(ChatInviteAlready)·엿보기(ChatInvitePeek)·엉뚱한 값은 null (그쪽은 전체 정보를 읽음)', () => {
    expect(inviteMetadata({ className: 'ChatInviteAlready' })).toBeNull();
    expect(inviteMetadata({ className: 'ChatInvitePeek' })).toBeNull();
    expect(inviteMetadata(null)).toBeNull();
    expect(inviteMetadata('x')).toBeNull();
  });
});

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

describe('inviteRequestNeededFrom', () => {
  it('비회원 초대: 승인 필요 여부, 회원·엿보기는 모름', () => {
    const { inviteRequestNeededFrom } = jest.requireActual('./mtproto-join.logic');
    expect(inviteRequestNeededFrom({ className: 'ChatInvite', requestNeeded: true })).toBe(true);
    expect(inviteRequestNeededFrom({ className: 'ChatInvite' })).toBe(false);
    expect(inviteRequestNeededFrom({ className: 'ChatInviteAlready' })).toBeUndefined();
    expect(inviteRequestNeededFrom(null)).toBeUndefined();
  });
});
