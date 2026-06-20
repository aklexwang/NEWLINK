import { Controller, Get, UseGuards } from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';

@Controller('admin/users')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly channelsService: ChannelsService,
  ) {}

  @Get()
  async findAll() {
    const [users, submissionCounts] = await Promise.all([
      this.usersService.findAll(),
      this.channelsService.getSubmissionCountsByUser(),
    ]);

    return users.map((user) => ({
      telegramId: user.telegramId,
      firstName: user.firstName,
      username: user.username,
      tonWalletAddress: user.tonWalletAddress,
      isRegistered: user.isRegistered,
      submissionCount: submissionCounts[user.telegramId] ?? 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }
}