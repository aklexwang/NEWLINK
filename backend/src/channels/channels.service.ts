import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { Brackets, In, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from './channel.entity';
import {
  HIDDEN_COLLECT_STATUSES,
  isPublicCollectable,
} from '../stats/collect-visibility';
import {
  isVisibleOnPublicLists,
  type ChannelLanguage,
} from './channel-language.logic';
import {
  dedupeChannelsByLink,
  normalizeTelegramLink,
} from './channel-link.logic';
import {
  DUPLICATE_ACTIVE_OR_PENDING_MESSAGE,
  DUPLICATE_REJECTED_CODE,
  DUPLICATE_REJECTED_MESSAGE,
  duplicateSearchTerm,
  pickDuplicate,
  type DuplicateMatch,
} from './link-duplicate.logic';
import { isTitleLocked } from './title-lock.logic';
import { shouldHideIllegalSuspicion } from './illegal-content.logic';
import { selectMemberVisibleRows } from '../stats/member-visible.logic';
import { buildMemberRankingCounts } from '../stats/member-page-count.logic';
import { loadMemberPageRows } from '../stats/member-page-rows';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
  usernameFromChannelLink,
} from './telegram-username';
import { ALREADY_REGISTERED_CHANNEL } from './merge-duplicate-channels.logic';
import { ChannelFavorite } from './channel-favorite.entity';
import { ChannelRecommendation } from './channel-recommendation.entity';
import { UsersService } from '../users/users.service';
import { telegramIdKey } from '../common/telegram-id';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { CreateChannelDto, SearchChannelDto } from './dto/channel.dto';
import { AutoExposeService } from '../stats/auto-expose.service';
import { ChannelCollectorService } from '../stats/channel-collector.service';
import { ChannelEvent } from '../stats/channel-event.entity';
import {
  allowAdultInList,
  ADULT_CATEGORY,
  PENDING_CATEGORY,
} from './auto-expose.logic';
import { expandSearchKeywords } from './search-synonyms';
import { kstDayStart, kstRollingStart } from '../admin/admin-dashboard.logic';
import {
  clampAdminPage,
  clampAdminPageSize,
  matchesMemberPageFilter,
  nullsLastCaseSql,
  paginateItems,
  parseAdminListSort,
  sortAdminListItems,
  type AdminListSort,
  type AdminRegisterSource,
} from '../admin/admin-list.logic';
import { TelegramPreviewService } from './telegram-preview.service';
import {
  isTelegramBotFileUrl,
  stripUnsafeAvatarUrl,
} from './telegram-avatar.logic';

const CHANNEL_UPLOAD_DIR = join(process.cwd(), 'uploads', 'channels');

function envTruthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(
    (value ?? '').trim().toLowerCase(),
  );
}

function envFalsy(value: string | undefined): boolean {
  return ['0', 'false', 'no', 'off'].includes(
    (value ?? '').trim().toLowerCase(),
  );
}

@Injectable()
export class ChannelsService implements OnModuleInit {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelRecommendation)
    private readonly recommendationRepository: Repository<ChannelRecommendation>,
    @InjectRepository(ChannelFavorite)
    private readonly favoriteRepository: Repository<ChannelFavorite>,
    private readonly configService: ConfigService,
    private readonly telegramPreviewService: TelegramPreviewService,
    private readonly usersService: UsersService,
    private readonly telegramAdminNotifyService: TelegramAdminNotifyService,
    @InjectRepository(ChannelEvent)
    private readonly eventRepository: Repository<ChannelEvent>,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.channelRepository.count();
      if (count > 0) return;

      await this.channelRepository.save([
        {
          title: 'Telegram News',
          link: 'https://t.me/telegram',
          category: 'News',
          description: 'Official Telegram news channel.',
          recommendCount: 120,
          status: ChannelStatus.ACTIVE,
          isPromoted: true,
          linkType: LinkType.CHANNEL,
        },
        {
          title: 'Dev Community',
          link: 'https://t.me/durov',
          category: 'Community',
          description: 'Developer community group.',
          recommendCount: 85,
          status: ChannelStatus.ACTIVE,
          isPromoted: false,
          linkType: LinkType.GROUP,
        },
      ]);
    } catch (error) {
      console.error(
        '채널 시드 초기화 실패(서버는 계속 기동):',
        error instanceof Error ? error.message : error,
      );
    }
  }

  async findActiveByUsername(username: string): Promise<Channel | null> {
    const u = username.replace(/^@/, '').trim().toLowerCase();
    if (!u) return null;
    return this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('LOWER(channel.username) = :u', { u })
      .orderBy('channel.created_at', 'ASC')
      .getOne();
  }

  /**
   * 같은 링크가 이미 있는지 찾는 단 하나의 함수. 모든 등록 경로가 이것을 쓴다.
   * - 공개 링크는 username(대소문자 무시), 초대 링크는 해시(대소문자 구분)로 비교
   * - 합쳐진(merged) 행은 비교하지 않고, 여러 행이면 ACTIVE > PENDING > REJECTED 순
   */
  async findDuplicate(
    link: string,
    options?: { excludeId?: string },
  ): Promise<DuplicateMatch<Channel> | null> {
    const term = duplicateSearchTerm(link);
    if (!term) return null;
    // 후보만 좁히고(소문자 부분 일치), 정확한 비교는 pickDuplicate 가 한다
    const rows = await this.channelRepository
      .createQueryBuilder('channel')
      .where('LOWER(channel.link) LIKE :like', { like: `%${term}%` })
      .orWhere('LOWER(channel.username) = :term', { term })
      .getMany();
    return pickDuplicate(rows, link, options?.excludeId);
  }

  /** 승인된(ACTIVE) 같은 링크 행. 없으면 null */
  async findActiveDuplicate(link: string): Promise<Channel | null> {
    const match = await this.findDuplicate(link);
    return match?.kind === 'active' ? match.channel : null;
  }

  /** 회원 제보에서 중복일 때 돌려줄 오류 */
  private memberDuplicateError(match: DuplicateMatch<Channel>): ConflictException {
    return new ConflictException(
      match.kind === 'rejected'
        ? DUPLICATE_REJECTED_MESSAGE
        : DUPLICATE_ACTIVE_OR_PENDING_MESSAGE,
    );
  }

  /**
   * 제보 링크의 채널/그룹 종류를 서버가 판별한다(단건 등록과 같은 미리보기 fetcher).
   * 판별에 실패했을 때만 회원이 고른 값을 쓰고, 그것도 없으면 선택을 요청한다.
   */
  private async resolveSubmitLinkType(
    link: string,
    chosen: LinkType | undefined,
  ): Promise<LinkType> {
    const preview = await this.telegramPreviewService.fetchPreview(link);
    if (preview.kind === 'group') return LinkType.GROUP;
    if (preview.kind === 'channel') return LinkType.CHANNEL;
    if (chosen === LinkType.CHANNEL || chosen === LinkType.GROUP) return chosen;
    throw new BadRequestException({
      statusCode: 400,
      code: 'LINK_TYPE_REQUIRED',
      message:
        '채널인지 그룹인지 자동으로 확인하지 못했습니다. 직접 선택해 주세요.',
    });
  }

  async create(dto: CreateChannelDto, submittedBy: number): Promise<Channel> {
    // 제보 링크는 정규화해서 저장하고, 중복 판단도 같은 링크로 한다
    const link = this.normalizeTelegramLink(dto.link);
    const duplicate = await this.findDuplicate(link);
    if (duplicate) {
      throw this.memberDuplicateError(duplicate);
    }
    const linkType = await this.resolveSubmitLinkType(link, dto.linkType);
    const channel = this.channelRepository.create({
      ...dto,
      link,
      linkType,
      submittedBy,
      status: ChannelStatus.PENDING,
      avatarApproved: false,
      collectTier: 'daily',
      payoutStatus: 'pending',
      payoutSkipReason: null,
      username: usernameFromChannelLink(link),
    });
    const saved = await this.channelRepository.save(channel);
    void this.refreshPreview(saved.id).catch(() => undefined);
    void this.notifyAdminsOfSubmission(saved).catch(() => undefined);
    try {
      const autoExpose = this.moduleRef.get(AutoExposeService, {
        strict: false,
      });
      return await autoExpose.tryPromoteSubmission(saved);
    } catch {
      return saved;
    }
  }

  private async notifyAdminsOfSubmission(channel: Channel): Promise<void> {
    const reporter = await this.usersService.getReporterOrNull(
      channel.submittedBy,
    );
    const reporterLabel = reporter?.username
      ? `@${reporter.username}`
      : reporter?.firstName ||
        (channel.submittedBy != null ? `ID ${channel.submittedBy}` : null);

    await this.telegramAdminNotifyService.notifyNewSubmission({
      title: channel.title,
      link: channel.link,
      linkType: channel.linkType,
      category: channel.category,
      submittedBy: channel.submittedBy ?? 0,
      reporterLabel,
    });
  }

  normalizeTelegramLink(link: string): string {
    return normalizeTelegramLink(link);
  }

  /** 대시보드와 같은 규칙(channel-link.logic)으로 같은 링크를 1개로 합친다 */
  private dedupeByLink(channels: Channel[]): Channel[] {
    return dedupeChannelsByLink(channels);
  }

  async lookupTelegramLink(rawLink: string) {
    if (!rawLink?.trim()) {
      throw new BadRequestException('링크를 입력해 주세요.');
    }

    const link = this.normalizeTelegramLink(rawLink);
    if (!/^https:\/\/t\.me\/.+/i.test(link)) {
      throw new BadRequestException(
        't.me 링크 또는 @username을 입력해 주세요.',
      );
    }

    const preview = await this.telegramPreviewService.fetchPreview(link);
    const match = await this.findDuplicate(link);

    return {
      link,
      title: preview.title ?? '',
      description: preview.description ?? '',
      avatarUrl: stripUnsafeAvatarUrl(preview.avatarUrl),
      memberCount: preview.memberCount,
      linkType: preview.kind,
      alreadyRegistered: Boolean(match),
      existingChannelId: match?.channel.id ?? null,
      existingStatus: match?.channel.status ?? null,
    };
  }

  async createByAdmin(
    data: {
      title: string;
      link: string;
      linkType: LinkType;
      category: string;
      description?: string;
      isPromoted?: boolean;
      /** 검사로 판별한 언어. 있으면 그대로 저장한다 */
      language?: ChannelLanguage | null;
    },
    options?: { skipPublicCollect?: boolean; reactivateRejected?: boolean },
  ): Promise<Channel> {
    const link = this.normalizeTelegramLink(data.link);
    const match = await this.findDuplicate(link);
    if (match && match.kind !== 'rejected') {
      throw new ConflictException(ALREADY_REGISTERED_CHANNEL);
    }
    // 거절된 행만 있으면 새로 만들지 않는다. 어드민이 확인해야 그 행을 다시 활성화한다
    if (match && !options?.reactivateRejected) {
      throw new ConflictException({
        statusCode: 409,
        code: DUPLICATE_REJECTED_CODE,
        message: '이전에 거절된 링크입니다. 그 항목을 다시 활성화할까요?',
        existingChannelId: match.channel.id,
      });
    }

    const description = (data.description?.trim() || data.title.trim()).slice(
      0,
      2000,
    );
    const language =
      data.language === 'ko' ||
      data.language === 'foreign' ||
      data.language === 'unknown'
        ? data.language
        : null;
    let channel: Channel;
    if (match) {
      channel = match.channel;
      channel.title = data.title.trim();
      channel.linkType = data.linkType;
      channel.category = data.category;
      channel.description = description;
      channel.status = ChannelStatus.ACTIVE;
      channel.isVisible = true;
      if (language) channel.language = language;
    } else {
      channel = this.channelRepository.create({
        title: data.title.trim(),
        link,
        linkType: data.linkType,
        category: data.category,
        description,
        status: ChannelStatus.ACTIVE,
        avatarApproved: false,
        submittedBy: null,
        payoutStatus: 'not_eligible',
        payoutSkipReason: null,
        username: usernameFromChannelLink(link),
        collectTier: 'daily',
        ...(language ? { language } : {}),
      });
    }

    let saved = await this.channelRepository.save(channel);

    try {
      saved = await this.importAvatarFromTelegram(saved.id);
    } catch {
      saved = await this.refreshPreview(saved.id);
    }

    if (data.isPromoted) {
      saved = await this.promote(saved.id, { durationDays: 7 });
    }

    if (!options?.skipPublicCollect) {
      saved = await this.collectPublicPageAfterRegister(saved);
    }

    return saved;
  }

  private async collectPublicPageAfterRegister(
    channel: Channel,
  ): Promise<Channel> {
    try {
      const collector = this.moduleRef.get(ChannelCollectorService, {
        strict: false,
      });
      await collector.collectPublicPageNow(channel);
    } catch {
      /* 실패 이유는 collect_error 에 남긴다 */
    }
    return this.findById(channel.id);
  }

  async refreshPreview(id: string) {
    const channel = await this.findById(id);
    const preview = await this.telegramPreviewService.fetchPreview(
      channel.link,
    );
    if (preview.avatarUrl && !isTelegramBotFileUrl(preview.avatarUrl)) {
      channel.avatarUrl = preview.avatarUrl;
    }
    if (
      preview.title &&
      channel.status === ChannelStatus.PENDING &&
      !isTitleLocked(channel)
    )
      channel.title = preview.title;
    if (preview.description && channel.status === ChannelStatus.PENDING)
      channel.description = preview.description;
    if (preview.memberCount != null && preview.memberCount > 0) {
      channel.memberCount = preview.memberCount;
    }
    this.applyUsernameFromLink(channel);
    return this.channelRepository.save(channel);
  }

  private applyUsernameFromLink(channel: Channel): void {
    channel.username = usernameFromChannelLink(channel.link);
  }

  async getPreview(id: string) {
    const channel = await this.refreshPreview(id);
    const preview = await this.telegramPreviewService.fetchPreview(
      channel.link,
    );
    return {
      id: channel.id,
      title: preview.title ?? channel.title,
      description: preview.description ?? channel.description,
      avatarUrl: stripUnsafeAvatarUrl(channel.avatarUrl ?? preview.avatarUrl),
      memberCount:
        preview.memberCount != null
          ? String(preview.memberCount)
          : null,
      link: channel.link,
      avatarApproved: channel.avatarApproved,
    };
  }

  async importAvatarFromTelegram(id: string) {
    const channel = await this.findById(id);
    const preview = await this.telegramPreviewService.fetchPreview(
      channel.link,
    );

    if (!preview.avatarUrl || isTelegramBotFileUrl(preview.avatarUrl)) {
      throw new BadRequestException(
        '텔레그램에서 아이콘을 가져오지 못했습니다. 공개 @username 링크인지 확인해 주세요.',
      );
    }

    if (/telegram\.org\/img\/t_logo/i.test(preview.avatarUrl)) {
      throw new BadRequestException(
        '유효한 채널 아이콘이 아닙니다. @username 공개 링크인지 확인해 주세요.',
      );
    }

    channel.avatarUrl = !this.shouldMirrorLocally()
      ? this.buildAvatarProxyUrl(channel.link)
      : await this.mirrorAvatarImage(preview.avatarUrl);
    channel.avatarApproved = true;
    return this.channelRepository.save(channel);
  }

  private async mirrorAvatarImage(sourceUrl: string): Promise<string> {
    if (sourceUrl.startsWith('/api/media/telegram-avatar')) return sourceUrl;

    if (sourceUrl.startsWith('/api/uploads/')) {
      if (this.localUploadExists(sourceUrl)) return sourceUrl;
      // 파일이 없으면 호출측에서 링크로 다시 받도록 stale 처리
      return sourceUrl;
    }

    // Render 등 ephemeral 디스크에서는 로컬 저장 대신 프록시 URL/원본 CDN 사용
    if (!this.shouldMirrorLocally()) {
      return sourceUrl;
    }

    if (!existsSync(CHANNEL_UPLOAD_DIR)) {
      mkdirSync(CHANNEL_UPLOAD_DIR, { recursive: true });
    }

    const res = await fetch(sourceUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new BadRequestException('아이콘 이미지 다운로드에 실패했습니다.');
    }

    const contentType = res.headers.get('content-type') ?? 'image/jpeg';
    const ext =
      this.extFromContentType(contentType) ??
      (extname(new URL(sourceUrl).pathname) || '.jpg');
    const filename = `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`;
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(join(CHANNEL_UPLOAD_DIR, filename), buffer);
    return `/api/uploads/channels/${filename}`;
  }

  /** Render Free 디스크는 재배포 시 사라지므로 기본은 로컬 미러 비활성 */
  shouldMirrorLocally(): boolean {
    const override = this.configService.get<string>('AVATAR_MIRROR_LOCAL');
    if (envTruthy(override)) return true;
    if (envFalsy(override)) return false;
    if (envTruthy(process.env.RENDER)) return false;
    return true;
  }

  buildAvatarProxyUrl(link: string): string {
    const normalized = this.normalizeTelegramLink(link);
    return `/api/media/telegram-avatar?link=${encodeURIComponent(normalized)}`;
  }

  private localUploadExists(avatarUrl: string): boolean {
    if (!avatarUrl.startsWith('/api/uploads/')) return false;
    const relative = avatarUrl.replace(/^\/api\/uploads\//, '');
    return existsSync(join(process.cwd(), 'uploads', relative));
  }

  private extFromContentType(contentType: string): string | null {
    if (contentType.includes('png')) return '.png';
    if (contentType.includes('webp')) return '.webp';
    if (contentType.includes('gif')) return '.gif';
    if (contentType.includes('svg')) return '.svg';
    if (contentType.includes('jpeg') || contentType.includes('jpg'))
      return '.jpg';
    return null;
  }

  async search(dto: SearchChannelDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere(
        `(channel.collect_status = 'invite_only' OR (channel.first_observed_at IS NOT NULL AND (channel.collect_status IS NULL OR channel.collect_status NOT IN (:...hiddenCollect))))`,
        { hiddenCollect: Array.from(HIDDEN_COLLECT_STATUSES) },
      );

    qb.andWhere('channel.is_visible = :visible', { visible: true });
    qb.andWhere('channel.category <> :pending', { pending: PENDING_CATEGORY });
    if (dto.category)
      qb.andWhere('channel.category = :category', { category: dto.category });
    if (!dto.category || dto.category !== ADULT_CATEGORY) {
      qb.andWhere('channel.category <> :adult', { adult: ADULT_CATEGORY });
    }

    if (dto.type)
      qb.andWhere('channel.link_type = :linkType', { linkType: dto.type });

    if (dto.q?.trim()) {
      const keywords = expandSearchKeywords(dto.q);
      qb.andWhere(
        new Brackets((outer) => {
          keywords.forEach((term, index) => {
            const param = `keyword${index}`;
            const pattern = `%${term}%`;
            const clause = new Brackets((sub) => {
              sub
                .where(`LOWER(channel.title) LIKE :${param}`, {
                  [param]: pattern,
                })
                .orWhere(`LOWER(channel.description) LIKE :${param}`, {
                  [param]: pattern,
                })
                .orWhere(`LOWER(channel.category) LIKE :${param}`, {
                  [param]: pattern,
                })
                .orWhere(`LOWER(channel.link) LIKE :${param}`, {
                  [param]: pattern,
                });
            });
            if (index === 0) outer.where(clause);
            else outer.orWhere(clause);
          });
        }),
      );
    }

    const [allItems] = await qb.getManyAndCount();
    const now = new Date();
    // 회원 노출 규칙은 한 곳(describeMemberPageVisibility)만 쓰고, 같은 링크는 가장 좋은 행 1개
    const deduped = selectMemberVisibleRows(allItems, dto.category);
    const activeItems = deduped
      .map((item) => ({
        ...item,
        isPromoted:
          item.isPromoted && (!item.promotedUntil || item.promotedUntil > now),
        verifiedOwnerTelegramId: null,
      }))
      .sort((a, b) => {
        if (a.isPromoted !== b.isPromoted) return a.isPromoted ? -1 : 1;
        if (b.recommendCount !== a.recommendCount)
          return b.recommendCount - a.recommendCount;
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      })
      .slice(skip, skip + limit);

    return {
      items: activeItems,
      total: deduped.length,
      page,
      limit,
      totalPages: Math.ceil(deduped.length / limit),
    };
  }

  async findActivePromoted(limit = 50): Promise<Channel[]> {
    const now = new Date();
    const channels = await this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('channel.is_promoted = :promoted', { promoted: true })
      .andWhere('channel.is_visible = :visible', { visible: true })
      .andWhere('channel.category <> :adult', { adult: ADULT_CATEGORY })
      .andWhere(
        '(channel.promoted_until IS NULL OR channel.promoted_until > :now)',
        { now },
      )
      .orderBy('channel.promotion_sort_order', 'ASC')
      .addOrderBy('channel.promoted_until', 'ASC')
      .addOrderBy('channel.recommend_count', 'DESC')
      .limit(limit)
      .getMany();

    // 회원 목록은 텔레그램 미리보기를 동기 호출하지 않음 (느림). 필요 시 프록시 URL만 붙인다.
    return this.dedupeByLink(channels)
      .filter((channel) => !shouldHideIllegalSuspicion(channel))
      .map((channel) =>
        this.withListAvatar(this.hideOwnerTelegramId(channel)),
      );
  }

  private needsAvatarRefresh(channel: Channel): boolean {
    return this.isStaleAvatarUrl(channel.avatarUrl);
  }

  /** 공개 목록에 운영자 텔레그램 ID를 넣지 않습니다. */
  private hideOwnerTelegramId(channel: Channel): Channel {
    channel.verifiedOwnerTelegramId = null;
    return channel;
  }

  /** 목록 API용: 네트워크 없이 표시 가능한 avatarUrl로 보정 */
  private withListAvatar(channel: Channel): Channel {
    if (!this.needsAvatarRefresh(channel)) return channel;
    channel.avatarUrl = this.buildAvatarProxyUrl(channel.link);
    if (!channel.avatarApproved) channel.avatarApproved = true;
    return channel;
  }

  getListAvatarUrl(channel: Channel): string | null {
    return this.resolveListAvatarUrl(channel);
  }

  private resolveListAvatarUrl(channel: Channel): string | null {
    if (!channel.avatarApproved) return null;
    if (channel.avatarUrl && !this.isStaleAvatarUrl(channel.avatarUrl)) {
      return channel.avatarUrl;
    }
    return this.buildAvatarProxyUrl(channel.link);
  }

  isStaleAvatarUrl(avatarUrl: string | null | undefined): boolean {
    if (!avatarUrl) return true;
    if (avatarUrl.startsWith('/api/media/telegram-avatar')) return false;
    if (avatarUrl.startsWith('/api/uploads/')) {
      // 파일이 없거나 ephemeral 환경이면 다시 받아야 함
      return !this.localUploadExists(avatarUrl);
    }
    if (avatarUrl.includes('telesco.pe')) return true;
    if (/telegram\.org\/img\/t_logo/i.test(avatarUrl)) return true;
    if (isTelegramBotFileUrl(avatarUrl)) return true;
    return false;
  }

  async mirrorAvatarForLink(link: string): Promise<string | null> {
    try {
      // ephemeral 환경: 미리 다운로드하지 않고 프록시 URL만 저장 (목록 조회가 느려지지 않게)
      if (!this.shouldMirrorLocally()) {
        return this.buildAvatarProxyUrl(link);
      }

      const preview = await this.telegramPreviewService.fetchPreview(link);
      if (
        !preview.avatarUrl ||
        isTelegramBotFileUrl(preview.avatarUrl) ||
        /telegram\.org\/img\/t_logo/i.test(preview.avatarUrl)
      ) {
        return null;
      }
      return await this.mirrorAvatarImage(preview.avatarUrl);
    } catch {
      return null;
    }
  }

  private async ensureMirroredAvatar(channel: Channel): Promise<Channel> {
    if (!this.needsAvatarRefresh(channel)) {
      return channel;
    }

    try {
      // Render 등 ephemeral: 미리보기 스크랩 없이 프록시 URL만 저장 (목록이 안 느려지게)
      if (!this.shouldMirrorLocally()) {
        channel.avatarUrl = this.buildAvatarProxyUrl(channel.link);
        channel.avatarApproved = true;
        return this.channelRepository.save(channel);
      }

      const preview = await this.telegramPreviewService.fetchPreview(
        channel.link,
      );
      if (
        !preview.avatarUrl ||
        isTelegramBotFileUrl(preview.avatarUrl) ||
        /telegram\.org\/img\/t_logo/i.test(preview.avatarUrl)
      ) {
        return channel;
      }
      channel.avatarUrl = await this.mirrorAvatarImage(preview.avatarUrl);
      channel.avatarApproved = true;
      return this.channelRepository.save(channel);
    } catch {
      return channel;
    }
  }

  async findById(id: string): Promise<Channel> {
    const channel = await this.channelRepository.findOne({ where: { id } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async getRecommendedChannelIds(userId: number): Promise<string[]> {
    const rows = await this.recommendationRepository.find({
      where: { userId },
    });
    return rows.map((r) => r.channelId);
  }

  async getFavoriteChannelIds(userId: number): Promise<string[]> {
    const rows = await this.favoriteRepository.find({ where: { userId } });
    return rows.map((r) => r.channelId);
  }

  async findFavorites(userId: number, category?: string): Promise<Channel[]> {
    const rows = await this.favoriteRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.channelId);
    const qb = this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.id IN (:...ids)', { ids })
      .andWhere('channel.status = :status', { status: ChannelStatus.ACTIVE });

    if (category?.trim()) {
      qb.andWhere('channel.category = :category', {
        category: category.trim(),
      });
    }

    const channels = await qb.getMany();
    const byId = new Map(channels.map((c) => [c.id, c]));
    return ids
      .map((id) => byId.get(id))
      .filter((c): c is Channel => Boolean(c))
      .map((channel) => this.hideOwnerTelegramId(channel));
  }

  async addFavorite(channelId: string, userId: number): Promise<{ ok: true }> {
    await this.findById(channelId);
    const existing = await this.favoriteRepository.findOne({
      where: { userId, channelId },
    });
    if (!existing) {
      await this.favoriteRepository.save({ userId, channelId });
    }
    return { ok: true };
  }

  async removeFavorite(
    channelId: string,
    userId: number,
  ): Promise<{ ok: true }> {
    await this.favoriteRepository.delete({ userId, channelId });
    return { ok: true };
  }

  async findBySubmitter(userId: number | string): Promise<Channel[]> {
    const key = telegramIdKey(userId);
    if (!key) return [];
    return this.channelRepository
      .createQueryBuilder('channel')
      .where('CAST(channel.submitted_by AS TEXT) = :id', { id: key })
      .orderBy('channel.created_at', 'DESC')
      .getMany();
  }

  /** Fetch current TON (Gram) USD price. Returns null when unavailable. */
  async fetchTonUsdRate(): Promise<number | null> {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd',
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) return null;
      const data = (await response.json()) as {
        'the-open-network'?: { usd?: number };
      };
      const rate = data['the-open-network']?.usd;
      if (!rate || !Number.isFinite(rate) || rate <= 0) return null;
      return rate;
    } catch {
      return null;
    }
  }

  async recordReporterReward(
    id: string,
    input: { amountTon: number; wallet?: string | null },
  ): Promise<Channel> {
    const amountTon = Number(input.amountTon);
    if (!Number.isFinite(amountTon) || amountTon <= 0) {
      throw new BadRequestException('Reward amount must be greater than 0');
    }

    const channel = await this.findById(id);
    const rate = await this.fetchTonUsdRate();
    const amountUsd =
      rate != null ? Math.round(amountTon * rate * 100) / 100 : null;

    channel.rewardTonAmount = amountTon;
    channel.rewardUsdAmount = amountUsd;
    channel.rewardTonUsdRate = rate;
    channel.rewardPaidAt = new Date();
    channel.rewardWallet = input.wallet?.trim() || channel.rewardWallet || null;
    return this.channelRepository.save(channel);
  }

  async incrementRecommend(id: string, userId: number): Promise<Channel> {
    const channel = await this.findById(id);
    const existing = await this.recommendationRepository.findOne({
      where: { userId, channelId: id },
    });
    if (existing) throw new ConflictException('Already recommended');
    await this.recommendationRepository.save({ userId, channelId: id });
    channel.recommendCount += 1;
    return this.channelRepository.save(channel);
  }

  async findPending(): Promise<Channel[]> {
    return this.channelRepository.find({
      where: { status: ChannelStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  }

  async approve(id: string, isPromoted = false): Promise<Channel> {
    let channel = await this.findById(id);
    // 같은 링크로 이미 승인된 다른 행이 있으면 두 번째 ACTIVE 를 만들지 않는다
    const other = await this.findDuplicate(channel.link, { excludeId: id });
    if (other?.kind === 'active') {
      throw new ConflictException(ALREADY_REGISTERED_CHANNEL);
    }
    if (!channel.avatarUrl) channel = await this.refreshPreview(id);
    channel.status = ChannelStatus.ACTIVE;
    channel.avatarApproved = Boolean(channel.avatarUrl);
    if (isPromoted) channel.isPromoted = true;
    this.applyUsernameFromLink(channel);
    channel.collectTier = 'daily';
    const saved = await this.channelRepository.save(channel);
    return this.collectPublicPageAfterRegister(saved);
  }

  async reject(id: string): Promise<Channel> {
    const channel = await this.findById(id);
    channel.status = ChannelStatus.REJECTED;
    return this.channelRepository.save(channel);
  }

  async rejectInvalidSelected(ids: string[]): Promise<{ rejected: number }> {
    if (ids.length === 0) return { rejected: 0 };
    const channels = await this.channelRepository.find({
      where: { id: In(ids) },
    });
    let rejected = 0;
    for (const channel of channels) {
      if (channel.collectStatus !== 'invalid') continue;
      channel.status = ChannelStatus.REJECTED;
      await this.channelRepository.save(channel);
      rejected += 1;
    }
    return { rejected };
  }

  async promote(
    id: string,
    options: {
      durationDays?: number;
      promotedUntil?: Date;
      clientTelegramId?: number;
      clientName?: string;
      tonAmount?: number;
    } = {},
  ): Promise<Channel> {
    const channel = await this.findById(id);
    let promotedUntil: Date;

    if (options.promotedUntil) {
      promotedUntil = options.promotedUntil;
    } else {
      promotedUntil = new Date();
      promotedUntil.setDate(
        promotedUntil.getDate() + (options.durationDays ?? 7),
      );
    }

    const wasPromoted = channel.isPromoted;
    channel.isPromoted = true;
    channel.promotedUntil = promotedUntil;
    if (!wasPromoted) {
      channel.promotionSortOrder = await this.getNextPromotionSortOrder();
    }
    if (options.clientTelegramId != null) {
      channel.promotionClientTelegramId = options.clientTelegramId;
    }
    if (options.clientName != null) {
      channel.promotionClientName = options.clientName;
    }
    if (options.tonAmount != null) {
      channel.promotionTonAmount = options.tonAmount;
    }
    return this.channelRepository.save(channel);
  }

  private async getNextPromotionSortOrder(): Promise<number> {
    const row = await this.channelRepository
      .createQueryBuilder('channel')
      .select('MAX(channel.promotion_sort_order)', 'max')
      .where('channel.is_promoted = :promoted', { promoted: true })
      .getRawOne<{ max: string | null }>();
    return (Number(row?.max) || 0) + 1;
  }

  async updatePromotionOrder(ids: string[]): Promise<void> {
    await Promise.all(
      ids.map((id, index) =>
        this.channelRepository.update(
          { id },
          { promotionSortOrder: index + 1 },
        ),
      ),
    );
  }

  async getSubmissionCountsByUser(): Promise<Record<number, number>> {
    const rows = await this.channelRepository
      .createQueryBuilder('channel')
      .select('channel.submitted_by', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('channel.submitted_by IS NOT NULL')
      .groupBy('channel.submitted_by')
      .getRawMany<{ userId: number; count: string }>();
    const result: Record<number, number> = {};
    for (const row of rows) result[Number(row.userId)] = Number(row.count);
    return result;
  }

  /** 회원 삭제 시 제보 채널의 제출자만 해제 (채널은 유지) */
  async clearSubmitter(telegramId: number): Promise<number> {
    const result = await this.channelRepository.update(
      { submittedBy: telegramId },
      { submittedBy: null },
    );
    return result.affected ?? 0;
  }

  async findAllAdmin(filters: {
    status?: ChannelStatus;
    q?: string;
    category?: string;
    linkType?: LinkType;
    collectStatus?: string;
    visibility?: 'visible' | 'hidden';
    autoRegistered?: boolean;
    recentAutoDays?: number;
    language?: string;
    source?: AdminRegisterSource;
    memberPage?: 'yes' | 'no' | '';
    hideReason?: string;
    createdFrom?: 'today' | '7d';
    sort?: AdminListSort | string;
    page?: number;
    pageSize?: number;
    promoted?: boolean;
  }) {
    const page = clampAdminPage(filters.page);
    const pageSize = clampAdminPageSize(filters.pageSize);
    const sort = parseAdminListSort(
      filters.sort || (filters.promoted ? 'promo_order' : undefined),
    );
    const needsMemory =
      Boolean(filters.memberPage) || Boolean(filters.hideReason);

    if (needsMemory) {
      let matched = await this.buildAdminListQuery(filters).getMany();
      matched = matched.filter((channel) =>
        matchesMemberPageFilter(channel, {
          memberPage: filters.memberPage,
          hideReason: filters.hideReason,
        }),
      );
      matched = sortAdminListItems(matched, sort);
      const categoryCounts: Record<string, number> = { '': matched.length };
      for (const item of matched) {
        categoryCounts[item.category] =
          (categoryCounts[item.category] ?? 0) + 1;
      }
      const paged = paginateItems(matched, page, pageSize);
      const items = paged.items.map((item) => this.sanitizeChannelForResponse(item));
      return {
        items,
        total: paged.total,
        page: paged.page,
        pageSize: paged.pageSize,
        categoryCounts,
      };
    }

    const total = await this.buildAdminListQuery(filters).getCount();
    const catRows = await this.buildAdminListQuery(filters)
      .select('channel.category', 'category')
      .addSelect('COUNT(*)', 'cnt')
      .groupBy('channel.category')
      .getRawMany<{ category: string; cnt: string }>();
    const categoryCounts: Record<string, number> = { '': total };
    for (const row of catRows) {
      categoryCounts[row.category] = Number(row.cnt);
    }
    const listQb = this.buildAdminListQuery(filters);
    this.applyAdminListSort(listQb, sort);
    const pageRows = await listQb
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getMany();
    const items = pageRows.map((item) => this.sanitizeChannelForResponse(item));
    return { items, total, page, pageSize, categoryCounts };
  }

  private buildAdminListQuery(filters: {
    status?: ChannelStatus;
    q?: string;
    category?: string;
    linkType?: LinkType;
    collectStatus?: string;
    visibility?: 'visible' | 'hidden';
    autoRegistered?: boolean;
    recentAutoDays?: number;
    language?: string;
    source?: AdminRegisterSource;
    createdFrom?: 'today' | '7d';
    promoted?: boolean;
  }) {
    const qb = this.channelRepository.createQueryBuilder('channel');
    if (filters.status)
      qb.andWhere('channel.status = :status', { status: filters.status });
    if (filters.category)
      qb.andWhere('channel.category = :category', {
        category: filters.category,
      });
    if (filters.visibility === 'visible') {
      qb.andWhere('channel.is_visible = :visOn', { visOn: true });
    } else if (filters.visibility === 'hidden') {
      qb.andWhere('channel.is_visible = :visOff', { visOff: false });
    }
    if (filters.autoRegistered) {
      qb.andWhere('channel.auto_registered = :autoReg', { autoReg: true });
      const days = filters.recentAutoDays ?? 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      qb.andWhere('channel.created_at >= :since', { since });
    }
    if (filters.source === 'auto') {
      qb.andWhere('channel.auto_registered = :srcAuto', { srcAuto: true });
    } else if (filters.source === 'admin') {
      qb.andWhere('channel.auto_registered = :srcAdmin', { srcAdmin: false });
      qb.andWhere('channel.submitted_by IS NULL');
    } else if (filters.source === 'report') {
      qb.andWhere('channel.submitted_by IS NOT NULL');
    }
    if (filters.language)
      qb.andWhere('channel.language = :language', {
        language: filters.language,
      });
    if (filters.linkType)
      qb.andWhere('channel.link_type = :linkType', {
        linkType: filters.linkType,
      });
    if (filters.createdFrom === 'today') {
      qb.andWhere('channel.created_at >= :createdSince', {
        createdSince: kstDayStart(),
      });
    } else if (filters.createdFrom === '7d') {
      qb.andWhere('channel.created_at >= :createdSince', {
        createdSince: kstRollingStart(7),
      });
    }
    if (filters.collectStatus === 'failed') {
      qb.andWhere('channel.collect_status IN (:...collectFail)', {
        collectFail: [
          'failed',
          'private',
          'invalid',
          'gone',
          'invite_only',
          'invite_expired',
        ],
      });
    } else if (filters.collectStatus === 'none') {
      qb.andWhere('channel.collect_status IS NULL');
    } else if (filters.collectStatus) {
      qb.andWhere('channel.collect_status = :collectExact', {
        collectExact: filters.collectStatus,
      });
    }
    if (filters.promoted) {
      qb.andWhere('channel.is_promoted = :promotedOn', { promotedOn: true });
    }
    if (filters.q?.trim()) {
      const keyword = `%${filters.q.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(channel.title) LIKE :keyword OR LOWER(channel.link) LIKE :keyword OR LOWER(channel.category) LIKE :keyword OR LOWER(channel.username) LIKE :keyword)',
        { keyword },
      );
    }
    return qb;
  }

  private applyAdminListSort(
    qb: ReturnType<ChannelsService['buildAdminListQuery']>,
    sort: AdminListSort,
  ) {
    if (sort === 'members_desc') {
      qb.orderBy(
        nullsLastCaseSql('channel', 'member_count'),
        'ASC',
      )
        .addOrderBy('channel.memberCount', 'DESC')
        .addOrderBy('channel.createdAt', 'DESC');
      return;
    }
    if (sort === 'collected_desc') {
      qb.orderBy(
        nullsLastCaseSql('channel', 'last_collected_at'),
        'ASC',
      )
        .addOrderBy('channel.lastCollectedAt', 'DESC')
        .addOrderBy('channel.createdAt', 'DESC');
      return;
    }
    if (sort === 'title_asc') {
      qb.orderBy('channel.title', 'ASC');
      return;
    }
    if (sort === 'promo_order') {
      qb.orderBy('channel.promotionSortOrder', 'ASC').addOrderBy(
        'channel.promotedUntil',
        'ASC',
      );
      return;
    }
    qb.orderBy('channel.createdAt', 'DESC');
  }

  async findPromotionsAdmin(filters: { q?: string }) {
    const qb = this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.is_promoted = :promoted', { promoted: true });

    if (filters.q?.trim()) {
      const keyword = `%${filters.q.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(channel.title) LIKE :keyword OR LOWER(channel.link) LIKE :keyword OR LOWER(channel.category) LIKE :keyword)',
        { keyword },
      );
    }

    qb.orderBy('channel.promotion_sort_order', 'ASC').addOrderBy(
      'channel.promoted_until',
      'ASC',
    );
    const items = await qb.getMany();
    return items.map((item) => this.sanitizeChannelForResponse(item));
  }

  private sanitizeChannelForResponse(channel: Channel): Channel {
    channel.avatarUrl = stripUnsafeAvatarUrl(channel.avatarUrl);
    return channel;
  }

  async updateAdmin(
    id: string,
    data: Partial<
      Pick<
        Channel,
        | 'title'
        | 'titleLocked'
        | 'category'
        | 'status'
        | 'isPromoted'
        | 'linkType'
        | 'promotedUntil'
        | 'promotionClientTelegramId'
        | 'promotionClientName'
        | 'promotionTonAmount'
        | 'avatarUrl'
        | 'avatarApproved'
        | 'language'
        | 'languageLocked'
        | 'link'
        | 'isVisible'
        | 'categoryLocked'
        | 'illegalCleared'
      >
    >,
    actorTelegramId?: number,
  ) {
    const channel = await this.findById(id);
    if (data.link !== undefined) {
      const normalized = this.normalizeTelegramLink(data.link);
      if (!normalized) {
        throw new BadRequestException('링크가 필요합니다.');
      }
      const other = await this.findDuplicate(normalized, { excludeId: id });
      if (other) {
        throw new ConflictException('이미 등록된 채널/그룹 링크입니다.');
      }
      channel.link = normalized;
      this.applyUsernameFromLink(channel);
      channel.collectStatus = isInviteOnlyLink(normalized)
        ? 'invite_only'
        : null;
      channel.collectError = null;
      channel.collectFailCount = 0;
    }
    if (data.title !== undefined) {
      // 어드민이 제목을 바꾸면 수집이 덮어쓰지 못하게 자동으로 고정한다
      if (data.title !== channel.title) channel.titleLocked = true;
      channel.title = data.title;
    }
    // 명시한 고정 값이 자동 고정보다 우선한다(풀면 다음 수집부터 텔레그램 제목)
    if (data.titleLocked !== undefined) channel.titleLocked = data.titleLocked;
    if (data.category !== undefined) {
      channel.category = data.category;
      channel.categoryLocked = true;
    }
    if (data.categoryLocked !== undefined) {
      channel.categoryLocked = data.categoryLocked;
    }
    if (data.illegalCleared !== undefined) {
      channel.illegalCleared = data.illegalCleared;
      channel.illegalClearedAt = data.illegalCleared ? new Date() : null;
    }
    if (data.isVisible !== undefined && data.isVisible !== channel.isVisible) {
      await this.recordVisibilityChange(
        channel.id,
        channel.isVisible,
        data.isVisible,
        actorTelegramId,
      );
      channel.isVisible = data.isVisible;
    }
    if (data.linkType !== undefined) channel.linkType = data.linkType;
    if (data.status !== undefined) {
      // 편집으로 ACTIVE 로 바꿀 때도 같은 링크의 다른 ACTIVE 행이 있으면 막는다
      if (
        data.status === ChannelStatus.ACTIVE &&
        channel.status !== ChannelStatus.ACTIVE
      ) {
        const other = await this.findDuplicate(channel.link, { excludeId: id });
        if (other?.kind === 'active') {
          throw new ConflictException(ALREADY_REGISTERED_CHANNEL);
        }
      }
      channel.status = data.status;
    }
    if (data.promotionClientTelegramId !== undefined)
      channel.promotionClientTelegramId = data.promotionClientTelegramId;
    if (data.promotionClientName !== undefined)
      channel.promotionClientName = data.promotionClientName;
    if (data.promotionTonAmount !== undefined)
      channel.promotionTonAmount = data.promotionTonAmount;
    if (data.isPromoted !== undefined) {
      channel.isPromoted = data.isPromoted;
      if (!data.isPromoted) channel.promotedUntil = null;
    }
    if (data.promotedUntil !== undefined) {
      channel.promotedUntil = data.promotedUntil;
      channel.isPromoted = Boolean(data.promotedUntil);
    }
    if (data.avatarUrl !== undefined) {
      channel.avatarUrl = data.avatarUrl;
      if (data.avatarApproved === undefined) {
        channel.avatarApproved = Boolean(data.avatarUrl);
      }
    }
    if (data.avatarApproved !== undefined)
      channel.avatarApproved = data.avatarApproved;
    if (data.language !== undefined) {
      channel.language = data.language;
      channel.languageLocked = true;
    }
    if (data.languageLocked !== undefined) {
      channel.languageLocked = data.languageLocked;
    }
    if (data.status === ChannelStatus.ACTIVE && channel.avatarUrl)
      channel.avatarApproved = true;
    this.applyUsernameFromLink(channel);
    return this.channelRepository.save(channel);
  }

  async setVisibilityMany(
    ids: string[],
    isVisible: boolean,
    actorTelegramId?: number,
  ) {
    const unique = [...new Set(ids)];
    let updated = 0;
    for (const id of unique) {
      const channel = await this.channelRepository.findOneBy({ id });
      if (!channel) continue;
      if (channel.isVisible === isVisible) continue;
      await this.recordVisibilityChange(
        channel.id,
        channel.isVisible,
        isVisible,
        actorTelegramId,
      );
      channel.isVisible = isVisible;
      await this.channelRepository.save(channel);
      updated += 1;
    }
    return { ok: true, updated };
  }

  async setCategoryMany(
    ids: string[],
    category: string,
  ): Promise<{ ok: true; updated: number }> {
    const unique = [...new Set(ids)];
    let updated = 0;
    for (const id of unique) {
      const channel = await this.channelRepository.findOneBy({ id });
      if (!channel) continue;
      channel.category = category;
      channel.categoryLocked = true;
      await this.channelRepository.save(channel);
      updated += 1;
    }
    return { ok: true, updated };
  }

  private async recordVisibilityChange(
    channelId: string,
    before: boolean,
    after: boolean,
    actorTelegramId?: number,
  ) {
    const actor =
      actorTelegramId != null ? `:${String(actorTelegramId)}` : '';
    await this.eventRepository.save({
      channelId,
      type: 'visibility_changed',
      before: before ? 'true' : 'false',
      after: `${after ? 'true' : 'false'}${actor}`,
      occurredAt: new Date(),
    });
  }

  async getRanking(category?: string, limit = 50) {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);

    const qb = this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE });

    if (category && category !== 'all') {
      qb.andWhere('channel.category = :category', { category });
    }

    const items = this.dedupeByLink(await qb.getMany())
      .filter(isPublicCollectable)
      .filter(isVisibleOnPublicLists)
      .filter((c) => !shouldHideIllegalSuspicion(c))
      .filter((c) => allowAdultInList(c.category, category));
    items.sort((a, b) => {
      const memberA = a.memberCount ?? 0;
      const memberB = b.memberCount ?? 0;
      if (memberB !== memberA) return memberB - memberA;
      return b.recommendCount - a.recommendCount;
    });

    const slice = items.slice(0, normalizedLimit);

    return slice.map((channel) => ({
      id: channel.id,
      title: channel.title,
      username: this.extractUsername(channel.link),
      link: channel.link,
      avatarUrl: this.resolveListAvatarUrl(channel),
      participantsCount: channel.memberCount ?? 0,
      recommendCount: channel.recommendCount,
      category: channel.category,
      linkType: channel.linkType,
    }));
  }

  async getRankingCounts(): Promise<Record<string, number>> {
    // 집계에 필요한 컬럼만 읽고, 노출 판정은 어드민 대시보드와 같은 함수로 한다
    const rows = await loadMemberPageRows(this.channelRepository, {
      onlyActive: true,
    });
    return buildMemberRankingCounts(rows);
  }

  private extractUsername(link: string): string | null {
    const match = link.match(/t\.me\/(@?[a-zA-Z0-9_]{4,})/i);
    if (!match) return null;
    const name = match[1];
    if (name.startsWith('+')) return null;
    return name.startsWith('@') ? name : `@${name}`;
  }

  async remove(id: string) {
    const channel = await this.findById(id);
    await this.channelRepository.remove(channel);
    return { ok: true };
  }
}
