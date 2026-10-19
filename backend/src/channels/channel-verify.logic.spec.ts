import {
  decideVerifiedRecheck,
  isOurBotAdministrator,
  isRequesterChannelAdmin,
  parseBotUserIdFromToken,
  type RecheckContext,
  type TelegramChatAdministrator,
} from './channel-verify.logic';

const admins = [
  { status: 'creator', user: { id: 111, is_bot: false, username: 'owner' } },
  {
    status: 'administrator',
    user: { id: 8863933040, is_bot: true, username: 'newlinkcom_bot' },
  },
  {
    status: 'administrator',
    user: { id: 222, is_bot: false, username: 'mod' },
  },
  { status: 'member', user: { id: 333, is_bot: false, username: 'viewer' } },
];

describe('channel-verify.logic', () => {
  it('봇 토큰에서 숫자 ID를 읽는다', () => {
    expect(parseBotUserIdFromToken('123456:AA-secret')).toBe(123456);
    expect(parseBotUserIdFromToken('bad')).toBeNull();
  });

  it('우리 봇이 관리자인지 본다', () => {
    expect(isOurBotAdministrator(admins, 8863933040, 'newlinkcom_bot')).toBe(
      true,
    );
    expect(isOurBotAdministrator(admins, 1, 'other_bot')).toBe(false);
  });

  it('요청자가 creator/administrator인지 본다', () => {
    expect(isRequesterChannelAdmin(admins, 111)).toBe(true);
    expect(isRequesterChannelAdmin(admins, 222)).toBe(true);
    expect(isRequesterChannelAdmin(admins, 333)).toBe(false);
    expect(isRequesterChannelAdmin(admins, 999)).toBe(false);
  });
});

describe('decideVerifiedRecheck', () => {
  const ctx: RecheckContext = {
    botId: 8863933040,
    botUsername: 'newlinkcom_bot',
    ownerTelegramId: 111,
  };

  const ok = (list: TelegramChatAdministrator[]) => ({
    kind: 'http' as const,
    status: 200,
    body: { ok: true, result: list },
  });

  it('봇과 소유자가 관리자면 유지를 한다', () => {
    expect(decideVerifiedRecheck(ok(admins), ctx)).toBe('keep');
  });

  it('우리 봇이 관리자가 아니면 인증을 해제한다', () => {
    const withoutBot = admins.filter((a) => a.user?.id !== 8863933040);
    expect(decideVerifiedRecheck(ok(withoutBot), ctx)).toBe('unverify');
  });

  it('소유자가 관리자가 아니면 인증을 해제한다', () => {
    expect(
      decideVerifiedRecheck(ok(admins), { ...ctx, ownerTelegramId: 999 }),
    ).toBe('unverify');
  });

  it('소유자 텔레그램 ID가 없으면 인증을 해제한다', () => {
    expect(
      decideVerifiedRecheck(ok(admins), { ...ctx, ownerTelegramId: null }),
    ).toBe('unverify');
  });

  it('네트워크 오류는 인증을 유지하고 재시도한다', () => {
    expect(decideVerifiedRecheck({ kind: 'network' }, ctx)).toBe('retry');
  });

  it('429와 5xx는 인증을 유지하고 재시도한다', () => {
    expect(
      decideVerifiedRecheck(
        {
          kind: 'http',
          status: 429,
          body: {
            ok: false,
            error_code: 429,
            description: 'Too Many Requests',
          },
        },
        ctx,
      ),
    ).toBe('retry');
    expect(
      decideVerifiedRecheck(
        {
          kind: 'http',
          status: 502,
          body: { ok: false, description: 'Bad Gateway' },
        },
        ctx,
      ),
    ).toBe('retry');
  });

  it('봇 권한 상실 응답은 인증을 해제한다', () => {
    expect(
      decideVerifiedRecheck(
        {
          kind: 'http',
          status: 400,
          body: {
            ok: false,
            error_code: 400,
            description: 'Bad Request: not enough rights',
          },
        },
        ctx,
      ),
    ).toBe('unverify');
    expect(
      decideVerifiedRecheck(
        {
          kind: 'http',
          status: 400,
          body: {
            ok: false,
            error_code: 400,
            description: 'Bad Request: chat not found',
          },
        },
        ctx,
      ),
    ).toBe('unverify');
  });

  it('알 수 없는 API 오류는 인증을 유지하고 재시도한다', () => {
    expect(
      decideVerifiedRecheck(
        {
          kind: 'http',
          status: 401,
          body: { ok: false, error_code: 401, description: 'Unauthorized' },
        },
        ctx,
      ),
    ).toBe('retry');
  });
});
