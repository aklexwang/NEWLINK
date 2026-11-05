import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';
import { Repository } from 'typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import {
  generateBackupCodes,
  generateOtpSecret,
  otpauthUrl,
  verifyTotp,
} from './admin-otp.logic';

const KEY_SECRET = 'admin_otp_secret';
const KEY_BACKUP = 'admin_otp_backup';
const KEY_LAST_STEP = 'admin_otp_last_step';
const PENDING_MS = 10 * 60 * 1000;

/**
 * 관리자 로그인 2단계(Google OTP).
 * 비밀키는 app_settings 에 암호화해 저장 (키: JWT_SECRET 에서 만든 값). 백업 코드는 해시만 저장.
 * 휴대폰을 잃으면 Render 에 ADMIN_OTP_OFF=true 를 넣어 잠시 끄고 다시 등록한다.
 */
@Injectable()
export class AdminOtpService {
  private readonly logger = new Logger(AdminOtpService.name);
  /** 등록 중인 비밀키 (확인 전, 서버 메모리에만 10분) */
  private pending: { secret: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(AppSetting)
    private readonly settings: Repository<AppSetting>,
  ) {}

  private forcedOff(): boolean {
    const raw = (this.config.get<string>('ADMIN_OTP_OFF') ?? '')
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  private key(): Buffer {
    const base = this.config.get<string>('JWT_SECRET') ?? '';
    return createHash('sha256').update(`admin-otp:${base}`).digest();
  }

  private encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, ct].map((b) => b.toString('base64')).join('.');
  }

  private decrypt(stored: string): string | null {
    try {
      const [iv, tag, ct] = stored
        .split('.')
        .map((p) => Buffer.from(p, 'base64'));
      const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString(
        'utf8',
      );
    } catch {
      return null;
    }
  }

  private hashBackup(code: string): string {
    return createHash('sha256')
      .update(`backup:${code}:${this.config.get<string>('JWT_SECRET') ?? ''}`)
      .digest('hex')
      .slice(0, 20);
  }

  private async get(key: string): Promise<string | null> {
    const row = await this.settings.findOne({ where: { key } });
    return row?.value ?? null;
  }

  private async put(key: string, value: string): Promise<void> {
    await this.settings.save({ key, value });
  }

  /** 등록돼 있고 강제로 끄지 않았으면 로그인에 OTP 필요 */
  async isRequired(): Promise<boolean> {
    if (this.forcedOff()) return false;
    return Boolean(await this.get(KEY_SECRET));
  }

  async status() {
    const registered = Boolean(await this.get(KEY_SECRET));
    const backup = (await this.get(KEY_BACKUP)) ?? '';
    return {
      registered,
      forcedOff: this.forcedOff(),
      backupLeft: backup ? backup.split(',').filter(Boolean).length : 0,
    };
  }

  /** 1단계: 새 비밀키를 만들어 QR 주소와 함께 돌려준다 (아직 저장 안 함) */
  startSetup(account: string): { secret: string; otpauthUrl: string } {
    const secret = generateOtpSecret();
    this.pending = { secret, expiresAt: Date.now() + PENDING_MS };
    return { secret, otpauthUrl: otpauthUrl(secret, account || 'admin') };
  }

  /** 2단계: 앱에 뜬 6자리가 맞으면 저장하고 백업 코드 10개를 한 번만 돌려준다 */
  async confirmSetup(
    code: string,
  ): Promise<{ ok: boolean; backupCodes?: string[] }> {
    const pending = this.pending;
    if (!pending || pending.expiresAt < Date.now()) return { ok: false };
    const step = verifyTotp(pending.secret, code);
    if (step == null) return { ok: false };
    const backupCodes = generateBackupCodes();
    await this.put(KEY_SECRET, this.encrypt(pending.secret));
    await this.put(
      KEY_BACKUP,
      backupCodes.map((c) => this.hashBackup(c)).join(','),
    );
    await this.put(KEY_LAST_STEP, String(step));
    this.pending = null;
    this.logger.warn('관리자 OTP 를 등록했습니다.');
    return { ok: true, backupCodes };
  }

  /** 로그인 2단계: 6자리 OTP 또는 8자리 백업 코드(한 번만) */
  async verifyLogin(code: string): Promise<boolean> {
    const stored = await this.get(KEY_SECRET);
    if (!stored) return true;
    const digits = (code ?? '').replace(/\s/g, '');
    if (/^\d{8}$/.test(digits)) return this.useBackupCode(digits);
    const secret = this.decrypt(stored);
    if (!secret) {
      this.logger.error(
        '관리자 OTP 비밀키를 풀지 못했어요 (JWT_SECRET 이 바뀌었나요?)',
      );
      return false;
    }
    const lastRaw = await this.get(KEY_LAST_STEP);
    const lastUsedStep = lastRaw ? Number(lastRaw) : null;
    const step = verifyTotp(secret, digits, { lastUsedStep });
    if (step == null) return false;
    await this.put(KEY_LAST_STEP, String(step));
    return true;
  }

  private async useBackupCode(code: string): Promise<boolean> {
    const list = ((await this.get(KEY_BACKUP)) ?? '')
      .split(',')
      .filter(Boolean);
    const hash = this.hashBackup(code);
    const index = list.indexOf(hash);
    if (index < 0) return false;
    list.splice(index, 1);
    await this.put(KEY_BACKUP, list.join(','));
    this.logger.warn(`관리자 OTP 백업 코드를 썼어요 (남은 ${list.length}개)`);
    return true;
  }

  /** OTP 끄기: 지금 OTP(또는 백업 코드)가 맞아야 한다 */
  async disable(code: string): Promise<boolean> {
    if (!(await this.verifyLogin(code))) return false;
    await this.settings.delete({ key: KEY_SECRET });
    await this.settings.delete({ key: KEY_BACKUP });
    await this.settings.delete({ key: KEY_LAST_STEP });
    this.logger.warn('관리자 OTP 를 껐습니다.');
    return true;
  }
}
