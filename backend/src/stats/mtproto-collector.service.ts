import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { DailyCounterStore } from '../daily-counters/daily-counter-store.service';
import { InviteDiscoveryQueueService } from './invite-discovery-queue.service';
import { safeCount } from '../daily-counters/daily-counter.logic';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { Channel, ChannelStatus, LinkType } from '../channels/channel.entity';
import { clipPostExcerpt } from '../channels/channel-language.logic';
import {
  applyCollectedTitle,
  isTitleLocked,
} from '../channels/title-lock.logic';
import { pickKeepChannel } from '../channels/merge-duplicate-channels.logic';
import {
  extractTelegramUsernameFromLink,
  inviteHashFromLink,
  isInviteOnlyLink,
} from '../channels/telegram-username';
import { formatKstYmd } from './channel-metrics.math';
import { ChannelEvent } from './channel-event.entity';
import { ChannelPost, type ChannelPostMediaType } from './channel-post.entity';
import { ChannelSnapshot } from './channel-snapshot.entity';
import {
  activityInWindow,
  assertMtprotoMethodAllowed,
  canSpendMtprotoRequest,
  deletedMessageIds,
  FloodWaitTooLongError,
  isMtprotoTimeoutError,
  MTPROTO_CONNECT_TIMEOUT_MS,
  MTPROTO_REQUEST_TIMEOUT_MS,
  MTPROTO_TIMEOUT_STREAK_DISABLE,
  nextTimeoutStreak,
  shouldDisableMtprotoAfterTimeouts,
  firstHistoryMessageId,
  firstHistoryMessagePostedAtMs,
  GROUP_ACTIVITY_DAY_MS,
  GROUP_ACTIVITY_WEEK_MS,
  isMtprotoAuthFatal,
  MTPROTO_DEFAULT_DAILY_LIMIT,
  MTPROTO_EXCERPT_MAX,
  MTPROTO_HISTORY_LIMIT,
  mtprotoErrorCode,
  retryAfterFloodWait,
  shouldSaveMtprotoPosts,
  withTimeout,
  summarizeGroupHistory,
  unixSecondsAgo,
  unixSecondsToDate,
  type GroupActivityCounts,
  type GroupHistorySummary,
} from './mtproto-collect.logic';
import {
  canReuseStoredAccess,
  canSpendResolve,
  floodWaitUntilFromSeconds,
  isFloodWaitBlocking,
  isResolveOrSearchMethod,
  isStoredAccessInvalid,
  memberChatFromInvite,
  mtprotoCallGapMs,
  RESOLVE_DAILY_LIMIT_DEFAULT,
  serializeAccessHash,
} from './mtproto-access.logic';
import {
  envPositiveInt,
  KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
} from './mtproto-budget.logic';
import {
  accountStateId,
  allAccountsBlocked,
  parseSessionList,
  pickNextAccount,
  scaledDailyLimit,
} from './mtproto-pool.logic';
import {
  publicUsernamesFromContactsSearch,
  type PublicSearchHit,
} from './mtproto-search.logic';
import { nextCollectAtAfterSuccess } from './collect-queue.logic';
import { DiscoveredUsername } from './discovered-username.entity';
import {
  matchGroupByTitle,
  normalizeTelegramChatId,
  parseLinkedChat,
  pickChatById,
  telegramChatIdVariants,
  type LinkedChatInfo,
} from './linked-chat.logic';
import { MtprotoState } from './mtproto-state.entity';
import {
  extractTmeInvitesFromText,
  extractTmeUsernamesFromHtml,
  joinMentionedUsernames,
} from './telegram-preview-html';
import { asText } from '../common/as-text';
import { AppSetting } from '../ads/app-setting.entity';
import {
  canSpendForCollect,
  mtprotoSpecialReserve,
} from './mtproto-reserve.logic';
import {
  canJoinAnother,
  canSendJoinRequest,
  describeUnjoinableInvite,
  type InviteMeta,
  inviteMetadata,
  isJoinableChannelInvite,
  isRequestNeededChannel,
  JOIN_REQUEST_AUTO_MIN_MEMBERS,
  JOIN_REQUEST_DAILY_DEFAULT,
  joinedChannelFromUpdates,
  MTPROTO_JOIN_TOTAL_KEY,
  MTPROTO_JOIN_TOTAL_MAX,
  MTPROTO_JOIN_DAILY_DEFAULT,
  parseJoinDaily,
  wasJoinRequestSent,
} from './mtproto-join.logic';

/** 풀 계정 한 칸: 연결·FloodWait 는 계정마다 따로 */
interface AccountSlot {
  index: number;
  session: string;
  client: import('telegram').TelegramClient | null;
  connecting: Promise<boolean> | null;
  floodWaitUntil: Date | null;
  authStopped: boolean;
  lastError: string | null;
}

export type MtprotoPublicStatus = {
  enabled: boolean;
  /** 수집 계정 수(풀) */
  accountsTotal?: number;
  /** 지금 쓸 수 있는 계정 수(FloodWait·인증 중단 제외) */
  accountsAvailable?: number;
  requestsToday: number;
  resolvesToday: number;
  searchesToday: number;
  invitesToday: number;
  inviteDailyLimit: number;
  joinsToday: number;
  /** 오늘 초대 링크 확인 결과별 수 (서버 메모리, 재시작하면 0) */
  joinOutcomes: Record<string, number>;
  /** MTProto 하루 요청 한도 */
  dailyLimit: number;
  /** 그중 검색·초대 확인·가입·발견용으로 남겨 두는 수 */
  specialReserve: number;
  joinDailyLimit: number;
  joinedTotal: number;
  joinRequestsToday?: number;
  joinRequestDailyLimit?: number;
  joinRequestAuto?: boolean;
  joinTotalMax: number;
  lastError: string | null;
};

export type MtprotoCollectResult =
  | { ok: true; mode: 'mtproto' }
  | {
      ok: false;
      reason: 'disabled' | 'skipped' | 'failed' | 'invalid' | 'not_member';
      /** 회원 아님이지만 CheckChatInvite 가 준 공개 정보(제목·소개·회원수). A안 */
      inviteMeta?: InviteMeta;
    };

export type MtprotoTestSummary = {
  ok: boolean;
  reason?: string;
  username?: string;
  memberCount?: number | null;
  createdOn?: string | null;
  recentPosts?: number;
  avgViews?: number | null;
  forwardedPosts?: number;
  editedPosts?: number;
  activity24h?: number;
  activity7d?: number;
};

type ResolvedPublicChannel = {
  username: string;
  title: string | null;
  description: string | null;
  memberCount: number | null;
  createdOn: Date | null;
  telegramChatId: number | null;
  linkType: LinkType;
  inputChannel: { channelId: unknown; accessHash: unknown };
  /** 채널이면 연결된 대화방, 그룹이면 부모 채널. 없으면 null */
  linkedChat: LinkedChatInfo | null;
};

type HistoryPost = {
  messageId: number;
  postedAt: Date;
  views: number | null;
  forwards: number | null;
  mediaType: ChannelPostMediaType;
  forwardedFrom: string | null;
  isEdited: boolean;
  mentionedUsernames: string[];
  inviteHashes?: string[];
  textExcerpt: string | null;
};

const MTPROTO_DAILY_KEY = 'mtproto';
/** 초대 링크 확인(CheckChatInvite) 하루 기본 한도. resolve(50)와 따로 */
const INVITE_CHECK_DAILY_LIMIT_DEFAULT = 40;
const MTPROTO_JOIN_DAILY_KEY = 'mtproto-join';
const MTPROTO_JOIN_REQUEST_DAILY_KEY = 'mtproto-join-request';

@Injectable()
export class MtprotoCollectorService implements OnModuleInit {
  private readonly logger = new Logger(MtprotoCollectorService.name);
  /** 수집 계정 풀(멀티 계정). 세션 1개면 슬롯 1개로 기존과 동일하게 동작한다. */
  private accounts: AccountSlot[] = [];
  private poolInited = false;
  /** 라운드로빈 다음 자리 */
  private rrPointer = 0;
  /** call() 이 지금 쓰는 계정(인증 오류 처리용) */
  private activeAccount: AccountSlot | null = null;
  private stopped = false;
  private lastError: string | null = null;
  private requestsToday = 0;
  private requestDay = '';
  private lastCallAt = 0;
  private timeoutStreak = 0;
  private lastResolveOrSearchAt = 0;
  private resolvesToday = 0;
  private searchesToday = 0;
  private joinsToday = 0;
  /** CheckChatInvite(초대 링크 확인) 오늘 수. resolve 한도와 따로 센다 */
  private invitesToday = 0;
  private joinDay = '';
  private joinedTotal = 0;
  private lastJoinAt = 0;
  /** 오늘 초대 링크 확인 결과별 수 (왜 가입이 안 됐는지 화면에서 보려고) */
  private joinOutcomes: Record<string, number> = {};
  // 입장 요청(승인 필요 방) — 밴 방지로 하루 소량만
  private joinRequestsToday = 0;
  private joinRequestDay = '';
  private lastJoinRequestAt = 0;
  private joinOutcomeDay = '';
  /** CHANNELS_TOO_MUCH 등으로 더 가입하면 안 될 때 */
  private joinBlocked = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly adminNotify: TelegramAdminNotifyService,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelPost)
    private readonly postRepository: Repository<ChannelPost>,
    @InjectRepository(ChannelSnapshot)
    private readonly snapshotRepository: Repository<ChannelSnapshot>,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    @InjectRepository(MtprotoState)
    private readonly stateRepository: Repository<MtprotoState>,
    @InjectRepository(DiscoveredUsername)
    private readonly discoveredRepository: Repository<DiscoveredUsername>,
    @Optional() private readonly dailyStore?: DailyCounterStore,
    @Optional() private readonly inviteQueue?: InviteDiscoveryQueueService,
    @Optional()
    @InjectRepository(AppSetting)
    private readonly settings?: Repository<AppSetting>,
  ) {}

  async onModuleInit() {
    await this.restoreDailyCounters();
    await this.restoreJoinCounters();
    this.ensurePool();
    await this.refreshFloodWaitFromDb();
    // FloodWait 은 계정별이라 전역 stopped 을 세우지 않는다. 쓸 계정이 있으면 canUseMtproto 가 허용한다.
  }

  /** env 의 세션 목록으로 계정 풀을 만든다(또는 바뀌었으면 다시 만든다). */
  private ensurePool() {
    const env: Record<string, string | undefined> = {
      TELEGRAM_SESSION: this.configService.get<string>('TELEGRAM_SESSION'),
      TELEGRAM_SESSIONS: this.configService.get<string>('TELEGRAM_SESSIONS'),
    };
    for (let i = 2; i <= 10; i += 1) {
      env[`TELEGRAM_SESSION_${i}`] = this.configService.get<string>(
        `TELEGRAM_SESSION_${i}`,
      );
    }
    const sessions = parseSessionList(env);
    const changed =
      sessions.length !== this.accounts.length ||
      sessions.some((s, i) => this.accounts[i]?.session !== s);
    if (this.poolInited && !changed) return;
    // 세션이 그대로인 슬롯은 살아 있는 연결을 유지하고, 바뀐 것만 새로 만든다
    const bySession = new Map(this.accounts.map((a) => [a.session, a]));
    const next: AccountSlot[] = sessions.map((session, index) => {
      const kept = bySession.get(session);
      if (kept) {
        kept.index = index;
        bySession.delete(session);
        return kept;
      }
      return {
        index,
        session,
        client: null,
        connecting: null,
        floodWaitUntil: null,
        authStopped: false,
        lastError: null,
      };
    });
    // 더 이상 안 쓰는 슬롯은 연결을 끊는다
    for (const gone of bySession.values()) {
      void gone.client?.disconnect().catch(() => undefined);
    }
    this.accounts = next;
    this.poolInited = true;
    if (this.rrPointer >= this.accounts.length) this.rrPointer = 0;
  }

  /** 지금 쓸 수 있는 계정 수 */
  private availableAccountCount(): number {
    const now = new Date();
    return this.accounts.filter(
      (a) => !a.authStopped && !isFloodWaitBlocking(a.floodWaitUntil, now),
    ).length;
  }

  isEnabled(): boolean {
    const raw = (this.configService.get<string>('MTPROTO_ENABLED') ?? '')
      .trim()
      .toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  getPublicStatus(): MtprotoPublicStatus {
    this.rollDailyCounter();
    return {
      enabled: this.canUseMtproto(),
      accountsTotal: this.accounts.length,
      accountsAvailable: this.availableAccountCount(),
      requestsToday: this.requestsToday,
      resolvesToday: this.resolvesToday,
      searchesToday: this.searchesToday,
      invitesToday: this.invitesToday,
      inviteDailyLimit: this.inviteCheckDailyLimit(),
      joinsToday: this.currentJoinsToday(),
      joinOutcomes: this.todayJoinOutcomes(),
      dailyLimit: this.dailyLimit(),
      specialReserve: this.specialReserve(),
      joinDailyLimit: this.joinDailyLimit(),
      joinedTotal: this.joinedTotal,
      joinTotalMax: MTPROTO_JOIN_TOTAL_MAX,
      joinRequestsToday: this.currentJoinRequestsToday(),
      joinRequestDailyLimit: this.joinRequestDailyLimit(),
      joinRequestAuto: this.joinRequestAutoEnabled(),
      lastError: this.lastError,
    };
  }

  canUseMtproto(): boolean {
    // FloodWait 은 계정별이라 끝난 계정은 pickNextAccount 가 자동으로 다시 쓴다
    // (한 계정이 막혀도 다른 계정이 있으면 계속 쓴다. 전부 막혀야 멈춘다)
    this.ensurePool();
    return (
      this.isEnabled() &&
      !this.stopped &&
      !allAccountsBlocked(this.accounts)
    );
  }

  remainingRequests(): number {
    this.rollDailyCounter();
    if (!this.canUseMtproto()) return 0;
    return Math.max(0, this.dailyLimit() - this.requestsToday);
  }

  remainingResolves(): number {
    this.rollDailyCounter();
    if (!this.canUseMtproto()) return 0;
    return Math.max(0, this.resolveDailyLimit() - this.resolvesToday);
  }

  remainingSearches(): number {
    this.rollDailyCounter();
    if (!this.canUseMtproto()) return 0;
    return Math.max(0, this.searchDailyLimit() - this.searchesToday);
  }

  /** full 파이프라인 시작 때 호출. 인증 오류·일일 상한·진행 중 FloodWait 은 유지 */
  async prepareForCollectRun() {
    this.timeoutStreak = 0;
    this.ensurePool();
    await this.refreshFloodWaitFromDb();
    // 타임아웃 연속·flood 로 꺼졌던 전역 stopped 는 푼다 (인증·일일상한은 유지)
    if (
      this.stopped &&
      (this.lastError === 'timeout:mtproto_streak' ||
        (this.lastError ?? '').startsWith('flood_wait'))
    ) {
      this.stopped = false;
      this.lastError = null;
    }
    if (allAccountsBlocked(this.accounts)) {
      this.logger.warn(
        '모든 수집 계정이 FloodWait 중이라 이번 run 은 t.me 로 수집합니다.',
      );
    }
  }

  /** 키워드 검색·초대 링크 확인·가입·발견용으로 남겨 두는 요청 수 */
  specialReserve(): number {
    return mtprotoSpecialReserve({
      inviteCheckDaily: this.inviteCheckDailyLimit(),
      joinDaily: this.joinDailyLimit(),
      keywordSearchDaily: this.searchDailyLimit(),
      resolveDaily: this.resolveDailyLimit(),
    });
  }

  /** 수집(채널 정보·글 읽기)은 예비분을 남기고 쓴다 */
  private canSpendCollect(): boolean {
    return canSpendForCollect(this.remainingRequests(), this.specialReserve());
  }

  canCollect(channel: Channel): boolean {
    if (!this.canUseMtproto()) return false;
    if (!this.canSpendCollect()) return false;
    if (isInviteOnlyLink(channel.link)) return false;
    if (channel.collectStatus === 'invite_expired') return false;
    return Boolean(this.resolveUsername(channel));
  }

  async collectAndSave(channel: Channel): Promise<MtprotoCollectResult> {
    if (!this.canUseMtproto()) {
      return { ok: false, reason: 'disabled' };
    }
    if (!this.canCollect(channel)) {
      return { ok: false, reason: 'skipped' };
    }
    const username = this.resolveUsername(channel);
    if (!username) return { ok: false, reason: 'skipped' };

    try {
      const stored = await this.loadStoredAccess(channel.id);
      const data = await this.readPublicChannel(username, stored, channel.id);
      await this.persist(channel, data);
      await this.mergeSameTelegramChat(channel);
      return { ok: true, mode: 'mtproto' };
    } catch (error) {
      if (error instanceof FloodWaitTooLongError) {
        return { ok: false, reason: 'disabled' };
      }
      if (isMtprotoTimeoutError(error)) {
        return { ok: false, reason: 'failed' };
      }
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
        return { ok: false, reason: 'failed' };
      }
      const code = mtprotoErrorCode(error);
      if (code === 'RESOLVE_DAILY_LIMIT') {
        return { ok: false, reason: 'skipped' };
      }
      this.lastError = code;
      if (
        code === 'USERNAME_NOT_OCCUPIED' ||
        code === 'USERNAME_INVALID' ||
        code === 'CHANNEL_INVALID'
      ) {
        return { ok: false, reason: 'invalid' };
      }
      this.logger.warn(`MTProto 수집 실패(${username}): ${code}`);
      return { ok: false, reason: 'failed' };
    }
  }

  /**
   * 초대 링크(@아이디 없는) 방: 수집 계정이 "이미 회원"일 때만 글 정보까지 읽는다.
   * 가입(ImportChatInvite)은 절대 하지 않는다. 회원이 아니면 not_member → 공개 초대 페이지로 넘긴다.
   */
  /** 텔레그램 코드가 없을 때 오류 문장 앞부분. 세션 문자열은 넣지 않는다 */
  private lastErrorDetail: string | null = null;

  lastErrorCode(): string | null {
    if (!this.lastError) return null;
    return this.lastErrorDetail
      ? `${this.lastError} · ${this.lastErrorDetail}`
      : this.lastError;
  }

  canCollectInvite(channel: Channel): boolean {
    if (!this.canUseMtproto()) return false;
    if (channel.collectStatus === 'invite_expired') return false;
    return (
      isInviteOnlyLink(channel.link) && inviteHashFromLink(channel.link) != null
    );
  }

  async collectInviteAndSave(channel: Channel): Promise<MtprotoCollectResult> {
    if (!this.canCollectInvite(channel))
      return { ok: false, reason: 'skipped' };
    const hash = inviteHashFromLink(channel.link) as string;
    try {
      const Api = await this.api();
      const stored = await this.loadStoredAccess(channel.id);
      let resolved: ResolvedPublicChannel | null = null;
      if (stored && canReuseStoredAccess(stored) && !this.canSpendCollect()) {
        // 이미 가입한 방 다시 읽기는 "수집"이라 예비분을 건드리지 않는다
        return { ok: false, reason: 'skipped' };
      }
      if (stored && canReuseStoredAccess(stored)) {
        try {
          resolved = await this.fetchFullFromInput(
            Api,
            '',
            stored.telegramChatId,
            stored.telegramAccessHash,
          );
        } catch (error) {
          if (!isStoredAccessInvalid(mtprotoErrorCode(error))) throw error;
          await this.channelRepository.update(channel.id, {
            telegramAccessHash: null,
          });
        }
      }
      if (!resolved && channel.linkType === LinkType.GROUP) {
        // 그룹은 가입하지 않고(대화 저장 금지) 수집 계정이 회원일 일도 거의 없다.
        // 하루 40번인 초대 링크 확인을 그룹에 쓰면 정작 가입할 채널 확인이 밀린다
        return { ok: false, reason: 'not_member' };
      }
      if (!resolved) {
        // 초대 링크 확인은 resolve(아이디 조회) 한도와 따로 센다.
        // 같이 세면 새벽 발견이 resolve 를 다 써서 낮에는 비공개 채널 확인·가입이 막힌다
        if (this.invitesToday >= this.inviteCheckDailyLimit()) {
          return { ok: false, reason: 'skipped' };
        }
        const invite = await this.call(
          'messages.CheckChatInvite',
          new Api.messages.CheckChatInvite({ hash }),
        );
        let chat = memberChatFromInvite(invite);
        if (chat) {
          this.noteJoinOutcome('이미 회원');
        } else if (isJoinableChannelInvite(invite)) {
          // 비공개 채널: 하루 한도·전체 950·간격 3분 안에서 가입하고 글까지 읽는다
          chat = await this.tryJoinInvite(Api, hash, channel.id);
        } else if (
          isRequestNeededChannel(invite) &&
          this.joinRequestAutoEnabled() &&
          !channel.joinRequestedAt &&
          (inviteMetadata(invite)?.participantsCount ??
            channel.memberCount ??
            0) >= JOIN_REQUEST_AUTO_MIN_MEMBERS &&
          canSendJoinRequest({
            requestsToday: this.currentJoinRequestsToday(),
            dailyMax: this.joinRequestDailyLimit(),
            lastRequestAt: this.lastJoinRequestAt,
            now: Date.now(),
            alreadyRequested: false,
          })
        ) {
          // 승인 필요한 "값나가는"(회원 많은) 방: 하루 소량 자동 입장 요청(밴 방지)
          chat = await this.requestJoinInvite(Api, hash, channel);
        } else {
          this.noteJoinOutcome(describeUnjoinableInvite(invite));
        }
        if (!chat) {
          // 엿보기·가입이 안 돼도 CheckChatInvite 가 준 제목·소개·회원수는 넘겨준다(A안)
          return {
            ok: false,
            reason: 'not_member',
            inviteMeta: inviteMetadata(invite) ?? undefined,
          };
        }
        resolved = await this.fetchFullFromInput(
          Api,
          '',
          chat.id,
          chat.accessHash,
          {
            title: chat.title,
            date: chat.date,
            megagroup: chat.megagroup,
            broadcast: chat.broadcast,
          },
        );
      }
      const history = await this.fetchHistory(resolved);
      await this.persist(channel, { ...resolved, ...history });
      await this.mergeSameTelegramChat(channel);
      return { ok: true, mode: 'mtproto' };
    } catch (error) {
      if (error instanceof FloodWaitTooLongError)
        return { ok: false, reason: 'disabled' };
      if (isMtprotoTimeoutError(error)) return { ok: false, reason: 'failed' };
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
        return { ok: false, reason: 'failed' };
      }
      const code = mtprotoErrorCode(error);
      if (code === 'RESOLVE_DAILY_LIMIT')
        return { ok: false, reason: 'skipped' };
      this.lastError = code;
      this.lastErrorDetail =
        code === 'mtproto_error' && error instanceof Error
          ? error.message.replace(/[A-Za-z0-9+/=]{40,}/g, '…').slice(0, 160)
          : null;
      if (code === 'INVITE_HASH_EXPIRED' || code === 'INVITE_HASH_INVALID') {
        return { ok: false, reason: 'invalid' };
      }
      this.logger.warn(
        `MTProto 초대 링크 수집 실패: ${code}${this.lastErrorDetail ? ` (${this.lastErrorDetail})` : ''}`,
      );
      return { ok: false, reason: 'failed' };
    }
  }

  private noteJoinOutcome(label: string): void {
    const today = formatKstYmd();
    if (this.joinOutcomeDay !== today) {
      this.joinOutcomeDay = today;
      this.joinOutcomes = {};
    }
    this.joinOutcomes[label] = (this.joinOutcomes[label] ?? 0) + 1;
  }

  private todayJoinOutcomes(): Record<string, number> {
    return this.joinOutcomeDay === formatKstYmd()
      ? { ...this.joinOutcomes }
      : {};
  }

  private joinDailyLimit(): number {
    const raw = this.configService.get<string>('MTPROTO_JOIN_DAILY');
    // 명시값은 그대로 존중(0=가입 끔). 미설정이면 기본 15 × 계정 수.
    if (raw != null && String(raw).trim() !== '') return parseJoinDaily(raw);
    return MTPROTO_JOIN_DAILY_DEFAULT * this.poolSize();
  }

  private currentJoinsToday(): number {
    const today = formatKstYmd();
    if (this.joinDay !== today) {
      this.joinDay = today;
      this.joinsToday = 0;
    }
    return this.joinsToday;
  }

  /** 입장 요청 하루 한도(밴 방지로 소량·계정 수만큼은 안 늘림). 0 이면 끔. */
  private joinRequestDailyLimit(): number {
    const raw = this.configService.get<string>('MTPROTO_JOIN_REQUEST_DAILY');
    if (raw != null && String(raw).trim() !== '') {
      const n = Number(raw);
      return Number.isFinite(n) && n >= 0 ? Math.floor(n) : JOIN_REQUEST_DAILY_DEFAULT;
    }
    return JOIN_REQUEST_DAILY_DEFAULT;
  }

  /** 자동 입장 요청을 켤지 (기본 켜짐, env 로 끌 수 있음) */
  private joinRequestAutoEnabled(): boolean {
    const raw = this.configService.get<string>('MTPROTO_JOIN_REQUEST_AUTO');
    if (raw == null || String(raw).trim() === '') return true;
    return String(raw).trim().toLowerCase() !== 'false';
  }

  private currentJoinRequestsToday(): number {
    const today = formatKstYmd();
    if (this.joinRequestDay !== today) {
      this.joinRequestDay = today;
      this.joinRequestsToday = 0;
    }
    return this.joinRequestsToday;
  }

  /**
   * 승인 필요 비공개 방에 입장 요청(ImportChatInvite)을 보낸다.
   * 성공(바로 가입)하면 그 채널을 돌려주고, "요청 접수"면 joinRequestedAt 을 기록하고 null.
   * 한도·간격·중복은 호출 전에 canSendJoinRequest 로 거른다.
   */
  private async requestJoinInvite(
    Api: typeof import('telegram').Api,
    hash: string,
    channel: Channel,
  ): Promise<ReturnType<typeof joinedChannelFromUpdates>> {
    this.lastJoinRequestAt = Date.now();
    this.currentJoinRequestsToday();
    this.joinRequestsToday += 1;
    this.saveJoinCounters();
    try {
      const res = await this.call(
        'messages.ImportChatInvite',
        new Api.messages.ImportChatInvite({ hash }),
      );
      // 승인 없이 바로 가입된 경우(간혹) — 멤버가 됨
      const joined = joinedChannelFromUpdates(res);
      if (joined) {
        this.noteJoinOutcome('요청 없이 가입됨');
        this.joinedTotal += 1;
        this.saveJoinCounters();
      }
      // 요청을 보냈으니 기록은 남긴다(가입됐어도 요청 시도 기록)
      await this.channelRepository.update(channel.id, {
        joinRequestedAt: new Date(),
      });
      return joined;
    } catch (error) {
      if (wasJoinRequestSent(error)) {
        await this.channelRepository.update(channel.id, {
          joinRequestedAt: new Date(),
        });
        this.noteJoinOutcome('입장 요청 보냄');
        return null;
      }
      // flood·인증 등은 원래 흐름(call)에서 이미 처리됨. 여기선 카운터만 되돌린다.
      this.joinRequestsToday = Math.max(0, this.joinRequestsToday - 1);
      this.saveJoinCounters();
      this.noteJoinOutcome('입장 요청 실패');
      return null;
    }
  }

  /**
   * 어드민이 고른 한 방에 수동으로 입장 요청. 한도/간격/중복을 지키고 결과 문구를 돌려준다.
   */
  async requestJoinForChannel(channelId: string): Promise<{
    ok: boolean;
    outcome: string;
  }> {
    if (!this.canUseMtproto()) {
      return { ok: false, outcome: 'MTProto 를 쓸 수 없음(꺼짐·중단·한도)' };
    }
    const channel = await this.channelRepository.findOne({
      where: { id: channelId },
    });
    if (!channel) return { ok: false, outcome: '방을 찾을 수 없음' };
    const hash = inviteHashFromLink(channel.link);
    if (!hash) return { ok: false, outcome: '초대 링크가 아님' };
    if (channel.joinRequestedAt) {
      return { ok: false, outcome: '이미 입장 요청함' };
    }
    if (
      !canSendJoinRequest({
        requestsToday: this.currentJoinRequestsToday(),
        dailyMax: this.joinRequestDailyLimit(),
        lastRequestAt: this.lastJoinRequestAt,
        now: Date.now(),
        alreadyRequested: false,
      })
    ) {
      return {
        ok: false,
        outcome: `오늘 입장 요청 한도(${this.joinRequestDailyLimit()}) 초과 또는 간격 대기 중`,
      };
    }
    const { Api } = await import('telegram');
    const invite = await this.call(
      'messages.CheckChatInvite',
      new Api.messages.CheckChatInvite({ hash }),
    );
    if (memberChatFromInvite(invite)) {
      return { ok: true, outcome: '이미 회원입니다(글 읽기 가능)' };
    }
    if (!isRequestNeededChannel(invite) && !isJoinableChannelInvite(invite)) {
      return { ok: false, outcome: describeUnjoinableInvite(invite) };
    }
    await this.requestJoinInvite(Api, hash, channel);
    return { ok: true, outcome: '입장 요청을 보냈습니다(운영자 승인 대기)' };
  }

  /** 가입 1건. 실패·한도면 null (회원 아님으로 처리 → 공개 초대 페이지만 읽음) */
  private async tryJoinInvite(
    Api: typeof import('telegram').Api,
    hash: string,
    channelId: string,
  ): Promise<ReturnType<typeof joinedChannelFromUpdates>> {
    if (
      !canJoinAnother({
        joinsToday: this.currentJoinsToday(),
        dailyMax: this.joinDailyLimit(),
        joinedTotal: this.joinedTotal,
        lastJoinAt: this.lastJoinAt,
        now: Date.now(),
        blocked: this.joinBlocked,
      })
    ) {
      this.noteJoinOutcome(
        this.joinBlocked
          ? '가입 수 한도'
          : this.currentJoinsToday() >= this.joinDailyLimit()
            ? '오늘 가입 한도'
            : '간격 3분 대기',
      );
      return null;
    }
    this.lastJoinAt = Date.now();
    try {
      const result = await this.call(
        'messages.ImportChatInvite',
        new Api.messages.ImportChatInvite({ hash }),
      );
      this.joinsToday += 1;
      this.joinedTotal += 1;
      this.saveJoinCounters();
      const chat = joinedChannelFromUpdates(result);
      this.noteJoinOutcome(chat ? '가입 성공' : '가입했지만 채널 정보 없음');
      this.logger.log(
        `비공개 채널 가입(${channelId}): 오늘 ${this.joinsToday} / 전체 ${this.joinedTotal}`,
      );
      return chat;
    } catch (error) {
      const code = mtprotoErrorCode(error);
      this.noteJoinOutcome(`가입 오류 ${code}`);
      if (code === 'CHANNELS_TOO_MUCH') {
        this.joinBlocked = true;
        this.logger.warn('가입 채널 수 한도에 닿아 자동 가입을 멈춥니다.');
        return null;
      }
      if (code === 'USER_ALREADY_PARTICIPANT') return null;
      if (
        code === 'INVITE_REQUEST_SENT' ||
        code === 'INVITE_HASH_EXPIRED' ||
        code === 'INVITE_HASH_INVALID'
      ) {
        return null;
      }
      // 시간 초과·FloodWait·인증 오류는 원래 흐름에서 처리
      throw error;
    }
  }

  private async restoreJoinCounters(): Promise<void> {
    try {
      if (this.dailyStore) {
        const saved = await this.dailyStore.load<{ joins: number }>(
          MTPROTO_JOIN_DAILY_KEY,
        );
        this.currentJoinsToday();
        if (saved) {
          this.joinsToday = Math.max(this.joinsToday, safeCount(saved.joins));
        }
      }
      const row = await this.settings?.findOneBy({
        key: MTPROTO_JOIN_TOTAL_KEY,
      });
      if (row) this.joinedTotal = safeCount(Number(row.value));
      if (this.dailyStore) {
        const savedReq = await this.dailyStore.load<{ requests: number }>(
          MTPROTO_JOIN_REQUEST_DAILY_KEY,
        );
        this.currentJoinRequestsToday();
        if (savedReq) {
          this.joinRequestsToday = Math.max(
            this.joinRequestsToday,
            safeCount(savedReq.requests),
          );
        }
      }
    } catch (error) {
      this.logger.warn(
        `가입 수 불러오기 실패: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private saveJoinCounters(): void {
    this.dailyStore?.schedule(MTPROTO_JOIN_DAILY_KEY, () => {
      this.currentJoinsToday();
      return { date: this.joinDay, values: { joins: this.joinsToday } };
    });
    this.dailyStore?.schedule(MTPROTO_JOIN_REQUEST_DAILY_KEY, () => {
      this.currentJoinRequestsToday();
      return {
        date: this.joinRequestDay,
        values: { requests: this.joinRequestsToday },
      };
    });
    void this.settings
      ?.save({ key: MTPROTO_JOIN_TOTAL_KEY, value: String(this.joinedTotal) })
      .catch((error: unknown) =>
        this.logger.warn(
          `가입 전체 수 저장 실패: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
  }

  /**
   * 같은 텔레그램 방(같은 텔레그램 ID)이 서로 다른 링크로 여러 번 등록된 경우 하나만 남긴다.
   * 초대 링크는 방마다 여러 개라 링크로는 같은 방인지 알 수 없어, 텔레그램 ID 를 안 뒤에 합친다.
   * 남길 행: 인증 > 광고 > 즐겨찾기·추천 > 먼저 등록. 나머지는 merged(숨김)로 두고 기록만 남긴다(지우지 않음).
   */
  private async mergeSameTelegramChat(channel: Channel): Promise<void> {
    try {
      if (channel.telegramChatId == null) return;
      const rows = await this.channelRepository.find({
        where: {
          telegramChatId: channel.telegramChatId,
          status: ChannelStatus.ACTIVE,
        },
      });
      const live = rows.filter((row) => row.collectStatus !== 'merged');
      if (live.length < 2) return;
      const favorites = await this.channelRepository.manager
        .createQueryBuilder()
        .select('f.channel_id', 'id')
        .addSelect('COUNT(*)', 'n')
        .from('channel_favorites', 'f')
        .where('f.channel_id IN (:...ids)', { ids: live.map((row) => row.id) })
        .groupBy('f.channel_id')
        .getRawMany<{ id: string; n: string | number }>();
      const favById = new Map(
        favorites.map((row) => [String(row.id), Number(row.n) || 0]),
      );
      const keep = pickKeepChannel(
        live.map((row) => ({
          id: row.id,
          title: row.title,
          isVerified: Boolean(row.isVerified),
          isPromoted: Boolean(row.isPromoted),
          favoriteCount: favById.get(row.id) ?? 0,
          recommendCount: row.recommendCount ?? 0,
          postCount: 0,
          createdAt: row.createdAt,
        })),
      );
      for (const row of live) {
        if (row.id === keep.id) continue;
        await this.channelRepository.update(row.id, {
          collectStatus: 'merged',
        });
        await this.eventRepository.save({
          channelId: row.id,
          type: 'merged_into',
          before: row.link,
          after: keep.id,
          occurredAt: new Date(),
        });
        this.logger.log(`같은 텔레그램 방 합침: ${row.id} → ${keep.id}`);
      }
    } catch (error) {
      this.logger.warn(
        `같은 텔레그램 방 합치기 실패: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /** ResolveUsername + GetFullChannel 만. 게시글·가입은 하지 않습니다. */
  async inspectPublicUsername(usernameRaw: string): Promise<{
    username: string;
    title: string | null;
    description: string | null;
    memberCount: number | null;
    linkType: LinkType;
    kind: 'channel' | 'group';
  } | null> {
    if (!this.canUseMtproto()) return null;
    if (this.remainingResolves() < 1) return null;
    const username = usernameRaw.replace(/^@/, '').trim().toLowerCase();
    if (!username) return null;
    try {
      const resolved = await this.resolvePublicChannel(username, null, null);
      const kind = resolved.linkType === LinkType.GROUP ? 'group' : 'channel';
      return {
        username: resolved.username,
        title: resolved.title,
        description: resolved.description,
        memberCount: resolved.memberCount,
        linkType: resolved.linkType,
        kind,
      };
    } catch (error) {
      const code = mtprotoErrorCode(error);
      if (code === 'RESOLVE_DAILY_LIMIT') return null;
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
      } else {
        this.lastError = code;
      }
      return null;
    }
  }

  /** contacts.Search. 사용자 계정은 파서에서 버립니다. 가입하지 않습니다. */
  async searchPublicByKeyword(query: string): Promise<PublicSearchHit[]> {
    if (!this.canUseMtproto()) return [];
    if (this.remainingSearches() < 1) return [];
    const q = query.trim();
    if (!q) return [];
    try {
      const Api = await this.api();
      const result = await this.call(
        'contacts.Search',
        new Api.contacts.Search({ q, limit: 20 }),
      );
      return publicUsernamesFromContactsSearch(
        result as { chats?: unknown[]; users?: unknown[] },
      );
    } catch (error) {
      const code = mtprotoErrorCode(error);
      if (code === 'SEARCH_DAILY_LIMIT') return [];
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
      } else {
        this.lastError = code;
      }
      return [];
    }
  }

  async testPublicUsername(usernameRaw: string): Promise<MtprotoTestSummary> {
    if (!this.canUseMtproto()) {
      return { ok: false, reason: 'disabled' };
    }
    const username = usernameRaw.replace(/^@/, '').trim().toLowerCase();
    if (!username) return { ok: false, reason: 'invalid' };
    try {
      const data = await this.readPublicChannel(username, null, null);
      if (data.linkType === LinkType.GROUP) {
        return {
          ok: true,
          username,
          memberCount: data.memberCount,
          createdOn: data.createdOn?.toISOString() ?? null,
          recentPosts: 0,
          avgViews: null,
          forwardedPosts: 0,
          editedPosts: 0,
          activity24h: data.activity.activity24h,
          activity7d: data.activity.activity7d,
        };
      }
      const views = data.posts
        .map((p) => p.views)
        .filter((v): v is number => v != null);
      const avgViews =
        views.length > 0
          ? Math.round(views.reduce((a, b) => a + b, 0) / views.length)
          : null;
      return {
        ok: true,
        username,
        memberCount: data.memberCount,
        createdOn: data.createdOn?.toISOString() ?? null,
        recentPosts: data.posts.length,
        avgViews,
        forwardedPosts: data.posts.filter((p) => Boolean(p.forwardedFrom))
          .length,
        editedPosts: data.posts.filter((p) => p.isEdited).length,
      };
    } catch (error) {
      if (isMtprotoAuthFatal(error)) {
        await this.stopForAuth(error);
      }
      return { ok: false, reason: mtprotoErrorCode(error) };
    }
  }

  private async readPublicChannel(
    username: string,
    stored: {
      telegramChatId: number | null;
      telegramAccessHash: string | null;
    } | null,
    channelId: string | null,
  ): Promise<{
    username: string;
    title: string | null;
    description: string | null;
    memberCount: number | null;
    createdOn: Date | null;
    telegramChatId: number | null;
    inputChannel: { channelId: unknown; accessHash: unknown };
    linkType: LinkType;
    linkedChat: LinkedChatInfo | null;
    posts: HistoryPost[];
    activity: GroupActivityCounts;
    groupLanguage?: GroupHistorySummary['language'];
    hangulRatio?: number | null;
  }> {
    const resolved = await this.resolvePublicChannel(
      username,
      stored,
      channelId,
    );
    const history = await this.fetchHistory(resolved);
    return { ...resolved, ...history };
  }

  private async resolvePublicChannel(
    username: string,
    stored: {
      telegramChatId: number | null;
      telegramAccessHash: string | null;
    } | null,
    channelId: string | null,
  ): Promise<ResolvedPublicChannel> {
    const Api = await this.api();
    if (stored && canReuseStoredAccess(stored)) {
      try {
        return await this.fetchFullFromInput(
          Api,
          username,
          stored.telegramChatId,
          stored.telegramAccessHash,
        );
      } catch (error) {
        const code = mtprotoErrorCode(error);
        if (!isStoredAccessInvalid(code)) throw error;
        if (channelId) {
          await this.channelRepository.update(channelId, {
            telegramAccessHash: null,
          });
        }
      }
    }
    if (!canSpendResolve(this.resolvesToday, this.resolveDailyLimit())) {
      throw new Error('RESOLVE_DAILY_LIMIT');
    }
    const result = (await this.call(
      'contacts.ResolveUsername',
      new Api.contacts.ResolveUsername({ username }),
    )) as {
      peer?: { className?: string; channelId?: unknown };
      chats?: Array<{
        className?: string;
        id?: unknown;
        title?: string;
        accessHash?: unknown;
        date?: number;
        megagroup?: boolean;
        broadcast?: boolean;
      }>;
    };

    const peer = result.peer;
    if (!peer || peer.className === 'PeerUser' || peer.channelId == null) {
      throw new Error('USERNAME_INVALID');
    }

    const chat = (result.chats ?? []).find(
      (item) => String(item.id) === String(peer.channelId),
    );
    if (!chat || chat.accessHash == null) {
      throw new Error('CHANNEL_INVALID');
    }

    return this.fetchFullFromInput(Api, username, chat.id, chat.accessHash, {
      title: chat.title,
      date: chat.date,
      megagroup: chat.megagroup,
      broadcast: chat.broadcast,
    });
  }

  private async fetchFullFromInput(
    Api: typeof import('telegram').Api,
    username: string,
    channelId: unknown,
    accessHash: unknown,
    hints?: {
      title?: string;
      date?: number;
      megagroup?: boolean;
      broadcast?: boolean;
    },
  ): Promise<ResolvedPublicChannel> {
    const hash = serializeAccessHash(accessHash);
    if (hash == null) throw new Error('CHANNEL_INVALID');
    const full = (await this.call(
      'channels.GetFullChannel',
      new Api.channels.GetFullChannel({
        channel: new Api.InputChannel({
          channelId: channelId as never,
          accessHash: BigInt(hash) as never,
        }),
      }),
    )) as {
      fullChat?: {
        about?: string;
        participantsCount?: number;
        linkedChatId?: unknown;
      };
      chats?: Array<{
        id?: unknown;
        date?: number;
        title?: string;
        username?: string | null;
        megagroup?: boolean;
        broadcast?: boolean;
      }>;
    };
    // chats[] 에는 연결된 대화방도 같이 온다. 순서에 기대지 말고 id 로 고른다
    const chat = pickChatById(full.chats, channelId);
    const isGroup =
      Boolean(hints?.megagroup ?? chat?.megagroup) &&
      !(hints?.broadcast ?? chat?.broadcast);
    return {
      username,
      title: hints?.title?.trim() || chat?.title?.trim() || null,
      description: full.fullChat?.about?.trim() || null,
      memberCount:
        typeof full.fullChat?.participantsCount === 'number'
          ? full.fullChat.participantsCount
          : null,
      createdOn: unixSecondsToDate(hints?.date ?? chat?.date),
      telegramChatId: Number(channelId),
      linkType: isGroup ? LinkType.GROUP : LinkType.CHANNEL,
      inputChannel: { channelId, accessHash: hash },
      linkedChat: parseLinkedChat(full),
    };
  }

  private async fetchHistory(resolved: ResolvedPublicChannel): Promise<{
    posts: HistoryPost[];
    activity: GroupActivityCounts;
    groupLanguage?: GroupHistorySummary['language'];
    hangulRatio?: number | null;
  }> {
    if (resolved.linkType === LinkType.GROUP) {
      const nowMs = Date.now();
      const latest = await this.getHistory(resolved, 1, 0);
      const latestId = firstHistoryMessageId(latest);
      const latestPostedAtMs = firstHistoryMessagePostedAtMs(latest);
      const dayAgo = await this.getHistory(
        resolved,
        1,
        unixSecondsAgo(GROUP_ACTIVITY_DAY_MS, nowMs),
      );
      const weekAgo = await this.getHistory(
        resolved,
        1,
        unixSecondsAgo(GROUP_ACTIVITY_WEEK_MS, nowMs),
      );
      const recent = await this.getHistory(resolved, MTPROTO_HISTORY_LIMIT, 0);
      const summary = summarizeGroupHistory(recent, {
        title: resolved.title,
        description: resolved.description,
        nowMs,
      });
      return {
        posts: [],
        activity: {
          activity24h: activityInWindow({
            latestId,
            latestPostedAtMs,
            baselineId: firstHistoryMessageId(dayAgo),
            windowMs: GROUP_ACTIVITY_DAY_MS,
            nowMs,
          }),
          activity7d: activityInWindow({
            latestId,
            latestPostedAtMs,
            baselineId: firstHistoryMessageId(weekAgo),
            windowMs: GROUP_ACTIVITY_WEEK_MS,
            nowMs,
          }),
        },
        groupLanguage: summary.language,
        hangulRatio: summary.hangulRatio,
      };
    }

    const messages = await this.getHistory(resolved, MTPROTO_HISTORY_LIMIT, 0);
    const posts: HistoryPost[] = [];
    for (const raw of messages) {
      const parsed = this.parseHistoryMessage(raw, resolved.username);
      if (parsed) posts.push(parsed);
    }
    return { posts, activity: { activity24h: 0, activity7d: 0 } };
  }

  private async getHistory(
    resolved: ResolvedPublicChannel,
    limit: number,
    offsetDate: number,
  ): Promise<unknown[]> {
    const Api = await this.api();
    const hash = serializeAccessHash(resolved.inputChannel.accessHash);
    if (hash == null) throw new Error('CHANNEL_INVALID');
    const result = (await this.call(
      'messages.GetHistory',
      new Api.messages.GetHistory({
        peer: new Api.InputPeerChannel({
          channelId: resolved.inputChannel.channelId as never,
          accessHash: BigInt(hash) as never,
        }),
        offsetId: 0,
        offsetDate,
        addOffset: 0,
        limit,
        maxId: 0,
        minId: 0,
        hash: 0 as never,
      }),
    )) as { messages?: unknown[] };
    return result.messages ?? [];
  }

  private parseHistoryMessage(
    raw: unknown,
    selfUsername: string,
  ): HistoryPost | null {
    if (!raw || typeof raw !== 'object') return null;
    const msg = raw as {
      className?: string;
      id?: number;
      date?: number;
      views?: number;
      forwards?: number;
      editDate?: number;
      message?: string;
      entities?: Array<{ url?: string }>;
      media?: { className?: string };
      fwdFrom?: {
        fromId?: { className?: string; channelId?: unknown };
        fromName?: string;
      };
    };
    if (msg.className && msg.className !== 'Message') return null;
    if (typeof msg.id !== 'number' || msg.id <= 0) return null;
    const postedAt = unixSecondsToDate(msg.date);
    if (!postedAt) return null;

    const text = typeof msg.message === 'string' ? msg.message : '';
    return {
      messageId: msg.id,
      postedAt,
      views: typeof msg.views === 'number' ? msg.views : null,
      forwards: typeof msg.forwards === 'number' ? msg.forwards : null,
      mediaType: this.mediaType(msg.media?.className),
      forwardedFrom: this.forwardSource(msg.fwdFrom),
      isEdited: typeof msg.editDate === 'number' && msg.editDate > 0,
      mentionedUsernames: extractTmeUsernamesFromHtml(text, selfUsername),
      // 글자 그대로 쓴 링크 + 글자에 숨겨 건 링크(텍스트 링크) 모두
      inviteHashes: extractTmeInvitesFromText(
        [
          text,
          ...(msg.entities ?? []).map((e) =>
            typeof e.url === 'string' ? e.url : '',
          ),
        ].join(' '),
      ),
      textExcerpt: clipPostExcerpt(text, MTPROTO_EXCERPT_MAX),
    };
  }

  private forwardSource(
    fwdFrom:
      | {
          fromId?: { className?: string; channelId?: unknown };
          fromName?: string;
        }
      | undefined,
  ): string | null {
    if (!fwdFrom?.fromId) return null;
    if (fwdFrom.fromId.className === 'PeerChannel') {
      return fwdFrom.fromId.channelId != null
        ? `channel:${asText(fwdFrom.fromId.channelId)}`
        : 'channel';
    }
    return null;
  }

  private mediaType(className?: string): ChannelPostMediaType {
    const name = (className ?? '').toLowerCase();
    if (name.includes('photo')) return 'photo';
    if (name.includes('video')) return 'video';
    if (name.includes('document')) return 'file';
    if (!name || name.includes('empty')) return 'text';
    return 'other';
  }

  private async persist(
    channel: Channel,
    data: {
      username: string;
      title: string | null;
      description: string | null;
      memberCount: number | null;
      createdOn: Date | null;
      telegramChatId: number | null;
      inputChannel: { channelId: unknown; accessHash: unknown };
      linkType: LinkType;
      linkedChat?: LinkedChatInfo | null;
      posts: HistoryPost[];
      activity: GroupActivityCounts;
      groupLanguage?: GroupHistorySummary['language'];
      hangulRatio?: number | null;
    },
  ) {
    const now = new Date();
    const savePosts = shouldSaveMtprotoPosts(data.linkType);
    if (!savePosts) {
      await this.postRepository.delete({ channelId: channel.id });
    }
    const fetchedIds = savePosts ? data.posts.map((p) => p.messageId) : [];
    if (fetchedIds.length > 0) {
      const min = Math.min(...fetchedIds);
      const existing = await this.postRepository.find({
        where: { channelId: channel.id, deletedAt: IsNull() },
        select: ['messageId'],
      });
      const missing = deletedMessageIds(
        existing.map((row) => row.messageId),
        fetchedIds,
      ).filter((id) => id >= min);
      if (missing.length > 0) {
        await this.postRepository.update(
          { channelId: channel.id, messageId: In(missing) },
          { deletedAt: now },
        );
      }
    }

    if (savePosts && data.posts.length > 0) {
      const previous = await this.postRepository.find({
        where: {
          channelId: channel.id,
          messageId: In(data.posts.map((p) => p.messageId)),
        },
      });
      const prevMap = new Map(previous.map((row) => [row.messageId, row]));
      await this.inviteQueue?.enqueue(
        data.posts.flatMap((p) => p.inviteHashes ?? []),
      );
      await this.postRepository.upsert(
        data.posts.map((post) => {
          const old = prevMap.get(post.messageId);
          const edited = post.isEdited || Boolean(old?.isEdited);
          return {
            channelId: channel.id,
            messageId: post.messageId,
            postedAt: post.postedAt,
            views: post.views,
            mediaType: post.mediaType,
            forwardedFrom: post.forwardedFrom,
            mentionedUsernames: joinMentionedUsernames(post.mentionedUsernames),
            textExcerpt: post.textExcerpt,
            isEdited: edited,
            lastSeenAt: now,
            deletedAt: null,
          };
        }),
        ['channelId', 'messageId'],
      );
    }

    const wasGone = channel.collectStatus === 'gone';
    const isFirst = channel.firstObservedAt == null;
    const nextTitle = data.title?.trim() || null;
    if (isFirst) {
      channel.firstObservedAt = now;
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'first_seen',
        before: null,
        after: nextTitle ?? data.username,
        occurredAt: now,
      });
    } else if (
      nextTitle &&
      nextTitle !== channel.title &&
      !isTitleLocked(channel)
    ) {
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'title_changed',
        before: channel.title,
        after: nextTitle,
        occurredAt: now,
      });
    }
    if (wasGone) {
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'returned',
        before: 'gone',
        after: 'ok',
        occurredAt: now,
      });
    }
    // 제목 고정이면 수집 제목으로 덮어쓰지 않는다(소개글은 계속 갱신)
    applyCollectedTitle(channel, nextTitle);
    // 초대 링크 방은 @아이디가 없다(빈 값으로 덮지 않음)
    if (data.username) channel.username = data.username;
    if (data.memberCount != null) channel.memberCount = data.memberCount;
    if (data.description) channel.description = data.description;
    if (data.telegramChatId != null)
      channel.telegramChatId = data.telegramChatId;
    const accessHash = serializeAccessHash(data.inputChannel.accessHash);
    if (accessHash) channel.telegramAccessHash = accessHash;
    if (data.createdOn) channel.createdOn = data.createdOn;
    if (channel.linkType !== data.linkType) {
      await this.eventRepository.save({
        channelId: channel.id,
        type: 'type_corrected',
        before: channel.linkType,
        after: data.linkType,
        occurredAt: now,
      });
      channel.linkType = data.linkType;
    }
    channel.lastCollectedAt = now;
    channel.collectStatus = 'ok';
    channel.collectError = null;
    channel.collectFailCount = 0;
    channel.collectGoneCount = 0;
    if (!savePosts) {
      channel.posts7d = data.activity.activity7d;
      if (!channel.languageLocked) {
        if (data.groupLanguage) channel.language = data.groupLanguage;
        channel.languageHangulRatio =
          data.hangulRatio === undefined
            ? channel.languageHangulRatio
            : data.hangulRatio;
      }
    }
    // MTProto 는 정확한 회원 수를 주므로 그대로 저장했다. 다음 수집 시각을 목표 간격만큼 뒤로 민다
    channel.nextCollectAt = nextCollectAtAfterSuccess(channel, now);
    if (data.linkedChat !== undefined) {
      const linked = data.linkedChat;
      channel.linkedChatTelegramId = linked?.telegramChatId ?? null;
      channel.linkedChatTitle = linked?.title ?? null;
      channel.linkedChatUsername = linked?.username ?? null;
      channel.linkedChatCreatedOn = linked?.createdOn ?? null;
    }
    await this.channelRepository.save(channel);
    if (data.linkedChat) {
      try {
        await this.reconcileLinkedChat(channel, data.linkedChat);
      } catch (error) {
        this.logger.warn(
          `연결 대화방 연결 실패(${channel.id}): ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    const isGroup = !savePosts;
    if (data.memberCount != null || isGroup) {
      await this.snapshotRepository.upsert(
        {
          channelId: channel.id,
          capturedOn: formatKstYmd(),
          memberCount: data.memberCount ?? channel.memberCount ?? 0,
          medianViews7d: 0,
          posts7d: isGroup ? data.activity.activity7d : 0,
          forwardedRatio: 0,
          activity24h: isGroup ? data.activity.activity24h : 0,
          activity7d: isGroup ? data.activity.activity7d : 0,
        },
        ['channelId', 'capturedOn'],
      );
    }
  }

  /**
   * 채널(또는 그룹)을 MTProto 로 읽었을 때 나온 연결 상대를 우리 DB 행과 서로 잇는다.
   * MTProto 요청을 더 쓰지 않는다. 그룹에 가입하지 않는다.
   * 1) telegram_chat_id 로 같은 행  2) 공개 아이디로 같은 행
   * 3) (채널 → 비공개 대화방) 초대 링크로만 등록된 그룹 중 제목이 똑같은 것이 딱 하나면 그 행
   * 못 찾았고 공개 아이디가 있으면 발견 대기열에 넣는다.
   */
  private async reconcileLinkedChat(channel: Channel, linked: LinkedChatInfo) {
    const selfId = normalizeTelegramChatId(channel.telegramChatId);
    let other = await this.channelRepository
      .createQueryBuilder('c')
      .where('c.id <> :self', { self: channel.id })
      .andWhere('c.telegramChatId IN (:...ids)', {
        ids: telegramChatIdVariants(linked.telegramChatId),
      })
      .getOne();
    if (!other && linked.username) {
      other = await this.channelRepository
        .createQueryBuilder('c')
        .where('c.id <> :self', { self: channel.id })
        .andWhere('LOWER(c.username) = :username', {
          username: linked.username,
        })
        .getOne();
    }
    if (
      !other &&
      !linked.username &&
      linked.isGroup &&
      channel.linkType === LinkType.CHANNEL
    ) {
      const candidates = await this.channelRepository
        .createQueryBuilder('c')
        .select(['c.id', 'c.title', 'c.link'])
        .where('c.linkType = :group', { group: LinkType.GROUP })
        .andWhere('c.telegramChatId IS NULL')
        .andWhere('(c.link LIKE :plus OR c.link LIKE :joinchat)', {
          plus: '%/+%',
          joinchat: '%/joinchat/%',
        })
        .getMany();
      const hit = matchGroupByTitle(candidates, linked.title);
      if (hit) {
        other = await this.channelRepository.findOneBy({ id: hit.id });
      }
    }

    if (other) {
      const patch: Partial<Channel> = {};
      if (normalizeTelegramChatId(other.telegramChatId) == null) {
        patch.telegramChatId = linked.telegramChatId;
      }
      if (selfId != null) {
        patch.linkedChatTelegramId = selfId;
        patch.linkedChatTitle = channel.title ?? null;
        patch.linkedChatUsername = channel.username?.toLowerCase() ?? null;
        patch.linkedChatCreatedOn = channel.createdOn ?? null;
      }
      if (!other.createdOn && linked.createdOn) {
        patch.createdOn = linked.createdOn;
      }
      if (Object.keys(patch).length > 0) {
        await this.channelRepository.update(other.id, patch);
      }
      return;
    }

    if (linked.username) {
      const exists = await this.discoveredRepository.findOneBy({
        username: linked.username,
      });
      if (!exists) {
        await this.discoveredRepository.save({
          username: linked.username,
          result: 'queued',
          checkedAt: new Date(),
          mentionCount: 1,
          source: 'linked',
        });
      }
    }
  }

  private async call(method: string, request: object): Promise<unknown> {
    assertMtprotoMethodAllowed(method);
    this.rollDailyCounter();
    this.ensurePool();
    if (allAccountsBlocked(this.accounts)) {
      throw new Error('flood_wait');
    }
    const limit = this.dailyLimit();
    if (!canSpendMtprotoRequest(this.requestsToday, limit)) {
      this.lastError = 'daily_limit';
      this.stopped = true;
      throw new Error('MTPROTO_DAILY_LIMIT');
    }
    if (
      method === 'contacts.ResolveUsername' &&
      !canSpendResolve(this.resolvesToday, this.resolveDailyLimit())
    ) {
      throw new Error('RESOLVE_DAILY_LIMIT');
    }
    if (
      method === 'contacts.Search' &&
      this.searchesToday >= this.searchDailyLimit()
    ) {
      throw new Error('SEARCH_DAILY_LIMIT');
    }
    const account = this.pickAccount();
    if (!account) {
      throw new Error('flood_wait');
    }
    this.activeAccount = account;
    const client = await this.ensureClientFor(account);
    const wait = mtprotoCallGapMs({
      method,
      lastCallAt: this.lastCallAt,
      lastResolveOrSearchAt: this.lastResolveOrSearchAt,
    });
    if (wait > 0) await sleep(wait);
    this.lastCallAt = Date.now();
    this.requestsToday += 1;
    if (isResolveOrSearchMethod(method)) {
      this.lastResolveOrSearchAt = this.lastCallAt;
      if (method === 'contacts.ResolveUsername') this.resolvesToday += 1;
      if (method === 'contacts.Search') this.searchesToday += 1;
      if (method === 'messages.CheckChatInvite') this.invitesToday += 1;
    }
    this.saveDailyCounters();

    try {
      const result = await retryAfterFloodWait(
        async () =>
          withTimeout(
            client.invoke(request as never) as Promise<unknown>,
            MTPROTO_REQUEST_TIMEOUT_MS,
            'timeout:mtproto',
          ),
        sleep,
        {
          onWait: (seconds) => {
            this.logger.warn(`FloodWait ${seconds}초 대기`);
          },
        },
      );
      this.timeoutStreak = nextTimeoutStreak(this.timeoutStreak, false);
      return result;
    } catch (error) {
      if (error instanceof FloodWaitTooLongError) {
        await this.persistAccountFloodWait(account, error.seconds);
        throw error;
      }
      if (isMtprotoTimeoutError(error)) {
        this.noteRequestTimeout();
        throw error;
      }
      this.timeoutStreak = nextTimeoutStreak(this.timeoutStreak, false);
      throw error;
    }
  }

  private noteRequestTimeout() {
    this.timeoutStreak = nextTimeoutStreak(this.timeoutStreak, true);
    this.lastError = 'timeout:mtproto';
    this.logger.warn(
      `MTProto 요청 시간 초과 (${this.timeoutStreak}/${MTPROTO_TIMEOUT_STREAK_DISABLE})`,
    );
    if (shouldDisableMtprotoAfterTimeouts(this.timeoutStreak)) {
      this.disableForRun('timeout:mtproto_streak');
    }
  }

  private disableForRun(reason: string) {
    this.stopped = true;
    this.lastError = reason;
    this.logger.warn(
      `이번 run 에서 MTProto를 끄고 t.me 방식으로 계속합니다. 이유=${reason}`,
    );
  }

  /** 풀 계정 수(최소 1). 하루 한도를 이 수만큼 늘린다(C). */
  private poolSize(): number {
    return Math.max(1, this.accounts.length);
  }

  private inviteCheckDailyLimit(): number {
    return scaledDailyLimit(
      envPositiveInt(this.configService.get<string>('INVITE_CHECK_DAILY_LIMIT'), 0) || null,
      INVITE_CHECK_DAILY_LIMIT_DEFAULT,
      this.poolSize(),
    );
  }

  private resolveDailyLimit(): number {
    return scaledDailyLimit(
      envPositiveInt(this.configService.get<string>('RESOLVE_DAILY_LIMIT'), 0) || null,
      RESOLVE_DAILY_LIMIT_DEFAULT,
      this.poolSize(),
    );
  }

  private searchDailyLimit(): number {
    return scaledDailyLimit(
      envPositiveInt(this.configService.get<string>('KEYWORD_SEARCH_DAILY_LIMIT'), 0) || null,
      KEYWORD_SEARCH_DEFAULT_DAILY_LIMIT,
      this.poolSize(),
    );
  }

  private async loadStoredAccess(channelId: string): Promise<{
    telegramChatId: number | null;
    telegramAccessHash: string | null;
  } | null> {
    const row = await this.channelRepository
      .createQueryBuilder('c')
      .addSelect('c.telegramAccessHash')
      .where('c.id = :id', { id: channelId })
      .getOne();
    if (!row) return null;
    return {
      telegramChatId: row.telegramChatId ?? null,
      telegramAccessHash: row.telegramAccessHash ?? null,
    };
  }

  /** FloodWait 은 계정별로 건다. 전역 stopped 은 건드리지 않아 다른 계정이 계속 쓰인다. */
  private async persistAccountFloodWait(account: AccountSlot, seconds: number) {
    const startedAt = new Date();
    const until = floodWaitUntilFromSeconds(startedAt, seconds);
    account.floodWaitUntil = until;
    account.lastError = `flood_wait:${seconds}s`;
    this.lastError = account.lastError; // 화면 표시용(가장 최근 오류)
    this.logger.warn(
      `계정#${account.index + 1} FloodWait ${seconds}초. 이 계정만 쉬고 다른 계정으로 계속합니다.`,
    );
    await this.stateRepository.save({
      id: accountStateId(account.index),
      floodWaitStartedAt: startedAt,
      floodWaitUntil: until,
    });
  }

  /** 각 계정의 FloodWait 상태를 DB 에서 복구하고, 끝난 것은 비운다. */
  private async refreshFloodWaitFromDb() {
    for (const account of this.accounts) {
      const row = await this.stateRepository.findOne({
        where: { id: accountStateId(account.index) },
      });
      account.floodWaitUntil = row?.floodWaitUntil ?? null;
      if (
        account.floodWaitUntil &&
        !isFloodWaitBlocking(account.floodWaitUntil)
      ) {
        account.floodWaitUntil = null;
        if (account.lastError?.startsWith('flood_wait')) account.lastError = null;
        await this.stateRepository.save({
          id: accountStateId(account.index),
          floodWaitStartedAt: null,
          floodWaitUntil: null,
        });
      }
    }
  }

  private dailyLimit(): number {
    const envRaw = this.configService.get<string>('MTPROTO_DAILY_LIMIT');
    const envNum = Number(envRaw);
    const envVal =
      envRaw != null && Number.isFinite(envNum) && envNum > 0 ? envNum : null;
    return scaledDailyLimit(envVal, MTPROTO_DEFAULT_DAILY_LIMIT, this.poolSize());
  }

  /** 서버를 다시 켜도 오늘 요청·조회·검색 수가 이어지게 */
  private async restoreDailyCounters(): Promise<void> {
    if (!this.dailyStore) return;
    const saved = await this.dailyStore.load<{
      requests: number;
      resolves: number;
      searches: number;
      invites?: number;
    }>(MTPROTO_DAILY_KEY);
    this.rollDailyCounter();
    if (!saved) return;
    this.requestsToday = Math.max(
      this.requestsToday,
      safeCount(saved.requests),
    );
    this.resolvesToday = Math.max(
      this.resolvesToday,
      safeCount(saved.resolves),
    );
    this.searchesToday = Math.max(
      this.searchesToday,
      safeCount(saved.searches),
    );
    this.invitesToday = Math.max(this.invitesToday, safeCount(saved.invites));
    if (!canSpendMtprotoRequest(this.requestsToday, this.dailyLimit())) {
      this.lastError = 'daily_limit';
      this.stopped = true;
    }
  }

  private saveDailyCounters(): void {
    this.dailyStore?.schedule(MTPROTO_DAILY_KEY, () => {
      this.rollDailyCounter();
      return {
        date: this.requestDay,
        values: {
          requests: this.requestsToday,
          resolves: this.resolvesToday,
          searches: this.searchesToday,
          invites: this.invitesToday,
        },
      };
    });
  }

  private rollDailyCounter() {
    const today = formatKstYmd();
    if (this.requestDay !== today) {
      this.requestDay = today;
      this.requestsToday = 0;
      this.resolvesToday = 0;
      this.searchesToday = 0;
      this.invitesToday = 0;
      if (this.lastError === 'daily_limit') {
        this.stopped = false;
        this.lastError = null;
      }
    }
  }

  /** 라운드로빈으로 쓸 수 있는 계정을 고른다. 없으면 null. */
  private pickAccount(): AccountSlot | null {
    const idx = pickNextAccount(this.accounts, this.rrPointer);
    if (idx == null) return null;
    this.rrPointer = idx + 1;
    return this.accounts[idx];
  }

  private async ensureClientFor(
    account: AccountSlot,
  ): Promise<import('telegram').TelegramClient> {
    if (account.client) return account.client;
    if (account.connecting) {
      const ok = await account.connecting;
      if (!ok || !account.client) throw new Error('mtproto_connect_failed');
      return account.client;
    }
    account.connecting = this.connectAccount(account);
    const ok = await account.connecting;
    account.connecting = null;
    if (!ok || !account.client) throw new Error('mtproto_connect_failed');
    return account.client;
  }

  private async connectAccount(account: AccountSlot): Promise<boolean> {
    const apiIdRaw = (
      this.configService.get<string>('TELEGRAM_API_ID') ?? ''
    ).trim();
    const apiHash = (
      this.configService.get<string>('TELEGRAM_API_HASH') ?? ''
    ).trim();
    const session = account.session.trim();
    if (!/^\d+$/.test(apiIdRaw) || !apiHash || !session) {
      account.lastError = 'no_session';
      this.lastError = 'no_session';
      return false;
    }
    const { TelegramClient, sessions } = await import('telegram');
    const client = new TelegramClient(
      new sessions.StringSession(session),
      Number(apiIdRaw),
      apiHash,
      { connectionRetries: 3 },
    );
    try {
      await withTimeout(
        client.connect(),
        MTPROTO_CONNECT_TIMEOUT_MS,
        'timeout:connect',
      );
      account.client = client;
      account.lastError = null;
      return true;
    } catch (error) {
      if (isMtprotoAuthFatal(error)) {
        await this.stopAccountForAuth(account, error);
      } else {
        account.lastError = mtprotoErrorCode(error);
        this.lastError = account.lastError;
      }
      return false;
    }
  }

  private async api() {
    const { Api } = await import('telegram');
    return Api;
  }

  /** call() 안에서 인증 오류가 나면 그때 쓰던 계정만 중단한다(모르면 전체). */
  private async stopForAuth(error: unknown): Promise<void> {
    const target = this.activeAccount;
    if (target) {
      await this.stopAccountForAuth(target, error);
      return;
    }
    for (const account of this.accounts) {
      await this.stopAccountForAuth(account, error);
    }
  }

  /** 한 계정을 인증 오류로 중단. 모든 계정이 중단되면 전역으로도 멈춘다. */
  private async stopAccountForAuth(
    account: AccountSlot,
    error: unknown,
  ): Promise<void> {
    account.authStopped = true;
    account.lastError = mtprotoErrorCode(error);
    this.lastError = account.lastError;
    this.logger.warn(
      `계정#${account.index + 1} 인증 오류로 중단: ${account.lastError}`,
    );
    try {
      await account.client?.disconnect();
    } catch {
      /* ignore */
    }
    account.client = null;
    if (
      this.accounts.length > 0 &&
      this.accounts.every((a) => a.authStopped)
    ) {
      this.stopped = true;
    }
    await this.adminNotify.notifyMtprotoStopped(account.lastError);
  }

  private resolveUsername(channel: Channel): string | null {
    const fromCol = channel.username?.replace(/^@/, '').trim();
    if (fromCol) return fromCol.toLowerCase();
    return extractTelegramUsernameFromLink(channel.link);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
