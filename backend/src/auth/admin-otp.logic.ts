import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** Google OTP(TOTP, RFC 6238): 30초 · 6자리 · SHA1 */
export const OTP_STEP_SECONDS = 30;
export const OTP_DIGITS = 6;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | BASE32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 새 비밀키 (160비트, base32 32글자) */
export function generateOtpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', base32Decode(secret))
    .update(counter)
    .digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(code % 10 ** OTP_DIGITS).padStart(OTP_DIGITS, '0');
}

export function currentStep(nowMs = Date.now()): number {
  return Math.floor(nowMs / 1000 / OTP_STEP_SECONDS);
}

/**
 * 맞으면 맞은 시간 칸(step)을 돌려준다. 휴대폰 시계 오차로 앞뒤 1칸(±30초)까지 허용.
 * 이미 쓴 칸(lastUsedStep) 이하는 다시 받지 않는다 (같은 번호 재사용 막기)
 */
export function verifyTotp(
  secret: string,
  code: string,
  options?: { nowMs?: number; lastUsedStep?: number | null; window?: number },
): number | null {
  const digits = (code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(digits)) return null;
  const now = currentStep(options?.nowMs);
  const window = options?.window ?? 1;
  for (let d = -window; d <= window; d += 1) {
    const step = now + d;
    if (options?.lastUsedStep != null && step <= options.lastUsedStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    const given = Buffer.from(digits);
    if (expected.length === given.length && timingSafeEqual(expected, given)) {
      return step;
    }
  }
  return null;
}

/** 구글 OTP 앱이 읽는 주소 (QR 내용) */
export function otpauthUrl(
  secret: string,
  account: string,
  issuer = 'TellLink',
): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${OTP_DIGITS}&period=${OTP_STEP_SECONDS}`;
}

/** 백업 코드: 8자리 숫자 10개 (한 번씩만) */
export function generateBackupCodes(count = 10): string[] {
  const codes: string[] = [];
  while (codes.length < count) {
    const n = randomBytes(4).readUInt32BE() % 100_000_000;
    const code = String(n).padStart(8, '0');
    if (!codes.includes(code)) codes.push(code);
  }
  return codes;
}
