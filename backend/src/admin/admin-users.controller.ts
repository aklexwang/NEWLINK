import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';

class SetUserBlockedDto {
  @IsBoolean()
  isBlocked: boolean;
}

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
      isBlocked: user.isBlocked,
      submissionCount: submissionCounts[user.telegramId] ?? 0,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }

  @Patch(':telegramId/block')
  async setBlocked(
    @Param('telegramId', ParseIntPipe) telegramId: number,
    @Body() dto: SetUserBlockedDto,
  ) {
    return this.usersService.setBlocked(telegramId, dto.isBlocked);
  }

  @Delete(':telegramId')
  async remove(@Param('telegramId', ParseIntPipe) telegramId: number) {
    await this.channelsService.clearSubmitter(telegramId);
    return this.usersService.deleteByTelegramId(telegramId);
  }
}
