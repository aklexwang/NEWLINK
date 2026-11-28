import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { isAdminOnlyCategory } from '../channels/auto-expose.logic';
import { PromoJoinAttempt } from './promo-join-attempt.entity';
import {
  classifyJoinError,
  isJoinDue,
  PROMO_JOIN_DAILY_DEFAULT,
  PROMO_JOIN_DAILY_LIMIT,
} from './promo-join.logic';
import { isPromoActiveHour, kstDayStart } from './promo-rules.logic';
import { PromoTarget } from './promo-target.entity';
import { PromoTelegramService } from './promo-telegram.service';
import { PromoService } from './promo.service';

const KEY = {
  enabled: 'promo.joinEnabled',
  daily: 'promo.joinDaily',
  pausedUntil: 'promo.joinPausedUntil',
  pauseReason: 'promo.joinPauseReason',
} as const;

/** 홍보방으로 보는 카테고리 */
const PROMO_CATEGORY = '홍보';

export type PromoJoinSettings = {
  enabled: boolean;
  daily: number;
  pausedUntil: string | null;
  pauseReason: string | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 홍보 계정 자동 가입: 우리 DB 의 "홍보" 카테고리 공개 그룹에 하루 몇 곳씩 천천히 들어간다.
 * 들어가면 홍보할 방 목록에 꺼진 상태로 추가된다(규칙 확인 후 켠다).
 * 텔레그램이 경고하면 가입만 멈춘다(글 올리기와 따로).
 */
@Injectable()
export class PromoJoinService {
  private readonly logger = new Logger(PromoJoinService.name);
  private joining = false;
  private jitterMin = Math.floor(Math.random() * 30);

  constructor(
    @InjectRepository(PromoJoinAttempt)
    private readonly attempts: Repository<PromoJoinAttempt>,
    @InjectRepository(AppSetting)
    private readonly settingRepo: Repository<AppSetting>,
    @InjectRepository(Channel)
    private readonly channels: Repository<Channel>,
    @InjectRepository(PromoTarget)
    private readonly targets: Repository<PromoTarget>,
    private readonly telegram: PromoTelegramService,
    private readonly promo: PromoService,
  ) {}

  async getSettings(): Promise<PromoJoinSettings> {
    const rows = await this.settingRepo.find({
      where: { key: In(Object.values(KEY)) },
    });
    const m = new Map(rows.map((r) => [r.key, r.value]));
    const paused = m.get(KEY.pausedUntil) || null;
    const active = paused && new Date(paused).getTime() > Date.now();
    const daily = Math.floor(Number(m.get(KEY.daily)));
    return {
      enabled: m.get(KEY.enabled) === '1',
      daily:
        Number.isFinite(daily) && daily >= 1
          ? Math.min(PROMO_JOIN_DAILY_LIMIT, daily)
          : PROMO_JOIN_DAILY_DEFAULT,
      pausedUntil: active ? paused : null,
      pauseReason: active ? (m.get(KEY.pauseReason) ?? null) : null,
    };
  }

  private async set(key: string, value: string) {
    await this.settingRepo.save({ key, value: value.slice(0, 500) });
  }

  async updateSettings(patch: {
    enabled?: boolean;
    daily?: number;
    resume?: boolean;
  }) {
    if (typeof patch.enabled === 'boolean')
      await this.set(KEY.enabled, patch.enabled ? '1' : '0');
    if (patch.daily !== undefined) {
      const n = Math.min(
        PROMO_JOIN_DAILY_LIMIT,
        Math.max(
          1,
          Math.floor(Number(patch.daily)) || PROMO_JOIN_DAILY_DEFAULT,
        ),
      );
      await this.set(KEY.daily, String(n));
    }
    if (patch.resume) {
      await this.set(KEY.pausedUntil, '');
      await this.set(KEY.pauseReason, '');
    }
    return this.getStatus();
  }

  private async pause(ms: number, reason: string) {
    await this.set(KEY.pausedUntil, new Date(Date.now() + ms).toISOString());
    await this.set(KEY.pauseReason, reason);
    this.logger.warn(`홍보 자동 가입 멈춤 (${reason})`);
  }

  /** 아직 시도 안 한 홍보 카테고리 공개 그룹 (회원 많은 순) */
  private async candidates(limit: number): Promise<Channel[]> {
    const tried = new Set(
      (await this.attempts.find({ select: ['channelId'] })).map(
        (a) => a.channelId,
      ),
    );
    const joinedNames = new Set(
      (
        await this.targets.find({
          select: ['username'],
          where: { username: Not(IsNull()) },
        })
      )
        .map((t) => (t.username ?? '').toLowerCase())
        .filter(Boolean),
    );
    const rows = await this.channels.find({
      where: {
        status: ChannelStatus.ACTIVE,
        linkType: LinkType.GROUP,
        category: PROMO_CATEGORY,
        username: Not(IsNull()),
      },
      order: { memberCount: 'DESC' },
      take: 400,
    });
    return rows
      .filter(
        (c) =>
          !tried.has(c.id) &&
          !joinedNames.has((c.username ?? '').toLowerCase()) &&
          !isAdminOnlyCategory(c.category) &&
          !['invalid', 'gone', 'merged', 'restricted'].includes(
            c.collectStatus ?? '',
          ),
      )
      .slice(0, limit);
  }

  private async joinsToday(): Promise<number> {
    return this.attempts.count({
      where: { attemptedAt: MoreThanOrEqual(kstDayStart(Date.now())) },
    });
  }

  async getStatus() {
    const settings = await this.getSettings();
    const [today, joined, requested, failed, left, recent] = await Promise.all([
      this.joinsToday(),
      this.attempts.count({ where: { status: 'joined' } }),
      this.attempts.count({ where: { status: 'requested' } }),
      this.attempts.count({ where: { status: 'failed' } }),
      this.candidates(1000).then((r) => r.length),
      this.attempts.find({ order: { attemptedAt: 'DESC' }, take: 15 }),
    ]);
    return {
      settings,
      today,
      totals: { joined, requested, failed },
      candidatesLeft: left,
      recent: recent.map((a) => ({
        title: a.title,
        username: a.username,
        status: a.status,
        error: a.error,
        attemptedAt: a.attemptedAt,
      })),
    };
  }

  /** 15분마다: 조건이 맞으면 한 곳 가입 */
  @Cron('*/15 * * * *')
  async tick(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || !this.telegram.isConfigured())
      return;
    const settings = await this.getSettings().catch(() => null);
    if (!settings?.enabled || settings.pausedUntil) return;
    const promoSettings = await this.promo.getSettings().catch(() => null);
    if (
      promoSettings &&
      !isPromoActiveHour(
        Date.now(),
        promoSettings.hourStart,
        promoSettings.hourEnd,
      )
    )
      return;
    const last = await this.attempts.findOne({
      where: {},
      order: { attemptedAt: 'DESC' },
    });
    const due = isJoinDue({
      nowMs: Date.now(),
      lastJoinAtMs: last ? new Date(last.attemptedAt).getTime() : null,
      joinsToday: await this.joinsToday(),
      dailyLimit: settings.daily,
      jitterMin: this.jitterMin,
    });
    if (!due) return;
    await sleep(Math.floor(Math.random() * 300_000));
    await this.joinNext().catch((e: unknown) =>
      this.logger.warn(
        `홍보 자동 가입 실패: ${e instanceof Error ? e.message : String(e)}`,
      ),
    );
  }

  /** 다음 한 곳 가입 (어드민 [지금 1곳 가입] 도 이것. 하루 한도·멈춤은 지킨다) */
  async joinNext(): Promise<{ ok: boolean; message: string }> {
    if (!this.telegram.isConfigured())
      return { ok: false, message: '홍보 계정이 연결되지 않았어요.' };
    if (this.joining) return { ok: false, message: '이미 가입하는 중이에요.' };
    const settings = await this.getSettings();
    if (settings.pausedUntil)
      return {
        ok: false,
        message: `가입 멈춤 중: ${settings.pauseReason ?? ''}`,
      };
    if ((await this.joinsToday()) >= settings.daily)
      return {
        ok: false,
        message: `오늘 가입 한도(${settings.daily}곳)를 다 썼어요.`,
      };
    this.joining = true;
    try {
      const [room] = await this.candidates(1);
      if (!room) return { ok: false, message: '가입할 홍보방 후보가 없어요.' };
      const username = (room.username ?? '').replace(/^@/, '');
      const base = {
        channelId: room.id,
        username: username.slice(0, 64),
        title: (room.title ?? username).slice(0, 200),
        attemptedAt: new Date(),
      };
      this.jitterMin = Math.floor(Math.random() * 30);
      try {
        await this.telegram.joinPublicGroup(username);
        await this.attempts.save({ ...base, status: 'joined', error: null });
        // 들어간 방을 홍보할 방 목록에 넣는다(꺼진 상태)
        await sleep(3000);
        await this.promo.syncTargets().catch(() => undefined);
        return { ok: true, message: `"${base.title}" 에 들어갔어요.` };
      } catch (error) {
        const e = classifyJoinError(error);
        if (e.kind === 'requested') {
          await this.attempts.save({
            ...base,
            status: 'requested',
            error: '가입 신청(승인 대기)',
          });
          return {
            ok: true,
            message: `"${base.title}" 은 승인제라 가입 신청했어요.`,
          };
        }
        if (e.kind === 'skip' || e.kind === 'other') {
          await this.attempts.save({
            ...base,
            status: 'failed',
            error: e.code.slice(0, 120),
          });
          return {
            ok: false,
            message: `"${base.title}" 은 못 들어갔어요 (${e.code}).`,
          };
        }
        // 계정 쪽 문제: 이 방은 기록하지 않고(나중에 다시) 가입을 멈춘다
        if (e.kind === 'flood')
          await this.pause(
            Math.max(3600, (e.seconds ?? 3600) * 1.5) * 1000,
            `텔레그램 대기 요청 (${e.code})`,
          );
        else if (e.kind === 'too_many') {
          await this.set(KEY.enabled, '0');
          await this.pause(
            7 * 86_400_000,
            '들어갈 수 있는 방 수 한도에 닿음 (CHANNELS_TOO_MUCH)',
          );
        } else if (e.kind === 'limited')
          await this.pause(48 * 3_600_000, `계정 제한 (${e.code})`);
        else await this.pause(24 * 3_600_000, `로그인 문제 (${e.code})`);
        return { ok: false, message: `가입을 멈췄어요: ${e.code}` };
      }
    } finally {
      this.joining = false;
    }
  }
}
