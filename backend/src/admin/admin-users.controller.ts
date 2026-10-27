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
import { emptyUserPayoutTotals } from '../payments/payout-format.logic';
import { RewardPayoutService } from '../payments/reward-payout.service';
import { telegramIdKey } from '../common/telegram-id';
import { UsersService } from '../users/users.service';

class SetUserBlockedDto {
  @IsBoolean()
  isBlocked: boolean;
}

class SetUserAdvertiserDto {
  @IsBoolean()
  isAdvertiser: boolean;
}

@Controller('admin/users')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly channelsService: ChannelsService,
    private readonly rewards: RewardPayoutService,
  ) {}

  @Get()
  async findAll() {
    const [users, submissionCounts, payoutTotals] = await Promise.all([
      this.usersService.findAll(),
      this.channelsService.getSubmissionCountsByUser(),
      this.rewards.paidTotalsByTelegramId(),
    ]);

    return users.map((user) => {
      const totals =
        payoutTotals[telegramIdKey(user.telegramId)] ?? emptyUserPayoutTotals();
      return {
        telegramId: user.telegramId,
        firstName: user.firstName,
        username: user.username,
        tonWalletAddress: user.tonWalletAddress,
        walletKind: user.walletKind,
        isRegistered: user.isRegistered,
        isBlocked: user.isBlocked,
        isAdvertiser: Boolean(user.isAdvertiser),
        submissionCount: submissionCounts[user.telegramId] ?? 0,
        payoutCount: totals.payoutCount,
        payoutTon: totals.payoutTon,
        payoutUsdt: totals.payoutUsdt,
        payoutStars: totals.payoutStars,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  @Patch(':telegramId/block')
  async setBlocked(
    @Param('telegramId', ParseIntPipe) telegramId: number,
    @Body() dto: SetUserBlockedDto,
  ) {
    return this.usersService.setBlocked(telegramId, dto.isBlocked);
  }

  /** 일반회원 ↔ 광고회원 */
  @Patch(':telegramId/advertiser')
  async setAdvertiser(
    @Param('telegramId', ParseIntPipe) telegramId: number,
    @Body() dto: SetUserAdvertiserDto,
  ) {
    return this.usersService.setAdvertiser(telegramId, dto.isAdvertiser);
  }

  @Delete(':telegramId')
  async remove(@Param('telegramId', ParseIntPipe) telegramId: number) {
    await this.channelsService.clearSubmitter(telegramId);
    return this.usersService.deleteByTelegramId(telegramId);
  }
}
