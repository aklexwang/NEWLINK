import {
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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
import { AdStatsService } from '../ads/ad-stats.service';
import { MemberActivityService } from '../member-activity/member-activity.service';

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
    private readonly adStats: AdStatsService,
    @Optional() private readonly memberActivity?: MemberActivityService,
  ) {}

  /** 회원 오른쪽 패널: 성향·검색 키워드·이동한 방 (최근 90일) */
  @Get(':telegramId/activity')
  activity(@Param('telegramId', ParseIntPipe) telegramId: number) {
    if (!this.memberActivity) return { profile: null, recent: [] };
    return this.memberActivity.profile(telegramId);
  }

  /** [AI 요약] 버튼 (AI 하루 한도 사용) */
  @Post(':telegramId/activity/ai-summary')
  aiSummary(@Param('telegramId', ParseIntPipe) telegramId: number) {
    if (!this.memberActivity)
      return { summary: null, reason: '기능이 꺼져 있어요.' };
    return this.memberActivity.aiSummary(telegramId);
  }

  @Get()
  async findAll() {
    const [users, submissionCounts, payoutTotals, adSummaries] =
      await Promise.all([
        this.usersService.findAll(),
        this.channelsService.getSubmissionCountsByUser(),
        this.rewards.paidTotalsByTelegramId(),
        this.adStats.advertiserSummaries(),
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
        adSummary: adSummaries[String(user.telegramId)] ?? {
          ads: 0,
          live: 0,
          paidUsdt: 0,
        },
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
    // 회원을 지우면 활동 기록(성향 데이터)도 같이 지운다
    await this.memberActivity?.deleteForUser(telegramId);
    return this.usersService.deleteByTelegramId(telegramId);
  }
}
