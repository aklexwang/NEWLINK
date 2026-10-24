import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname, join } from 'path';
import { randomBytes } from 'crypto';
import { ChannelStatus, LinkType } from '../channels/channel.entity';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { TelegramUserParam } from '../auth/telegram-user.decorator';
import type { TelegramUser } from '../auth/interfaces/telegram-user.interface';
import { ChannelsService } from '../channels/channels.service';
import { describeMemberPageVisibility } from '../stats/public-list-visibility.logic';
import { RewardPayoutService } from '../payments/reward-payout.service';
import { UsersService } from '../users/users.service';
import { AdminCollectService } from './admin-collect.service';
import {
  ApproveChannelDto,
  AdminCreateChannelDto,
  CandidateIdsDto,
  LookupChannelQueryDto,
  PromoteChannelDto,
  RecordRewardDto,
  UpdateChannelDto,
  BulkVisibilityDto,
  BulkCategoryDto,
  BulkCollectDto,
} from './dto/admin.dto';

const CHANNEL_UPLOAD_DIR = join(process.cwd(), 'uploads', 'channels');
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

function ensureChannelUploadDir() {
  if (!existsSync(CHANNEL_UPLOAD_DIR)) {
    mkdirSync(CHANNEL_UPLOAD_DIR, { recursive: true });
  }
}

@Controller('admin/channels')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly usersService: UsersService,
    private readonly rewardPayout: RewardPayoutService,
    private readonly adminCollect: AdminCollectService,
  ) {}

  @Get('pending')
  async getPending() {
    const channels = await this.channelsService.findPending();
    return Promise.all(
      channels.map(async (channel) => ({
        ...channel,
        reporter: await this.usersService.getReporterOrNull(
          channel.submittedBy,
        ),
      })),
    );
  }

  @Get('pending-count')
  async getPendingCount() {
    const channels = await this.channelsService.findPending();
    return { count: channels.length };
  }

  @Get('all')
  async findAll(
    @Query('status') status?: ChannelStatus,
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('linkType') linkType?: LinkType,
    @Query('collectStatus') collectStatus?: string,
    @Query('visibility') visibility?: 'visible' | 'hidden',
    @Query('autoRegistered') autoRegistered?: string,
    @Query('language') language?: string,
    @Query('source') source?: 'auto' | 'admin' | 'report',
    @Query('memberPage') memberPage?: 'yes' | 'no' | '',
    @Query('hideReason') hideReason?: string,
    @Query('createdFrom') createdFrom?: 'today' | '7d',
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('promoted') promoted?: string,
  ) {
    const result = await this.channelsService.findAllAdmin({
      status,
      q,
      category,
      linkType,
      collectStatus,
      visibility,
      autoRegistered:
        autoRegistered === '1' || autoRegistered === 'true' ? true : undefined,
      language,
      source,
      memberPage,
      hideReason,
      createdFrom,
      sort,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      promoted: promoted === '1' || promoted === 'true' ? true : undefined,
    });
    const items = await Promise.all(
      result.items.map(async (channel) => {
        const base = channel.isPromoted
          ? await this.withAdClient(channel)
          : channel;
        const memberPageInfo = describeMemberPageVisibility(channel);
        return {
          ...base,
          reporter: channel.submittedBy
            ? await this.usersService.getReporterOrNull(channel.submittedBy)
            : null,
          memberPageVisible: memberPageInfo.visible,
          memberPageHiddenReason: memberPageInfo.reason,
          memberPageReasonKey: memberPageInfo.reasonKey,
        };
      }),
    );
    return {
      items,
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      categoryCounts: result.categoryCounts,
    };
  }

  @Get('lookup')
  lookup(@Query() query: LookupChannelQueryDto) {
    return this.channelsService.lookupTelegramLink(query.link);
  }

  @Post('register')
  register(@Body() dto: AdminCreateChannelDto) {
    return this.channelsService.createByAdmin(dto);
  }

  @Post('reject-invalid')
  rejectInvalid(@Body() dto: CandidateIdsDto) {
    return this.channelsService.rejectInvalidSelected(dto.ids);
  }

  @Post('category')
  setCategory(@Body() dto: BulkCategoryDto) {
    return this.channelsService.setCategoryMany(dto.ids, dto.category);
  }

  @Post('collect')
  collectMany(@Body() dto: BulkCollectDto) {
    return this.adminCollect.collectMany(dto.ids);
  }

  @Post(':id/collect')
  async collectOne(@Param('id') id: string) {
    const channel = await this.adminCollect.collectOne(id);
    const memberPageInfo = describeMemberPageVisibility(channel);
    return {
      ...channel,
      memberPageVisible: memberPageInfo.visible,
      memberPageHiddenReason: memberPageInfo.reason,
      memberPageReasonKey: memberPageInfo.reasonKey,
    };
  }

  @Post('visibility')
  setVisibility(
    @Body() dto: BulkVisibilityDto,
    @TelegramUserParam() user: TelegramUser,
  ) {
    return this.channelsService.setVisibilityMany(
      dto.ids,
      dto.isVisible,
      user.id,
    );
  }

  @Post('upload-avatar')
  @UseInterceptors(
    FileInterceptor('icon', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          ensureChannelUploadDir();
          cb(null, CHANNEL_UPLOAD_DIR);
        },
        filename: (_req, file, cb) => {
          const ext = extname(file.originalname).toLowerCase() || '.png';
          cb(null, `${Date.now()}-${randomBytes(6).toString('hex')}${ext}`);
        },
      }),
      limits: { fileSize: 512 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.has(file.mimetype)) {
          cb(
            new BadRequestException(
              'PNG, JPG, WEBP, GIF, SVG 이미지만 업로드할 수 있습니다.',
            ),
            false,
          );
          return;
        }
        cb(null, true);
      },
    }),
  )
  uploadAvatar(@UploadedFile() file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('이미지 파일을 선택해 주세요.');
    }

    return { avatarUrl: `/api/uploads/channels/${file.filename}` };
  }

  private async withAdClient(
    channel: Awaited<ReturnType<ChannelsService['findById']>>,
  ) {
    const user = channel.promotionClientTelegramId
      ? await this.usersService.getReporterOrNull(
          channel.promotionClientTelegramId,
        )
      : null;

    return {
      ...channel,
      adClient: {
        telegramId: channel.promotionClientTelegramId,
        name:
          user?.firstName ??
          (user?.username ? `@${user.username}` : null) ??
          channel.promotionClientName ??
          '광고 의뢰자',
        username: user?.username ?? null,
        tonWalletAddress: user?.tonWalletAddress ?? null,
        tonAmount: channel.promotionTonAmount,
      },
    };
  }

  @Post(':id/import-avatar')
  importAvatar(@Param('id') id: string) {
    return this.channelsService.importAvatarFromTelegram(id);
  }

  @Get(':id/preview')
  getPreview(@Param('id') id: string) {
    return this.channelsService.getPreview(id);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Body() dto: ApproveChannelDto) {
    return this.channelsService.approve(id, dto.isPromoted ?? false);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.channelsService.reject(id);
  }

  @Patch(':id/promote')
  promote(@Param('id') id: string, @Body() dto: PromoteChannelDto) {
    return this.channelsService.promote(id, {
      durationDays: dto.durationDays,
      promotedUntil: dto.promotedUntil
        ? new Date(dto.promotedUntil)
        : undefined,
      clientTelegramId: dto.clientTelegramId,
      clientName: dto.clientName,
      tonAmount: dto.tonAmount,
    });
  }

  @Post(':id/reward')
  async recordReward(@Param('id') id: string, @Body() dto: RecordRewardDto) {
    const result = await this.rewardPayout.recordChannelPayout(id, {
      amountTon: dto.amountTon,
      amount: dto.amount,
      wallet: dto.wallet,
      method: dto.method,
      sendMethod: dto.sendMethod,
      currency: dto.currency,
      memo: dto.memo,
      force: dto.force,
      phase: dto.phase,
      payoutRecordId: dto.payoutRecordId,
    });
    return {
      ...result.channel,
      payoutRecordId: result.payoutRecord.id,
      payoutRecordStatus: result.payoutRecord.status,
    };
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
    @TelegramUserParam() user: TelegramUser,
  ) {
    return this.channelsService.updateAdmin(
      id,
      {
      title: dto.title,
      category: dto.category,
      linkType: dto.linkType,
      status: dto.status,
      isPromoted: dto.isPromoted,
      promotedUntil:
        dto.promotedUntil === undefined
          ? undefined
          : dto.promotedUntil
            ? new Date(dto.promotedUntil)
            : null,
      promotionClientTelegramId: dto.promotionClientTelegramId,
      promotionClientName: dto.promotionClientName,
      promotionTonAmount: dto.promotionTonAmount,
      avatarUrl: dto.avatarUrl,
      avatarApproved: dto.avatarApproved,
      language: dto.language,
      languageLocked: dto.languageLocked,
      link: dto.link,
      isVisible: dto.isVisible,
      categoryLocked: dto.categoryLocked,
      },
      user.id,
    );
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.channelsService.remove(id);
  }
}
