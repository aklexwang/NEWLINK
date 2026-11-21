import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { In, MoreThanOrEqual, Repository } from 'typeorm';
import { AppSetting } from '../ads/app-setting.entity';
import { CategoryAiService } from '../auto-manage/category-ai.service';
import { CategoryEntity } from '../categories/category.entity';
import { Channel, ChannelStatus } from '../channels/channel.entity';
import {
  STORED_IMAGE_PREFIX,
  StoredImagesService,
} from '../stored-images/stored-images.service';
import {
  aiCopyPrompt,
  buildTemplateCopies,
  parseAiCopies,
  PROMO_DEFAULT_LINK,
  PROMO_TEXT_MAX,
} from './promo-copy.logic';
import {
  classifyPromoError,
  defaultTargetSettings,
  detectPromoRule,
  isPromoActiveHour,
  kstDayStart,
  pickNextTarget,
  PROMO_DAILY_MAX_DEFAULT,
  PROMO_GLOBAL_GAP_MIN_DEFAULT,
  PROMO_HOUR_END_DEFAULT,
  PROMO_HOUR_START_DEFAULT,
  PROMO_ROOM_DAILY_CAP,
  PROMO_ROOM_MIN_GAP_MIN,
} from './promo-rules.logic';
import { PromoCreative } from './promo-creative.entity';
import { PromoPostLog } from './promo-post-log.entity';
import { PromoTarget } from './promo-target.entity';
import { PromoTelegramService } from './promo-telegram.service';

const KEY = {
  enabled: 'promo.enabled',
  dailyMax: 'promo.dailyMax',
  hourStart: 'promo.hourStart',
  hourEnd: 'promo.hourEnd',
  globalGapMin: 'promo.globalGapMin',
  pausedUntil: 'promo.pausedUntil',
  pauseReason: 'promo.pauseReason',
  link: 'promo.link',
} as const;

/** 하루 전체 최대 글 수 상한(어드민에서 이 이상은 못 올림) */
export const PROMO_DAILY_MAX_LIMIT = 40;
/** 방 목록 동기화 때 한 번에 소개글을 읽는 새 방 수(계정 보호) */
const SYNC_ABOUT_MAX = 25;
const SYNC_ABOUT_GAP_MS = 2500;

export type PromoSettings = {
  enabled: boolean;
  dailyMax: number;
  hourStart: number;
  hourEnd: number;
  globalGapMin: number;
  pausedUntil: string | null;
  pauseReason: string | null;
  link: string;
};

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class PromoService {
  private readonly logger = new Logger(PromoService.name);
  /** 보내기는 한 번에 하나만 */
  private sending = false;
  private syncing = false;

  constructor(
    @InjectRepository(PromoTarget)
    private readonly targets: Repository<PromoTarget>,
    @InjectRepository(PromoCreative)
    private readonly creatives: Repository<PromoCreative>,
    @InjectRepository(PromoPostLog)
    private readonly logs: Repository<PromoPostLog>,
    @InjectRepository(AppSetting)
    private readonly settingRepo: Repository<AppSetting>,
    @InjectRepository(Channel)
    private readonly channels: Repository<Channel>,
    @InjectRepository(CategoryEntity)
    private readonly categories: Repository<CategoryEntity>,
    private readonly telegram: PromoTelegramService,
    private readonly images: StoredImagesService,
    private readonly ai: CategoryAiService,
  ) {}

  // ───────────── 설정 ─────────────

  private async readSettingMap(): Promise<Map<string, string>> {
    const rows = await this.settingRepo.find({
      where: { key: In(Object.values(KEY)) },
    });
    return new Map(rows.map((r) => [r.key, r.value]));
  }

  async getSettings(): Promise<PromoSettings> {
    const m = await this.readSettingMap();
    const paused = m.get(KEY.pausedUntil) ?? null;
    return {
      enabled: m.get(KEY.enabled) === '1',
      dailyMax: clampInt(
        m.get(KEY.dailyMax),
        1,
        PROMO_DAILY_MAX_LIMIT,
        PROMO_DAILY_MAX_DEFAULT,
      ),
      hourStart: clampInt(
        m.get(KEY.hourStart),
        0,
        23,
        PROMO_HOUR_START_DEFAULT,
      ),
      hourEnd: clampInt(m.get(KEY.hourEnd), 1, 24, PROMO_HOUR_END_DEFAULT),
      globalGapMin: clampInt(
        m.get(KEY.globalGapMin),
        10,
        600,
        PROMO_GLOBAL_GAP_MIN_DEFAULT,
      ),
      pausedUntil:
        paused && new Date(paused).getTime() > Date.now() ? paused : null,
      pauseReason:
        paused && new Date(paused).getTime() > Date.now()
          ? (m.get(KEY.pauseReason) ?? null)
          : null,
      link: m.get(KEY.link) || PROMO_DEFAULT_LINK,
    };
  }

  private async setSetting(key: string, value: string): Promise<void> {
    await this.settingRepo.save({ key, value: value.slice(0, 500) });
  }

  async updateSettings(patch: Partial<PromoSettings>): Promise<PromoSettings> {
    if (patch.enabled !== undefined) {
      if (patch.enabled && !this.telegram.isConfigured()) {
        throw new BadRequestException('홍보 계정이 아직 연결되지 않았어요.');
      }
      await this.setSetting(KEY.enabled, patch.enabled ? '1' : '0');
    }
    if (patch.dailyMax !== undefined) {
      await this.setSetting(
        KEY.dailyMax,
        String(
          clampInt(
            patch.dailyMax,
            1,
            PROMO_DAILY_MAX_LIMIT,
            PROMO_DAILY_MAX_DEFAULT,
          ),
        ),
      );
    }
    if (patch.hourStart !== undefined) {
      await this.setSetting(
        KEY.hourStart,
        String(clampInt(patch.hourStart, 0, 23, PROMO_HOUR_START_DEFAULT)),
      );
    }
    if (patch.hourEnd !== undefined) {
      await this.setSetting(
        KEY.hourEnd,
        String(clampInt(patch.hourEnd, 1, 24, PROMO_HOUR_END_DEFAULT)),
      );
    }
    if (patch.globalGapMin !== undefined) {
      await this.setSetting(
        KEY.globalGapMin,
        String(
          clampInt(patch.globalGapMin, 10, 600, PROMO_GLOBAL_GAP_MIN_DEFAULT),
        ),
      );
    }
    if (patch.link !== undefined) {
      const link = String(patch.link).trim();
      if (!/^https:\/\/t\.me\/[A-Za-z0-9_+/?=&-]+$/.test(link)) {
        throw new BadRequestException('링크는 https://t.me/ 로 시작해야 해요.');
      }
      await this.setSetting(KEY.link, link);
    }
    if (patch.pausedUntil === null) {
      // 멈춤 풀기
      await this.setSetting(KEY.pausedUntil, '');
      await this.setSetting(KEY.pauseReason, '');
    }
    return this.getSettings();
  }

  private async pauseFor(ms: number, reason: string): Promise<void> {
    const until = new Date(Date.now() + ms).toISOString();
    await this.setSetting(KEY.pausedUntil, until);
    await this.setSetting(KEY.pauseReason, reason);
    this.logger.warn(`홍보 자동 멈춤 (${reason}) ~ ${until}`);
  }

  // ───────────── 상태 ─────────────

  private async todayCounts(): Promise<{
    total: number;
    byTarget: Map<string, number>;
  }> {
    const rows = await this.logs.find({
      select: ['targetId'],
      where: { ok: true, postedAt: MoreThanOrEqual(kstDayStart(Date.now())) },
    });
    const byTarget = new Map<string, number>();
    for (const r of rows)
      byTarget.set(r.targetId, (byTarget.get(r.targetId) ?? 0) + 1);
    return { total: rows.length, byTarget };
  }

  async getStatus() {
    const settings = await this.getSettings();
    const configured = this.telegram.isConfigured();
    let account: {
      name: string;
      username: string | null;
      premium: boolean;
    } | null = null;
    let accountError: string | null = null;
    if (configured) {
      try {
        account = await this.telegram.me();
      } catch (error) {
        accountError = classifyPromoError(error).code;
      }
    }
    const today = await this.todayCounts();
    const [targetTotal, targetOn, creativeOn] = await Promise.all([
      this.targets.count(),
      this.targets.count({ where: { enabled: true, status: 'ok' } }),
      this.creatives.count({ where: { enabled: true } }),
    ]);
    const last = await this.logs.findOne({
      where: { ok: true },
      order: { postedAt: 'DESC' },
    });
    // 이미지 문구용: 회원 화면 방 수(대략)
    const rooms = await this.channels.count({
      where: { status: ChannelStatus.ACTIVE },
    });
    return {
      configured,
      account,
      accountError,
      settings,
      activeHourNow: isPromoActiveHour(
        Date.now(),
        settings.hourStart,
        settings.hourEnd,
      ),
      todaySent: today.total,
      rooms,
      targetTotal,
      targetOn,
      creativeOn,
      lastPostedAt: last?.postedAt.toISOString() ?? null,
      limits: {
        roomDailyCap: PROMO_ROOM_DAILY_CAP,
        roomMinGapMin: PROMO_ROOM_MIN_GAP_MIN,
        dailyMaxLimit: PROMO_DAILY_MAX_LIMIT,
      },
    };
  }

  // ───────────── 홍보할 방 ─────────────

  async listTargets() {
    const [rows, today] = await Promise.all([
      this.targets.find({ order: { enabled: 'DESC', memberCount: 'DESC' } }),
      this.todayCounts(),
    ]);
    return rows.map((t) => ({
      ...t,
      todayCount: today.byTarget.get(t.id) ?? 0,
    }));
  }

  async updateTarget(
    id: string,
    patch: {
      enabled?: boolean;
      dailyLimit?: number;
      minGapMinutes?: number;
      textOnly?: boolean;
    },
  ) {
    const t = await this.targets.findOneBy({ id });
    if (!t) throw new NotFoundException('방을 찾을 수 없어요.');
    if (patch.enabled !== undefined) {
      if (patch.enabled && t.status !== 'ok') {
        // 막혔던 방을 다시 켜면 상태도 풀어 준다(관리자가 직접 확인했다는 뜻)
        t.status = 'ok';
        t.lastError = null;
      }
      t.enabled = patch.enabled;
    }
    if (patch.dailyLimit !== undefined)
      t.dailyLimit = clampInt(patch.dailyLimit, 1, PROMO_ROOM_DAILY_CAP, 1);
    if (patch.minGapMinutes !== undefined) {
      t.minGapMinutes = clampInt(
        patch.minGapMinutes,
        PROMO_ROOM_MIN_GAP_MIN,
        24 * 60,
        PROMO_ROOM_MIN_GAP_MIN,
      );
    }
    if (patch.textOnly !== undefined) t.textOnly = patch.textOnly;
    await this.targets.save(t);
    return t;
  }

  /** 여러 방 한 번에 켜기/끄기. onlyClean=true 면 '홍보 금지'로 보이는 방은 건너뜀 */
  async bulkEnable(ids: string[] | 'all', enabled: boolean, onlyClean = true) {
    const rows =
      ids === 'all'
        ? await this.targets.find()
        : await this.targets.findBy({ id: In(ids) });
    let changed = 0;
    for (const t of rows) {
      if (enabled && onlyClean && (t.ruleForbidden || t.status !== 'ok'))
        continue;
      if (t.enabled === enabled) continue;
      t.enabled = enabled;
      changed += 1;
    }
    await this.targets.save(rows);
    return { changed };
  }

  /** 홍보 계정이 들어가 있는 그룹 목록을 가져와 방 목록을 맞춘다 */
  async syncTargets() {
    if (!this.telegram.isConfigured()) {
      throw new BadRequestException('홍보 계정이 아직 연결되지 않았어요.');
    }
    if (this.syncing)
      throw new BadRequestException('이미 방 목록을 가져오는 중이에요.');
    this.syncing = true;
    try {
      const groups = await this.telegram.listGroups();
      const existing = await this.targets.find();
      const byPeer = new Map(
        existing.map((t) => [`${t.peerType}:${t.peerId}`, t]),
      );
      const seen = new Set<string>();
      let added = 0;
      let aboutRead = 0;
      for (const g of groups) {
        const key = `${g.peerType}:${g.peerId}`;
        seen.add(key);
        const old = byPeer.get(key);
        if (old) {
          old.title = g.title;
          old.username = g.username;
          old.memberCount = g.memberCount;
          old.accessHash = g.accessHash ?? old.accessHash;
          if (old.status === 'gone') old.status = 'ok';
          await this.targets.save(old);
          continue;
        }
        let about: string | null = null;
        if (aboutRead < SYNC_ABOUT_MAX) {
          try {
            about = await this.telegram.getAbout(g);
          } catch (error) {
            const e = classifyPromoError(error);
            if (
              e.kind === 'flood' ||
              e.kind === 'account_limited' ||
              e.kind === 'auth'
            ) {
              await this.pauseFor(
                (e.seconds ?? 3600) * 1000 * 1.5,
                `방 목록 읽다 ${e.code}`,
              );
              break;
            }
          }
          aboutRead += 1;
          await sleep(SYNC_ABOUT_GAP_MS);
        }
        const rule = detectPromoRule(about);
        const defaults = defaultTargetSettings(rule);
        await this.targets.insert({
          id: randomUUID(),
          peerType: g.peerType,
          peerId: g.peerId,
          accessHash: g.accessHash,
          title: g.title,
          username: g.username,
          memberCount: g.memberCount,
          about: about?.slice(0, 1000) ?? null,
          ruleText: rule.matched?.slice(0, 200) ?? null,
          ruleForbidden: rule.forbidden,
          enabled: false, // 처음엔 꺼 둔다: 관리자가 규칙 확인 후 켠다
          dailyLimit: defaults.dailyLimit,
          minGapMinutes: defaults.minGapMinutes,
          textOnly: false,
          status: 'ok',
          lastError: null,
          lastPostedAt: null,
          nextAllowedAt: null,
          lastCreativeId: null,
        });
        added += 1;
      }
      let gone = 0;
      for (const t of existing) {
        if (!seen.has(`${t.peerType}:${t.peerId}`) && t.status !== 'gone') {
          t.status = 'gone';
          t.enabled = false;
          gone += 1;
          await this.targets.save(t);
        }
      }
      return { groups: groups.length, added, gone };
    } finally {
      this.syncing = false;
    }
  }

  // ───────────── 홍보 글 ─────────────

  listCreatives() {
    return this.creatives.find({ order: { createdAt: 'DESC' } });
  }

  async saveCreative(input: {
    id?: string;
    text: string;
    imageUrl?: string | null;
    enabled?: boolean;
    source?: string;
  }) {
    const text = (input.text ?? '').trim();
    if (text.length < 10)
      throw new BadRequestException('홍보 글이 너무 짧아요.');
    if (text.length > PROMO_TEXT_MAX)
      throw new BadRequestException(`홍보 글은 ${PROMO_TEXT_MAX}자까지예요.`);
    const imageUrl = input.imageUrl ?? null;
    if (imageUrl && !imageUrl.startsWith(STORED_IMAGE_PREFIX)) {
      throw new BadRequestException('이미지 주소가 올바르지 않아요.');
    }
    if (input.id) {
      const row = await this.creatives.findOneBy({ id: input.id });
      if (!row) throw new NotFoundException('홍보 글을 찾을 수 없어요.');
      row.text = text;
      row.imageUrl = imageUrl;
      if (input.enabled !== undefined) row.enabled = input.enabled;
      return this.creatives.save(row);
    }
    const row = this.creatives.create({
      id: randomUUID(),
      text,
      imageUrl,
      enabled: input.enabled ?? true,
      source: ['ai', 'template', 'manual'].includes(input.source ?? '')
        ? input.source!
        : 'manual',
      sentCount: 0,
      lastSentAt: null,
    });
    return this.creatives.save(row);
  }

  async deleteCreative(id: string) {
    await this.creatives.delete({ id });
    return { ok: true };
  }

  async uploadImage(
    file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined,
  ) {
    return { imageUrl: await this.images.save('promo-image', file) };
  }

  /** 홍보 문구 후보 만들기(AI 가 되면 AI, 아니면 기본 문구). 저장은 하지 않는다 */
  async suggestCopies(count = 5) {
    const settings = await this.getSettings();
    const [rooms, categories] = await Promise.all([
      this.channels.count({ where: { status: ChannelStatus.ACTIVE } }),
      this.categories.count({ where: { isActive: true } }),
    ]);
    const input = { rooms, categories, link: settings.link };
    const prompt = aiCopyPrompt(input, count);
    let ai: string[] = [];
    try {
      ai = parseAiCopies(
        await this.ai.summarizeKorean(prompt.system, prompt.user),
        settings.link,
      );
    } catch {
      ai = [];
    }
    const templates = buildTemplateCopies(input);
    return {
      source: ai.length > 0 ? 'ai' : 'template',
      copies: (ai.length > 0 ? ai : templates).slice(
        0,
        Math.max(1, Math.min(count, 10)),
      ),
      stats: input,
    };
  }

  // ───────────── 보내기 ─────────────

  async listLogs(limit = 50) {
    return this.logs.find({
      order: { postedAt: 'DESC' },
      take: Math.min(200, Math.max(1, limit)),
    });
  }

  /** 10분마다: 조건이 맞으면 한 곳에 한 건 */
  @Cron('*/10 * * * *')
  async scheduledTick(): Promise<void> {
    if (!this.telegram.isConfigured()) return;
    const settings = await this.getSettings().catch(() => null);
    if (!settings?.enabled) return;
    // 매번 같은 시각에 올리지 않게 0~4분 흔들기
    await sleep(Math.floor(Math.random() * 240_000));
    const result = await this.sendNext('auto').catch((error: unknown) => {
      this.logger.warn(
        `홍보 자동 보내기 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
    if (result?.sent) this.logger.log(`홍보 보냄: ${result.target}`);
  }

  /**
   * 다음 한 건 보내기. 방별 하루 횟수·간격, 전체 하루 최대, 글 사이 최소 간격, 멈춤을 모두 지킨다.
   * manual(어드민 [지금 1건]) 은 '자동 켜기'·활동 시간만 건너뛴다(나머지 한도는 그대로).
   */
  async sendNext(
    kind: 'auto' | 'manual',
  ): Promise<{ sent: boolean; reason?: string; target?: string }> {
    if (!this.telegram.isConfigured())
      return { sent: false, reason: '홍보 계정이 연결되지 않았어요.' };
    if (this.sending) return { sent: false, reason: '이미 보내는 중이에요.' };
    this.sending = true;
    try {
      const settings = await this.getSettings();
      const now = Date.now();
      if (settings.pausedUntil) {
        return {
          sent: false,
          reason: `멈춤 중이에요(${settings.pauseReason ?? ''}).`,
        };
      }
      if (kind === 'auto') {
        if (!settings.enabled)
          return { sent: false, reason: '자동 홍보가 꺼져 있어요.' };
        if (!isPromoActiveHour(now, settings.hourStart, settings.hourEnd)) {
          return { sent: false, reason: '활동 시간이 아니에요.' };
        }
      }
      const today = await this.todayCounts();
      if (today.total >= settings.dailyMax) {
        return {
          sent: false,
          reason: `오늘 최대(${settings.dailyMax}건)를 다 보냈어요.`,
        };
      }
      const last = await this.logs.findOne({
        where: { ok: true },
        order: { postedAt: 'DESC' },
      });
      if (
        last &&
        now - last.postedAt.getTime() < settings.globalGapMin * 60_000
      ) {
        const left = Math.ceil(
          (settings.globalGapMin * 60_000 - (now - last.postedAt.getTime())) /
            60_000,
        );
        return {
          sent: false,
          reason: `글 사이 최소 간격(${settings.globalGapMin}분) 때문에 ${left}분 뒤에 보낼 수 있어요.`,
        };
      }
      const target = pickNextTarget(
        await this.targets.find(),
        today.byTarget,
        now,
      );
      if (!target)
        return {
          sent: false,
          reason: '지금 보낼 수 있는 방이 없어요(켜진 방·하루 횟수·간격 확인).',
        };

      const creatives = await this.creatives.find({ where: { enabled: true } });
      if (creatives.length === 0)
        return { sent: false, reason: '켜진 홍보 글이 없어요.' };
      creatives.sort(
        (a, b) =>
          (a.lastSentAt?.getTime() ?? 0) - (b.lastSentAt?.getTime() ?? 0),
      );
      const creative =
        creatives.find((c) => c.id !== target.lastCreativeId) ?? creatives[0];

      let image: { data: Buffer; mime: string } | null = null;
      if (creative.imageUrl && !target.textOnly) {
        try {
          image = await this.images.read(
            creative.imageUrl.slice(STORED_IMAGE_PREFIX.length),
          );
        } catch {
          image = null;
        }
      }

      const log: PromoPostLog = this.logs.create({
        id: randomUUID(),
        targetId: target.id,
        targetTitle: target.title.slice(0, 200),
        creativeId: creative.id,
        postedAt: new Date(),
        ok: false,
        error: null,
        kind,
      });
      try {
        await this.telegram.sendPost(
          {
            peerType: target.peerType === 'chat' ? 'chat' : 'channel',
            peerId: target.peerId,
            accessHash: target.accessHash,
          },
          creative.text,
          image,
        );
        log.ok = true;
        target.lastPostedAt = log.postedAt;
        target.lastCreativeId = creative.id;
        target.lastError = null;
        creative.sentCount += 1;
        creative.lastSentAt = log.postedAt;
        await this.creatives.save(creative);
        await this.targets.save(target);
        await this.logs.save(log);
        return { sent: true, target: target.title };
      } catch (error) {
        const e = classifyPromoError(error);
        log.error = e.code.slice(0, 120);
        await this.logs.save(log);
        target.lastError = e.code.slice(0, 120);
        switch (e.kind) {
          case 'flood':
            await this.pauseFor(
              Math.max(e.seconds ?? 0, 600) * 1500,
              `텔레그램 쉬어라 신호 ${e.code}`,
            );
            break;
          case 'account_limited':
            await this.pauseFor(24 * 3_600_000, `계정 제한 ${e.code}`);
            break;
          case 'auth':
            await this.setSetting(KEY.enabled, '0');
            await this.pauseFor(24 * 3_600_000, `계정 로그인 문제 ${e.code}`);
            break;
          case 'slowmode':
            target.nextAllowedAt = new Date(
              Date.now() + Math.max(e.seconds ?? 0, 600) * 1000,
            );
            break;
          case 'room_blocked':
            target.status = 'room_blocked';
            target.enabled = false;
            break;
          case 'no_media':
            target.textOnly = true;
            break;
          default:
            target.nextAllowedAt = new Date(Date.now() + 60 * 60_000);
        }
        await this.targets.save(target);
        return {
          sent: false,
          reason: `보내기 실패: ${e.code}`,
          target: target.title,
        };
      }
    } finally {
      this.sending = false;
    }
  }
}
