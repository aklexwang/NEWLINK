import {
  activityFromMessageIds,
  activityInWindow,
  assertMtprotoMethodAllowed,
  canSpendMtprotoRequest,
  deletedMessageIds,
  floodWaitMs,
  GROUP_ACTIVITY_WEEK_MS,
  isMtprotoMethodAllowed,
  MTPROTO_ALLOWED_METHODS,
  MTPROTO_DEFAULT_DAILY_LIMIT,
  MTPROTO_FORBIDDEN_METHODS,
  retryAfterFloodWait,
  shouldSaveMtprotoPosts,
  summarizeGroupHistory,
  unixSecondsToDate,
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

  it('최신 번호에서 기준 번호를 뺀 값을 활동량으로 씁니다', () => {
    expect(activityFromMessageIds(1500, 1000)).toBe(500);
    expect(activityFromMessageIds(1000, 1000)).toBe(0);
    expect(activityFromMessageIds(900, 1000)).toBe(0);
    expect(activityFromMessageIds(null, 1000)).toBe(0);
  });

  it('7일 안에 메시지가 없으면 활동량은 0입니다', () => {
    const now = Date.parse('2026-10-22T12:00:00+09:00');
    expect(
      activityInWindow({
        latestId: 8800,
        latestPostedAtMs: now - 10 * 24 * 60 * 60 * 1000,
        baselineId: 8000,
        windowMs: GROUP_ACTIVITY_WEEK_MS,
        nowMs: now,
      }),
    ).toBe(0);
    expect(
      activityInWindow({
        latestId: 8800,
        latestPostedAtMs: now - 2 * 60 * 60 * 1000,
        baselineId: 8000,
        windowMs: GROUP_ACTIVITY_WEEK_MS,
        nowMs: now,
      }),
    ).toBe(800);
  });

  it('초·밀리초·bigint 시각을 같은 날짜로 읽습니다', () => {
    const sec = 1_761_000_000;
    const fromSec = unixSecondsToDate(sec);
    const fromMs = unixSecondsToDate(sec * 1000);
    const fromBig = unixSecondsToDate(BigInt(sec));
    expect(fromSec?.getTime()).toBe(sec * 1000);
    expect(fromMs?.getTime()).toBe(sec * 1000);
    expect(fromBig?.getTime()).toBe(sec * 1000);
  });

  it('그룹 언어는 본문을 저장하지 않고 비율만 남깁니다', () => {
    const now = Date.parse('2026-10-22T12:00:00+09:00');
    const hour = 60 * 60 * 1000;
    const english = [
      'Official support chat for Crypto.com',
      'Please follow the rules of this group',
      'Price discussion only in the market channel',
      'Welcome new members to the community',
      'Do not share referral links here thanks',
    ];
    const messages = english.map((message, i) => ({
      className: 'Message',
      date: Math.floor((now - i * hour) / 1000),
      message,
      fromId: { className: 'PeerUser', userId: 99 },
    }));
    const summary = summarizeGroupHistory(messages, {
      title: 'Crypto.com',
      description: 'Official group',
      nowMs: now,
    });
    expect(summary.language).toBe('foreign');
    expect(summary.hangulRatio).not.toBeNull();
    expect(summary.hangulRatio ?? 1).toBeLessThan(0.03);
    const dumped = JSON.stringify(summary);
    expect(dumped).not.toMatch(/Official support/);
    expect(dumped).not.toMatch(/referral/);
    expect(dumped).not.toMatch(/PeerUser/);
    expect(summary).not.toHaveProperty('excerpts');
    expect(summary).not.toHaveProperty('posts');
  });

  it('그룹 메시지가 5개 미만이면 unknown 을 유지합니다', () => {
    const summary = summarizeGroupHistory(
      [
        {
          className: 'Message',
          date: Math.floor(Date.now() / 1000),
          message: 'hello',
        },
      ],
      { title: 'Crypto.com', description: 'Official group' },
    );
    expect(summary.language).toBe('unknown');
    expect(summary.hangulRatio).toBeNull();
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
