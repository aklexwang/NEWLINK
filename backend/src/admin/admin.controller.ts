import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ChannelStatus } from '../channels/channel.entity';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';
import { ApproveChannelDto, PromoteChannelDto, UpdateChannelDto } from './dto/admin.dto';

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
    });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.channelsService.remove(id);
  }
}