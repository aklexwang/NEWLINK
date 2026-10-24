import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hashSync } from 'bcrypt';
import { randomBytes, timingSafeEqual } from 'crypto';
import { JwtAuthService } from './jwt-auth.service';

export const ADMIN_LOGIN_INVALID_MESSAGE =
  '아이디 또는 비밀번호가 올바르지 않습니다';
export const ADMIN_LOGIN_LOCKED_MESSAGE = '잠시 후 다시 시도하세요';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

type Attempt = {
  failures: number;
  lockedUntil: number | null;
  updatedAt: number;
};

/** 길이가 달라도 timingSafeEqual 을 한 번은 호출한다. */
export function timingSafeEqualString(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

@Injectable()
export class AdminLoginService {
  private readonly attempts = new Map<string, Attempt>();
  private dummyHash: string | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtAuthService: JwtAuthService,
  ) {}

  async login(
    username: string,
    password: string,
    ip: string,
  ): Promise<{ accessToken: string }> {
    const key = ip.trim() || 'unknown';
    this.dropExpired(key);

    if (this.isLocked(key)) {
      throw new HttpException(
        ADMIN_LOGIN_LOCKED_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const matched = await this.credentialsMatch(username, password);
    if (!matched) {
      this.recordFailure(key);
      throw new UnauthorizedException(ADMIN_LOGIN_INVALID_MESSAGE);
    }

    this.attempts.delete(key);
    return {
      accessToken: this.jwtAuthService.signAdmin(username.trim()),
    };
  }

  private isLocked(ip: string): boolean {
    const row = this.attempts.get(ip);
    return Boolean(row?.lockedUntil && Date.now() < row.lockedUntil);
  }

  private dropExpired(ip: string): void {
    const row = this.attempts.get(ip);
    if (!row) return;
    const now = Date.now();
    if (row.lockedUntil && now >= row.lockedUntil) {
      this.attempts.delete(ip);
      return;
    }
    if (!row.lockedUntil && now - row.updatedAt >= LOCK_MS) {
      this.attempts.delete(ip);
    }
  }

  private recordFailure(ip: string): void {
    const now = Date.now();
    const failures = (this.attempts.get(ip)?.failures ?? 0) + 1;
    this.attempts.set(ip, {
      failures,
      lockedUntil: failures >= MAX_FAILURES ? now + LOCK_MS : null,
      updatedAt: now,
    });
  }

  /**
   * 아이디가 틀려도 bcrypt.compare 는 항상 실행한다.
   * 해시가 없으면 더미 해시로 비교해 설정 유무가 시간에 드러나지 않게 한다.
   */
  private async credentialsMatch(
    username: string,
    password: string,
  ): Promise<boolean> {
    const expectedUsername = (
      this.configService.get<string>('ADMIN_USERNAME') ?? ''
    ).trim();
    const configuredHash = cleanHash(
      this.configService.get<string>('ADMIN_PASSWORD_HASH') ?? '',
    );
    const hashValid = BCRYPT_HASH.test(configuredHash);
    const hash = hashValid ? configuredHash : this.getDummyHash();

    const usernameOk = timingSafeEqualString(username.trim(), expectedUsername);

    let passwordOk = false;
    try {
      passwordOk = await compare(password, hash);
    } catch {
      passwordOk = false;
    }

    return hashValid && expectedUsername.length > 0 && usernameOk && passwordOk;
  }

  private getDummyHash(): string {
    if (!this.dummyHash) {
      this.dummyHash = hashSync(randomBytes(32).toString('hex'), 12);
    }
    return this.dummyHash;
  }
}

function cleanHash(raw: string): string {
  let value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim();
  }
  return value;
}
