import {
  base32Decode,
  base32Encode,
  generateBackupCodes,
  generateOtpSecret,
  otpauthUrl,
  totpAt,
  verifyTotp,
} from './admin-otp.logic';

describe('admin OTP (TOTP)', () => {
  it('RFC 6238 시험값 (SHA1, 59초 → 287082)', () => {
    const secret = base32Encode(Buffer.from('12345678901234567890'));
    expect(totpAt(secret, Math.floor(59 / 30))).toBe('287082');
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe('081804');
  });

  it('base32 왕복', () => {
    const buf = Buffer.from('hello otp world!!');
    expect(base32Decode(base32Encode(buf)).equals(buf)).toBe(true);
  });

  it('지금 번호는 맞고, 앞뒤 1칸 허용, 다른 번호는 틀림', () => {
    const secret = generateOtpSecret();
    const nowMs = 1_800_000_000_000;
    const step = Math.floor(nowMs / 30000);
    expect(verifyTotp(secret, totpAt(secret, step), { nowMs })).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), { nowMs })).toBe(
      step - 1,
    );
    expect(verifyTotp(secret, totpAt(secret, step - 3), { nowMs })).toBeNull();
    expect(verifyTotp(secret, '12ab56', { nowMs })).toBeNull();
  });

  it('이미 쓴 번호는 다시 못 씀', () => {
    const secret = generateOtpSecret();
    const nowMs = 1_800_000_000_000;
    const step = Math.floor(nowMs / 30000);
    expect(
      verifyTotp(secret, totpAt(secret, step), { nowMs, lastUsedStep: step }),
    ).toBeNull();
  });

  it('QR 주소·백업 코드 모양', () => {
    expect(otpauthUrl('ABC', 'admin')).toContain(
      'otpauth://totp/TellLink%3Aadmin?secret=ABC',
    );
    const codes = generateBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    codes.forEach((c) => expect(c).toMatch(/^\d{8}$/));
  });
});
