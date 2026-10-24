import { HttpException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcrypt';
import {
  ADMIN_LOGIN_INVALID_MESSAGE,
  ADMIN_LOGIN_LOCKED_MESSAGE,
  AdminLoginService,
} from './admin-login.service';
import { ADMIN_JWT_AUDIENCE, JwtAuthService } from './jwt-auth.service';

const SECRET = 'unit-test-jwt-secret';
const USERNAME = 'admin';
const PASSWORD = 'correct-horse';

describe('관리자 로그인', () => {
  let passwordHash = '';

  beforeAll(async () => {
    passwordHash = await hash(PASSWORD, 4);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createService(extra: Record<string, string> = {}) {
    const values: Record<string, string> = {
      JWT_SECRET: SECRET,
      ADMIN_USERNAME: USERNAME,
      ADMIN_PASSWORD_HASH: passwordHash,
      ...extra,
    };
    const config = {
      get: (key: string, defaultValue?: string) =>
        Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue,
      getOrThrow: (key: string) => {
        if (!Object.prototype.hasOwnProperty.call(values, key)) {
          throw new Error(key);
        }
        return values[key];
      },
    } as unknown as ConfigService;
    const jwtService = new JwtService({
      secret: SECRET,
      signOptions: { expiresIn: '30d' },
    });
    const jwtAuth = new JwtAuthService(jwtService, config);
    return {
      service: new AdminLoginService(config, jwtAuth),
      jwtService,
      jwtAuth,
    };
  }

  it('아이디와 비밀번호가 맞으면 12시간짜리 관리자 JWT 를 발급한다', async () => {
    const { service, jwtService, jwtAuth } = createService();
    const result = await service.login(USERNAME, PASSWORD, '203.0.113.8');
    const decoded = jwtService.decode(result.accessToken) as {
      role: string;
      aud: string;
      sub: string;
      exp: number;
      iat: number;
    };

    expect(decoded.role).toBe('admin');
    expect(decoded.aud).toBe(ADMIN_JWT_AUDIENCE);
    expect(decoded.sub).toBe(USERNAME);
    expect(decoded.exp - decoded.iat).toBe(12 * 60 * 60);
    expect(jwtAuth.verifyAdmin(result.accessToken).role).toBe('admin');
    expect(() => jwtAuth.verify(result.accessToken)).toThrow(UnauthorizedException);
  });

  it('아이디나 비밀번호가 틀리면 같은 오류를 낸다', async () => {
    const { service } = createService();

    await expect(service.login('other', PASSWORD, '203.0.113.9')).rejects.toThrow(
      ADMIN_LOGIN_INVALID_MESSAGE,
    );
    await expect(service.login(USERNAME, 'wrong-password', '203.0.113.10')).rejects.toThrow(
      ADMIN_LOGIN_INVALID_MESSAGE,
    );
  });

  it('같은 IP 에서 5번 실패하면 15분 동안 로그인을 막는다', async () => {
    const start = 1_700_000_000_000;
    jest.spyOn(Date, 'now').mockReturnValue(start);
    const { service } = createService();
    const ip = '198.51.100.20';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(service.login(USERNAME, 'wrong-password', ip)).rejects.toThrow(
        ADMIN_LOGIN_INVALID_MESSAGE,
      );
    }

    try {
      await service.login(USERNAME, PASSWORD, ip);
      throw new Error('잠긴 뒤에도 로그인되었습니다.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
      expect((error as HttpException).message).toBe(ADMIN_LOGIN_LOCKED_MESSAGE);
    }

    const otherIp = await service.login(USERNAME, PASSWORD, '198.51.100.21');
    expect(otherIp.accessToken).toEqual(expect.any(String));

    jest.spyOn(Date, 'now').mockReturnValue(start + 15 * 60 * 1000 - 1);
    await expect(service.login(USERNAME, PASSWORD, ip)).rejects.toThrow(
      ADMIN_LOGIN_LOCKED_MESSAGE,
    );

    jest.spyOn(Date, 'now').mockReturnValue(start + 15 * 60 * 1000);
    const unlocked = await service.login(USERNAME, PASSWORD, ip);
    expect(unlocked.accessToken).toEqual(expect.any(String));
  });
});
