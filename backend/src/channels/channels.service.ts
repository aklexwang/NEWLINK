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
import { isVisibleOnPublicLists } from './channel-language.logic';
import {
  extractTelegramUsernameFromLink,
  isInviteOnlyLink,
} from './telegram-username';
import { ALREADY_REGISTERED_CHANNEL } from './merge-duplicate-channels.logic';
import { ChannelFavorite } from './channel-favorite.entity';
import { ChannelRecommendation } from './channel-recommendation.entity';
import { UsersService } from '../users/users.service';
import { TelegramAdminNotifyService } from '../common/telegram-admin-notify.service';
import { CreateChannelDto, SearchChannelDto } from './dto/channel.dto';
import { AutoExposeService } from '../stats/auto-expose.service';
import { ChannelEvent } from '../stats/channel-event.entity';
import {
  allowAdultInList,
  ADULT_CATEGORY,
  PENDING_CATEGORY,
} from './auto-expose.logic';
import { expandSearchKeywords } from './search-synonyms';
import { TelegramPreviewService } from './telegram-preview.service';

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

  async findActiveDuplicate(link: string): Promise<Channel | null> {
    const normalized = this.normalizeTelegramLink(link);
    const username = extractTelegramUsernameFromLink(normalized);
    if (username) {
      const byUser = await this.findActiveByUsername(username);
      if (byUser) return byUser;
    }
    const byLink = await this.findByLink(normalized);
    if (byLink?.status === ChannelStatus.ACTIVE) return byLink;
    return null;
  }

  async create(dto: CreateChannelDto, submittedBy: number): Promise<Channel> {
    const duplicate = await this.findActiveDuplicate(dto.link);
    if (duplicate) {
      throw new ConflictException(ALREADY_REGISTERED_CHANNEL);
    }
    const channel = this.channelRepository.create({
      ...dto,
      submittedBy,
      status: ChannelStatus.PENDING,
      avatarApproved: false,
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
    const trimmed = link.trim();
    if (trimmed.startsWith('http')) return trimmed.replace(/\/$/, '');
    if (trimmed.startsWith('t.me/'))
      return `https://${trimmed.replace(/\/$/, '')}`;
    if (trimmed.startsWith('@')) return `https://t.me/${trimmed.slice(1)}`;
    if (trimmed.startsWith('+')) return `https://t.me/${trimmed}`;
    return `https://t.me/${trimmed}`;
  }

  private linkKey(link: string): string {
    return this.normalizeTelegramLink(link).toLowerCase();
  }

  private shouldReplaceDuplicate(
    existing: Channel,
    candidate: Channel,
  ): boolean {
    if (candidate.isPromoted !== existing.isPromoted)
      return candidate.isPromoted;
    if (candidate.recommendCount !== existing.recommendCount) {
      return candidate.recommendCount > existing.recommendCount;
    }
    if ((candidate.memberCount ?? 0) !== (existing.memberCount ?? 0)) {
      return (candidate.memberCount ?? 0) > (existing.memberCount ?? 0);
    }
    if (candidate.avatarApproved !== existing.avatarApproved)
      return candidate.avatarApproved;
    return (
      new Date(candidate.updatedAt).getTime() >
      new Date(existing.updatedAt).getTime()
    );
  }

  private dedupeByLink(channels: Channel[]): Channel[] {
    const byLink = new Map<string, Channel>();
    for (const channel of channels) {
      const key = this.linkKey(channel.link);
      const existing = byLink.get(key);
      if (!existing || this.shouldReplaceDuplicate(existing, channel)) {
        byLink.set(key, channel);
      }
    }
    return [...byLink.values()];
  }

  async findByLink(link: string): Promise<Channel | null> {
    const normalized = this.normalizeTelegramLink(link);
    const compact = normalized.toLowerCase().replace(/\/$/, '');
    return this.channelRepository
      .createQueryBuilder('channel')
      .where("LOWER(REPLACE(channel.link, '/', '')) = :compact", {
        compact: compact.replace(/\//g, ''),
      })
      .getOne();
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
    const existing = await this.findByLink(link);
    const duplicate = await this.findActiveDuplicate(link);
    const shown = duplicate ?? existing;

    return {
      link,
      title: preview.title ?? '',
      description: preview.description ?? '',
      avatarUrl: preview.avatarUrl,
      memberCount: preview.memberCount,
      alreadyRegistered: Boolean(duplicate ?? existing),
      existingChannelId: shown?.id ?? null,
      existingStatus: shown?.status ?? null,
    };
  }

  async createByAdmin(data: {
    title: string;
    link: string;
    linkType: LinkType;
    category: string;
    description?: string;
    isPromoted?: boolean;
  }): Promise<Channel> {
    const link = this.normalizeTelegramLink(data.link);
    const duplicate = await this.findActiveDuplicate(link);
    if (duplicate) {
      throw new ConflictException(ALREADY_REGISTERED_CHANNEL);
    }
    const existing = await this.findByLink(link);
    if (existing) {
      throw new ConflictException('이미 등록된 채널/그룹 링크입니다.');
    }

    const channel = this.channelRepository.create({
      title: data.title.trim(),
      link,
      linkType: data.linkType,
      category: data.category,
      description: (data.description?.trim() || data.title.trim()).slice(
        0,
        2000,
      ),
      status: ChannelStatus.ACTIVE,
      avatarApproved: false,
      submittedBy: null,
    });

    let saved = await this.channelRepository.save(channel);

    try {
      saved = await this.importAvatarFromTelegram(saved.id);
    } catch {
      saved = await this.refreshPreview(saved.id);
    }

    if (data.isPromoted) {
      saved = await this.promote(saved.id, { durationDays: 7 });
    }

    return saved;
  }

  async refreshPreview(id: string) {
    const channel = await this.findById(id);
    const preview = await this.telegramPreviewService.fetchPreview(
      channel.link,
    );
    if (preview.avatarUrl) channel.avatarUrl = preview.avatarUrl;
    if (preview.title && channel.status === ChannelStatus.PENDING)
      channel.title = preview.title;
    if (preview.description && channel.status === ChannelStatus.PENDING)
      channel.description = preview.description;
    if (preview.memberCount) {
      const parsed = Number.parseInt(
        preview.memberCount.replace(/\D/g, ''),
        10,
      );
      if (Number.isFinite(parsed) && parsed > 0) channel.memberCount = parsed;
    }
    return this.channelRepository.save(channel);
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
      avatarUrl: channel.avatarUrl ?? preview.avatarUrl,
      memberCount: preview.memberCount,
      link: channel.link,
      avatarApproved: channel.avatarApproved,
    };
  }

  async importAvatarFromTelegram(id: string) {
    const channel = await this.findById(id);
    const preview = await this.telegramPreviewService.fetchPreview(
      channel.link,
    );

    if (!preview.avatarUrl) {
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
    const deduped = this.dedupeByLink(allItems);
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
    return this.dedupeByLink(channels).map((channel) =>
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

  async findBySubmitter(userId: number): Promise<Channel[]> {
    return this.channelRepository.find({
      where: { submittedBy: userId },
      order: { createdAt: 'DESC' },
    });
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
    if (!channel.avatarUrl) channel = await this.refreshPreview(id);
    channel.status = ChannelStatus.ACTIVE;
    channel.avatarApproved = Boolean(channel.avatarUrl);
    if (isPromoted) channel.isPromoted = true;
    return this.channelRepository.save(channel);
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
    this.applyPromotionClient(channel, options);
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

  private mockTonAmount(channel: Channel): number {
    const seed = parseInt(channel.id.replace(/-/g, '').slice(0, 8), 16);
    return Math.round((3 + (seed % 80) / 10) * 10) / 10;
  }

  private applyPromotionClient(
    channel: Channel,
    options: {
      clientTelegramId?: number;
      clientName?: string;
      tonAmount?: number;
    },
  ) {
    channel.promotionClientTelegramId =
      options.clientTelegramId ??
      channel.promotionClientTelegramId ??
      channel.submittedBy ??
      847291036;
    channel.promotionClientName =
      options.clientName ??
      channel.promotionClientName ??
      `광고의뢰_${channel.promotionClientTelegramId}`;
    channel.promotionTonAmount =
      options.tonAmount ??
      channel.promotionTonAmount ??
      this.mockTonAmount(channel);
  }

  async ensurePromotionClientInfo(channel: Channel): Promise<Channel> {
    if (
      channel.promotionClientTelegramId &&
      channel.promotionClientName &&
      channel.promotionTonAmount != null
    ) {
      return channel;
    }
    this.applyPromotionClient(channel, {});
    return this.channelRepository.save(channel);
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
    if (filters.linkType)
      qb.andWhere('channel.link_type = :linkType', {
        linkType: filters.linkType,
      });
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
    } else if (filters.collectStatus === 'invalid') {
      qb.andWhere('channel.collect_status = :collectInvalid', {
        collectInvalid: 'invalid',
      });
    }
    if (filters.q?.trim()) {
      const keyword = `%${filters.q.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(channel.title) LIKE :keyword OR LOWER(channel.link) LIKE :keyword OR LOWER(channel.category) LIKE :keyword OR LOWER(channel.username) LIKE :keyword)',
        { keyword },
      );
    }
    qb.orderBy('channel.created_at', 'DESC');
    const items = await qb.getMany();
    return Promise.all(
      items.map((item) =>
        item.isPromoted ? this.ensurePromotionClientInfo(item) : item,
      ),
    );
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
    return Promise.all(
      items.map((item) => this.ensurePromotionClientInfo(item)),
    );
  }

  async updateAdmin(
    id: string,
    data: Partial<
      Pick<
        Channel,
        | 'title'
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
      const other = await this.channelRepository
        .createQueryBuilder('channel')
        .where('LOWER(channel.link) = :key', { key: this.linkKey(normalized) })
        .andWhere('channel.id <> :id', { id })
        .getOne();
      if (other) {
        throw new ConflictException('이미 등록된 채널/그룹 링크입니다.');
      }
      channel.link = normalized;
      const username = extractTelegramUsernameFromLink(normalized);
      if (username) {
        channel.username = username;
      } else if (isInviteOnlyLink(normalized)) {
        channel.username = null;
      }
      channel.collectStatus = isInviteOnlyLink(normalized)
        ? 'invite_only'
        : null;
      channel.collectError = null;
      channel.collectFailCount = 0;
    }
    if (data.title !== undefined) channel.title = data.title;
    if (data.category !== undefined) {
      channel.category = data.category;
      channel.categoryLocked = true;
    }
    if (data.categoryLocked !== undefined) {
      channel.categoryLocked = data.categoryLocked;
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
    if (data.status !== undefined) channel.status = data.status;
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
    // 전체 엔티티 대신 집계에 필요한 필드만 로드
    const channels = this.dedupeByLink(
      await this.channelRepository.find({
        where: { status: ChannelStatus.ACTIVE },
        select: [
          'id',
          'link',
          'category',
          'firstObservedAt',
          'collectStatus',
          'language',
          'isPromoted',
          'isVisible',
        ],
      }),
    )
      .filter(isPublicCollectable)
      .filter(isVisibleOnPublicLists);

    const counts: Record<string, number> = {
      all: channels.filter(
        (c) =>
          allowAdultInList(c.category) && c.category !== PENDING_CATEGORY,
      ).length,
    };
    for (const channel of channels) {
      if (channel.category === PENDING_CATEGORY) continue;
      counts[channel.category] = (counts[channel.category] ?? 0) + 1;
    }
    return counts;
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
