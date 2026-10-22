import {
  assertMtprotoMethodAllowed,
  canSpendMtprotoRequest,
  countGroupActivityFromHistory,
  deletedMessageIds,
  floodWaitMs,
  isMtprotoMethodAllowed,
  MTPROTO_ALLOWED_METHODS,
  MTPROTO_DEFAULT_DAILY_LIMIT,
  MTPROTO_FORBIDDEN_METHODS,
  retryAfterFloodWait,
  shouldSaveMtprotoPosts,
} from './mtproto-collect.logic';

describe('FloodWait 대기', () => {
  it('seconds 필드를 밀리초로 바꿉니다', () => {
    expect(floodWaitMs({ seconds: 3 })).toBe(3000);
    expect(floodWaitMs({ errorMessage: 'FLOOD_WAIT_12' })).toBe(12000);
    expect(floodWaitMs(new Error('other'))).toBeNull();
  });

  it('한 번 기다린 뒤 재시도합니다', async () => {
    const slept: number[] = [];
    let calls = 0;
    const result = await retryAfterFloodWait(async () => {
      calls += 1;
      if (calls === 1) {
        const error = new Error('FLOOD_WAIT_2');
        (error as Error & { seconds: number }).seconds = 2;
        throw error;
      }
      return 'ok';
    }, async (ms) => {
      slept.push(ms);
    });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(slept).toEqual([2000]);
  });
});

describe('하루 상한', () => {
  it('기본 3000을 넘으면 더 쓰지 않습니다', () => {
    expect(MTPROTO_DEFAULT_DAILY_LIMIT).toBe(3000);
    expect(canSpendMtprotoRequest(2999, 3000)).toBe(true);
    expect(canSpendMtprotoRequest(3000, 3000)).toBe(false);
    expect(canSpendMtprotoRequest(3000)).toBe(false);
  });
});

describe('삭제 글 판별', () => {
  it('가져온 구간 안에서 빠진 번호만 삭제입니다', () => {
    expect(deletedMessageIds([10, 11, 12, 13], [13, 12, 10])).toEqual([11]);
    expect(deletedMessageIds([1, 2, 3], [20, 19])).toEqual([]);
    expect(deletedMessageIds([5, 6], [])).toEqual([]);
  });
});

describe('그룹 활동량', () => {
  it('그룹이면 channel_posts 에 저장하지 않습니다', () => {
    expect(shouldSaveMtprotoPosts('group')).toBe(false);
    expect(shouldSaveMtprotoPosts('channel')).toBe(true);
  });

  it('GetHistory 에서 날짜만 세고 본문·보낸 사람은 결과에 없습니다', () => {
    const now = Date.parse('2026-10-22T12:00:00+09:00');
    const hour = 60 * 60 * 1000;
    const messages = [
      {
        className: 'Message',
        date: Math.floor((now - 2 * hour) / 1000),
        message: '개인 대화 본문',
        fromId: { className: 'PeerUser', userId: 12345 },
        fwdFrom: { fromName: 'someone' },
      },
      {
        className: 'Message',
        date: Math.floor((now - 30 * hour) / 1000),
        message: '일주일 안 메시지',
      },
      {
        className: 'Message',
        date: Math.floor((now - 10 * 24 * hour) / 1000),
        message: '너무 오래된 글',
      },
      {
        className: 'MessageService',
        date: Math.floor((now - hour) / 1000),
        action: { className: 'MessageActionChatAddUser' },
      },
    ];
    const activity = countGroupActivityFromHistory(messages, now);
    expect(activity).toEqual({ activity24h: 1, activity7d: 2 });
    expect(JSON.stringify(activity)).not.toMatch(/개인 대화/);
    expect(JSON.stringify(activity)).not.toMatch(/12345/);
    expect(JSON.stringify(activity)).not.toMatch(/someone/);
  });
});

describe('가입 API 를 호출하지 않는지', () => {
  it('허용 목록에 가입·참여자 조회가 없습니다', () => {
    for (const method of MTPROTO_FORBIDDEN_METHODS) {
      expect(MTPROTO_ALLOWED_METHODS).not.toContain(method);
      expect(isMtprotoMethodAllowed(method)).toBe(false);
      expect(() => assertMtprotoMethodAllowed(method)).toThrow(
        'mtproto:forbidden_method',
      );
    }
    expect(isMtprotoMethodAllowed('channels.JoinChannel')).toBe(false);
    expect(isMtprotoMethodAllowed('channels.GetParticipants')).toBe(false);
    expect(isMtprotoMethodAllowed('contacts.ResolveUsername')).toBe(true);
    expect(isMtprotoMethodAllowed('messages.GetHistory')).toBe(true);
  });
});
