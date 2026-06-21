import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { Brackets, Repository } from 'typeorm';
import { Channel, ChannelStatus, LinkType } from './channel.entity';
import { ChannelRecommendation } from './channel-recommendation.entity';
import { CreateChannelDto, SearchChannelDto } from './dto/channel.dto';
import { TelegramPreviewService } from './telegram-preview.service';

const CHANNEL_UPLOAD_DIR = join(process.cwd(), 'uploads', 'channels');

@Injectable()
export class ChannelsService implements OnModuleInit {
  constructor(
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(ChannelRecommendation)
    private readonly recommendationRepository: Repository<ChannelRecommendation>,
    private readonly telegramPreviewService: TelegramPreviewService,
  ) {}

  async onModuleInit() {
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
  }

  async create(dto: CreateChannelDto, submittedBy: number): Promise<Channel> {
    const channel = this.channelRepository.create({
      ...dto,
      submittedBy,
      status: ChannelStatus.PENDING,
      avatarApproved: false,
    });
    const saved = await this.channelRepository.save(channel);
    void this.refreshPreview(saved.id).catch(() => undefined);
    return saved;
  }

  async refreshPreview(id: string) {
    const channel = await this.findById(id);
    const preview = await this.telegramPreviewService.fetchPreview(channel.link);
    if (preview.avatarUrl) channel.avatarUrl = preview.avatarUrl;
    if (preview.title && channel.status === ChannelStatus.PENDING) channel.title = preview.title;
    if (preview.description && channel.status === ChannelStatus.PENDING) channel.description = preview.description;
    if (preview.memberCount) {
      const parsed = Number.parseInt(preview.memberCount.replace(/\D/g, ''), 10);
      if (Number.isFinite(parsed) && parsed > 0) channel.memberCount = parsed;
    }
    return this.channelRepository.save(channel);
  }

  async getPreview(id: string) {
    const channel = await this.refreshPreview(id);
    const preview = await this.telegramPreviewService.fetchPreview(channel.link);
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
    const preview = await this.telegramPreviewService.fetchPreview(channel.link);

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

    channel.avatarUrl = await this.mirrorAvatarImage(preview.avatarUrl);
    channel.avatarApproved = true;
    return this.channelRepository.save(channel);
  }

  private async mirrorAvatarImage(sourceUrl: string): Promise<string> {
    if (sourceUrl.startsWith('/api/uploads/')) return sourceUrl;

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

  private extFromContentType(contentType: string): string | null {
    if (contentType.includes('png')) return '.png';
    if (contentType.includes('webp')) return '.webp';
    if (contentType.includes('gif')) return '.gif';
    if (contentType.includes('svg')) return '.svg';
    if (contentType.includes('jpeg') || contentType.includes('jpg')) return '.jpg';
    return null;
  }

  async search(dto: SearchChannelDto) {
    const page = dto.page ?? 1;
    const limit = dto.limit ?? 20;
    const skip = (page - 1) * limit;

    const qb = this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE });

    if (dto.category) qb.andWhere('channel.category = :category', { category: dto.category });

    if (dto.q?.trim()) {
      const keyword = `%${dto.q.trim().toLowerCase()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('LOWER(channel.title) LIKE :keyword', { keyword })
            .orWhere('LOWER(channel.description) LIKE :keyword', { keyword })
            .orWhere('LOWER(channel.category) LIKE :keyword', { keyword });
        }),
      );
    }

    const [allItems, total] = await qb.getManyAndCount();
    const now = new Date();
    const activeItems = allItems
      .map((item) => ({
        ...item,
        isPromoted: item.isPromoted && (!item.promotedUntil || item.promotedUntil > now),
      }))
      .sort((a, b) => {
        if (a.isPromoted !== b.isPromoted) return a.isPromoted ? -1 : 1;
        if (b.recommendCount !== a.recommendCount) return b.recommendCount - a.recommendCount;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(skip, skip + limit);

    return { items: activeItems, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findActivePromoted(limit = 50): Promise<Channel[]> {
    const now = new Date();
    return this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE })
      .andWhere('channel.is_promoted = :promoted', { promoted: true })
      .andWhere('(channel.promoted_until IS NULL OR channel.promoted_until > :now)', { now })
      .orderBy('channel.promoted_until', 'ASC')
      .addOrderBy('channel.recommend_count', 'DESC')
      .limit(limit)
      .getMany();
  }

  async findById(id: string): Promise<Channel> {
    const channel = await this.channelRepository.findOne({ where: { id } });
    if (!channel) throw new NotFoundException('Channel not found');
    return channel;
  }

  async getRecommendedChannelIds(userId: number): Promise<string[]> {
    const rows = await this.recommendationRepository.find({ where: { userId } });
    return rows.map((r) => r.channelId);
  }

  async findBySubmitter(userId: number): Promise<Channel[]> {
    return this.channelRepository.find({
      where: { submittedBy: userId },
      order: { createdAt: 'DESC' },
    });
  }

  async incrementRecommend(id: string, userId: number): Promise<Channel> {
    const channel = await this.findById(id);
    const existing = await this.recommendationRepository.findOne({ where: { userId, channelId: id } });
    if (existing) throw new ConflictException('Already recommended');
    await this.recommendationRepository.save({ userId, channelId: id });
    channel.recommendCount += 1;
    return this.channelRepository.save(channel);
  }

  async findPending(): Promise<Channel[]> {
    return this.channelRepository.find({ where: { status: ChannelStatus.PENDING }, order: { createdAt: 'ASC' } });
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
      promotedUntil.setDate(promotedUntil.getDate() + (options.durationDays ?? 7));
    }

    channel.isPromoted = true;
    channel.promotedUntil = promotedUntil;
    this.applyPromotionClient(channel, options);
    return this.channelRepository.save(channel);
  }

  private mockTonAmount(channel: Channel): number {
    const seed = parseInt(channel.id.replace(/-/g, '').slice(0, 8), 16);
    return Math.round((3 + (seed % 80) / 10) * 10) / 10;
  }

  private applyPromotionClient(
    channel: Channel,
    options: { clientTelegramId?: number; clientName?: string; tonAmount?: number },
  ) {
    channel.promotionClientTelegramId =
      options.clientTelegramId ?? channel.promotionClientTelegramId ?? channel.submittedBy ?? 847291036;
    channel.promotionClientName =
      options.clientName ?? channel.promotionClientName ?? `광고의뢰_${channel.promotionClientTelegramId}`;
    channel.promotionTonAmount =
      options.tonAmount ?? channel.promotionTonAmount ?? this.mockTonAmount(channel);
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

  async findAllAdmin(filters: { status?: ChannelStatus; q?: string; category?: string }) {
    const qb = this.channelRepository.createQueryBuilder('channel');
    if (filters.status) qb.andWhere('channel.status = :status', { status: filters.status });
    if (filters.category) qb.andWhere('channel.category = :category', { category: filters.category });
    if (filters.q?.trim()) {
      const keyword = `%${filters.q.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(channel.title) LIKE :keyword OR LOWER(channel.link) LIKE :keyword OR LOWER(channel.category) LIKE :keyword)',
        { keyword },
      );
    }
    qb.orderBy('channel.created_at', 'DESC');
    const items = await qb.getMany();
    return Promise.all(
      items.map((item) => (item.isPromoted ? this.ensurePromotionClientInfo(item) : item)),
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

    qb.orderBy('channel.promoted_until', 'ASC');
    const items = await qb.getMany();
    return Promise.all(items.map((item) => this.ensurePromotionClientInfo(item)));
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
      >
    >,
  ) {
    const channel = await this.findById(id);
    if (data.title !== undefined) channel.title = data.title;
    if (data.category !== undefined) channel.category = data.category;
    if (data.linkType !== undefined) channel.linkType = data.linkType;
    if (data.status !== undefined) channel.status = data.status;
    if (data.promotionClientTelegramId !== undefined) channel.promotionClientTelegramId = data.promotionClientTelegramId;
    if (data.promotionClientName !== undefined) channel.promotionClientName = data.promotionClientName;
    if (data.promotionTonAmount !== undefined) channel.promotionTonAmount = data.promotionTonAmount;
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
    if (data.avatarApproved !== undefined) channel.avatarApproved = data.avatarApproved;
    if (data.status === ChannelStatus.ACTIVE && channel.avatarUrl) channel.avatarApproved = true;
    return this.channelRepository.save(channel);
  }

  async getRanking(category?: string, limit = 50) {
    const normalizedLimit = Math.min(Math.max(limit, 1), 100);

    const qb = this.channelRepository
      .createQueryBuilder('channel')
      .where('channel.status = :status', { status: ChannelStatus.ACTIVE });

    if (category && category !== 'all') {
      qb.andWhere('channel.category = :category', { category });
    }

    const items = await qb.getMany();
    items.sort((a, b) => {
      const memberA = a.memberCount ?? 0;
      const memberB = b.memberCount ?? 0;
      if (memberB !== memberA) return memberB - memberA;
      return b.recommendCount - a.recommendCount;
    });

    return items.slice(0, normalizedLimit).map((channel) => ({
      id: channel.id,
      title: channel.title,
      username: this.extractUsername(channel.link),
      link: channel.link,
      avatarUrl: channel.avatarApproved ? channel.avatarUrl : null,
      participantsCount: channel.memberCount ?? 0,
      recommendCount: channel.recommendCount,
      category: channel.category,
      linkType: channel.linkType,
    }));
  }

  async getRankingCounts(): Promise<Record<string, number>> {
    const channels = await this.channelRepository.find({
      where: { status: ChannelStatus.ACTIVE },
      select: { category: true },
    });

    const counts: Record<string, number> = { all: channels.length };
    for (const channel of channels) {
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