jest.mock('jose', () => ({
  createRemoteJWKSet: jest.fn(),
  jwtVerify: jest.fn(),
}));

import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { User } from '../users/user.entity';
import { JwtAuthService } from './jwt-auth.service';
import { TelegramAdminGuard } from './telegram-admin.guard';
import {
  AuthenticatedRequest,
  TelegramAuthGuard,
} from './telegram-auth.guard';
import { TelegramAuthService } from './telegram-auth.service';

const SECRET = 'unit-test-jwt-secret';

function configFrom(values: Record<string, string>): ConfigService {
  return {
    get: (key: string, defaultValue?: string) =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue,
    getOrThrow: (key: string) => {
      if (!Object.prototype.hasOwnProperty.call(values, key)) {
        throw new Error(key);
      }
      return values[key];
    },
  } as unknown as ConfigService;
}

function contextFor(request: AuthenticatedRequest): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

function requestFor(
  headers: Record<string, string>,
  url = '/api/admin/channels',
): AuthenticatedRequest {
  return {
    headers,
    url,
    originalUrl: url,
    query: {},
  } as AuthenticatedRequest;
}

describe('관리자 가드', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const telegramAuth = {
    isAdmin: (id: number) => id === 111,
    validateInitData: () => {
      throw new Error('initData는 이 테스트에서 쓰지 않습니다.');
    },
  } as unknown as TelegramAuthService;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  function build(values: Record<string, string>) {
    const config = configFrom({
      JWT_SECRET: SECRET,
      TELEGRAM_ADMIN_IDS: '111',
      NODE_ENV: 'test',
      DEV_ADMIN_BYPASS: 'false',
      ...values,
    });
    const jwtService = new JwtService({
      secret: SECRET,
      signOptions: { expiresIn: '30d' },
    });
    const jwtAuth = new JwtAuthService(jwtService, config);
    return {
      jwtService,
      jwtAuth,
      authGuard: new TelegramAuthGuard(telegramAuth, jwtAuth, config),
      adminGuard: new TelegramAdminGuard(telegramAuth),
    };
  }

  it('운영(process.env)에서는 X-Dev-Admin 과 X-Demo-Telegram-Id 가 통과하지 않는다', () => {
    process.env.NODE_ENV = 'production';
    const { authGuard } = build({
      NODE_ENV: 'development',
      DEV_ADMIN_BYPASS: 'true',
    });

    const devReq = requestFor({ 'x-dev-admin': 'true' });
    expect(() => authGuard.canActivate(contextFor(devReq))).toThrow(UnauthorizedException);
    expect(devReq.telegramInitData).toBeUndefined();
    expect(devReq.adminSession).toBeUndefined();

    const demoReq = requestFor({ 'x-demo-telegram-id': '111' });
    expect(() => authGuard.canActivate(contextFor(demoReq))).toThrow(
      UnauthorizedException,
    );
    expect(demoReq.telegramInitData).toBeUndefined();
  });

  it('설정 NODE_ENV 가 production 이면 개발 우회가 동작하지 않는다', () => {
    process.env.NODE_ENV = 'test';
    const { authGuard } = build({
      NODE_ENV: 'production',
      DEV_ADMIN_BYPASS: 'true',
    });
    const req = requestFor({ 'x-dev-admin': 'true' });
    expect(() => authGuard.canActivate(contextFor(req))).toThrow(UnauthorizedException);
    expect(req.telegramInitData).toBeUndefined();
  });

  it('운영이 아닐 때만 로컬 개발 우회가 동작한다', () => {
    process.env.NODE_ENV = 'test';
    const { authGuard } = build({
      NODE_ENV: 'test',
      DEV_ADMIN_BYPASS: 'true',
    });
    const req = requestFor({ 'x-dev-admin': 'true' });
    expect(authGuard.canActivate(contextFor(req))).toBe(true);
    expect(req.telegramInitData?.user.id).toBe(111);
  });

  it('X-Admin-Access-Key 헤더는 인증되지 않는다', () => {
    process.env.NODE_ENV = 'test';
    const { authGuard } = build({
      DEV_ADMIN_BYPASS: 'false',
      ADMIN_ACCESS_KEY: 'legacy-key',
    });
    const req = requestFor({ 'x-admin-access-key': 'legacy-key' });
    expect(() => authGuard.canActivate(contextFor(req))).toThrow(UnauthorizedException);
    expect(req.adminSession).toBeUndefined();
  });

  it('만료된 관리자 토큰은 거절한다', () => {
    process.env.NODE_ENV = 'test';
    const { jwtService, jwtAuth, authGuard } = build({ DEV_ADMIN_BYPASS: 'false' });
    const token = jwtService.sign(
      { sub: 'root', role: 'admin' },
      { audience: 'admin', expiresIn: -10 },
    );

    expect(() => jwtAuth.verifyAdmin(token)).toThrow(UnauthorizedException);

    const req = requestFor({ authorization: `Bearer ${token}` });
    expect(() => authGuard.canActivate(contextFor(req))).toThrow(UnauthorizedException);
    expect(req.adminSession).toBeUndefined();
  });

  it('유효한 관리자 JWT 는 TelegramAdminGuard 를 통과한다', () => {
    process.env.NODE_ENV = 'test';
    const { jwtAuth, authGuard, adminGuard } = build({ DEV_ADMIN_BYPASS: 'false' });
    const token = jwtAuth.signAdmin('root');
    const req = requestFor({ authorization: `Bearer ${token}` });

    expect(authGuard.canActivate(contextFor(req))).toBe(true);
    expect(req.adminSession).toBe(true);
    expect(adminGuard.canActivate(contextFor(req))).toBe(true);
  });

  it('링크 미리보기 API 는 로그인 없이 401이다', () => {
    process.env.NODE_ENV = 'test';
    const { authGuard } = build({ DEV_ADMIN_BYPASS: 'false' });
    const paths = [
      '/api/admin/links/inspect',
      '/api/admin/links/inspect/latest',
      '/api/admin/links/inspect/job-id/resume',
      '/api/admin/links/register-many',
      '/api/admin/channels/lookup',
      '/api/admin/channels/register',
    ];
    for (const url of paths) {
      const req = requestFor({}, url);
      expect(() => authGuard.canActivate(contextFor(req))).toThrow(
        UnauthorizedException,
      );
    }
  });

  it('보상 설정 API 는 로그인 없이 401이다', () => {
    process.env.NODE_ENV = 'test';
    const { authGuard } = build({ DEV_ADMIN_BYPASS: 'false' });
    const paths = [
      '/api/admin/rewards/settings',
      '/api/admin/rewards/methods',
      '/api/admin/rewards/pending-payouts',
      '/api/admin/rewards/records',
      '/api/admin/rewards/channels/ch-1/skip',
      '/api/admin/rewards/records/rec-1/void',
      '/api/admin/rewards/records/rec-1/confirm',
      '/api/admin/rewards/records/rec-1/fail',
      '/api/admin/users',
    ];
    for (const url of paths) {
      const req = requestFor({}, url);
      expect(() => authGuard.canActivate(contextFor(req))).toThrow(
        UnauthorizedException,
      );
    }
  });

  it('발견 API 는 로그인 없이 401이다', () => {
    process.env.NODE_ENV = 'test';
    const { authGuard } = build({ DEV_ADMIN_BYPASS: 'false' });
    const paths = [
      '/api/admin/discovery/queue',
      '/api/admin/discovery/usage',
      '/api/admin/discovery/keywords',
      '/api/admin/discovery/register',
      '/api/admin/discovery/discard',
    ];
    for (const url of paths) {
      const req = requestFor({}, url);
      expect(() => authGuard.canActivate(contextFor(req))).toThrow(
        UnauthorizedException,
      );
    }
  });

  it('수집 운영 API 세 곳은 로그인 없이 401이다', () => {
    process.env.NODE_ENV = 'test';
    const { authGuard } = build({ DEV_ADMIN_BYPASS: 'false' });
    const paths = [
      '/api/admin/stats/runs',
      '/api/admin/stats/ops',
      '/api/admin/stats/run',
    ];
    for (const url of paths) {
      const req = requestFor({}, url);
      expect(() => authGuard.canActivate(contextFor(req))).toThrow(
        UnauthorizedException,
      );
    }
  });

  it('새 어드민 API 다섯 곳은 로그인 없이 401이다', () => {
    process.env.NODE_ENV = 'test';
    const { authGuard } = build({ DEV_ADMIN_BYPASS: 'false' });
    const paths = [
      '/api/admin/dashboard',
      '/api/admin/channels/all',
      '/api/admin/channels/collect',
      '/api/admin/channels/some-id/collect',
      '/api/admin/channels/category',
    ];
    for (const url of paths) {
      const req = requestFor({}, url);
      expect(() => authGuard.canActivate(contextFor(req))).toThrow(
        UnauthorizedException,
      );
    }
  });

  it('텔레그램 관리자 로그인은 유지되고 일반 회원은 관리자 가드에서 막힌다', () => {
    process.env.NODE_ENV = 'test';
    const { jwtAuth, authGuard, adminGuard } = build({ DEV_ADMIN_BYPASS: 'false' });

    const adminToken = jwtAuth.sign({
      telegramId: 111,
      firstName: '관리자',
      username: null,
    } as User);
    const adminReq = requestFor({ authorization: `Bearer ${adminToken}` });
    expect(authGuard.canActivate(contextFor(adminReq))).toBe(true);
    expect(adminReq.adminSession).toBeUndefined();
    expect(adminGuard.canActivate(contextFor(adminReq))).toBe(true);

    const userToken = jwtAuth.sign({
      telegramId: 222,
      firstName: '회원',
      username: null,
    } as User);
    const userReq = requestFor({ authorization: `Bearer ${userToken}` });
    expect(authGuard.canActivate(contextFor(userReq))).toBe(true);
    expect(() => adminGuard.canActivate(contextFor(userReq))).toThrow(ForbiddenException);
  });
});
