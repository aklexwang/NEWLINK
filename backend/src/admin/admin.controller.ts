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
import { ChannelStatus } from '../channels/channel.entity';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';
import { ApproveChannelDto, PromoteChannelDto, UpdateChannelDto } from './dto/admin.dto';

const CHANNEL_UPLOAD_DIR = join(process.cwd(), 'uploads', 'channels');
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);

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
  ) {}

  @Get('pending')
  async getPending() {
    const channels = await this.channelsService.findPending();
    return Promise.all(
      channels.map(async (channel) => ({
        ...channel,
        reporter: await this.usersService.getReporterOrNull(channel.submittedBy),
      })),
    );
  }

  @Get('all')
  async findAll(
    @Query('status') status?: ChannelStatus,
    @Query('q') q?: string,
    @Query('category') category?: string,
  ) {
    const channels = await this.channelsService.findAllAdmin({ status, q, category });
    return Promise.all(
      channels.map((channel) => (channel.isPromoted ? this.withAdClient(channel) : channel)),
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
          cb(new BadRequestException('PNG, JPG, WEBP, GIF, SVG 이미지만 업로드할 수 있습니다.'), false);
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

  private async withAdClient(channel: Awaited<ReturnType<ChannelsService['findById']>>) {
    const user = channel.promotionClientTelegramId
      ? await this.usersService.getReporterOrNull(channel.promotionClientTelegramId)
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
      promotedUntil: dto.promotedUntil ? new Date(dto.promotedUntil) : undefined,
      clientTelegramId: dto.clientTelegramId,
      clientName: dto.clientName,
      tonAmount: dto.tonAmount,
    });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateChannelDto) {
    return this.channelsService.updateAdmin(id, {
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
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.channelsService.remove(id);
  }
}
