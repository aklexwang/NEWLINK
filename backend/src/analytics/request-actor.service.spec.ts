import type { Request } from 'express';
import type { JwtAuthService } from '../auth/jwt-auth.service';
import type { TelegramAuthService } from '../auth/telegram-auth.service';
import { RequestActorService } from './request-actor.service';

// telegram-auth.service 가 ESM 패키지(jose)를 불러와 Jest 에서 읽히지 않으므로 자리만 대신 둔다.
jest.mock('../auth/telegram-auth.service', () => ({
  TelegramAuthService: class TelegramAuthService {},
}));

function req(headers: Record<string, string>, ip = '203.0.113.1'): Request {
  return { ip, headers, socket: { remoteAddress: ip } } as unknown as Request;
}

describe('RequestActorService', () => {
  const jwt = {
    tryVerifyAdmin: jest.fn((token: string) =>
      token === 'admin-token' ? { sub: 'admin', role: 'admin' } : null,
    ),
    verify: jest.fn((token: string) => {
      if (token === 'member-token') return { telegramId: 777 };
      if (token === 'staff-token') return { telegramId: 111 };
      throw new Error('invalid');
    }),
  };
  const telegram = {
    isAdmin: jest.fn((id: number) => id === 111),
    validateInitData: jest.fn((initData: string) => {
      if (initData === 'good') return { user: { id: 888 } };
      throw new Error('invalid');
    }),
  };
  const service = new RequestActorService(
    jwt as unknown as JwtAuthService,
    telegram as unknown as TelegramAuthService,
  );

  it('토큰이 없으면 비로그인·비관리자, IP·UA 를 읽는다', () => {
    const actor = service.resolve(
      req({ 'user-agent': 'UA', 'accept-language': 'ko' }),
    );
    expect(actor).toEqual({
      isAdmin: false,
      memberId: null,
      ip: '203.0.113.1',
      userAgent: 'UA',
      acceptLanguage: 'ko',
    });
  });

  it('관리자 JWT 는 관리자', () => {
    expect(
      service.resolve(req({ authorization: 'Bearer admin-token' })).isAdmin,
    ).toBe(true);
  });

  it('회원 JWT 는 회원 ID, 관리자 ID 의 회원 JWT 는 관리자', () => {
    const member = service.resolve(
      req({ authorization: 'Bearer member-token' }),
    );
    expect(member).toMatchObject({ isAdmin: false, memberId: 777 });
    const staff = service.resolve(req({ authorization: 'Bearer staff-token' }));
    expect(staff).toMatchObject({ isAdmin: true, memberId: 111 });
  });

  it('잘못된 토큰·initData 는 오류 없이 비로그인으로 본다', () => {
    expect(
      service.resolve(req({ authorization: 'Bearer broken' })),
    ).toMatchObject({ isAdmin: false, memberId: null });
    expect(
      service.resolve(req({ 'x-telegram-init-data': 'bad' })),
    ).toMatchObject({ isAdmin: false, memberId: null });
  });

  it('initData 로 회원 ID 를 얻는다', () => {
    expect(
      service.resolve(req({ 'x-telegram-init-data': 'good' })),
    ).toMatchObject({ isAdmin: false, memberId: 888 });
  });
});
