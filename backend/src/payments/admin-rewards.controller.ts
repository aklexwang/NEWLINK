import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import {
  ConfirmPayoutDto,
  FailPayoutDto,
  PayoutMethodCreateDto,
  PayoutMethodUpdateDto,
  RewardSettingsPatchDto,
  SkipPayoutDto,
  VoidPayoutDto,
} from './dto/reward.dto';
import { RewardPayoutService } from './reward-payout.service';

@Controller('admin/rewards')
@UseGuards(TelegramAuthGuard, TelegramAdminGuard)
export class AdminRewardsController {
  constructor(private readonly rewards: RewardPayoutService) {}

  @Get('settings')
  settings() {
    return this.rewards.getSettings();
  }

  @Patch('settings')
  patchSettings(@Body() dto: RewardSettingsPatchDto) {
    return this.rewards.setEnabled(dto.enabled, 'admin');
  }

  /** 활성/비활성 바꾼 기록 */
  @Get('settings/history')
  settingsHistory() {
    return this.rewards.toggleHistory(10);
  }

  @Get('methods')
  methods() {
    return this.rewards.listMethods();
  }

  @Post('methods')
  createMethod(@Body() dto: PayoutMethodCreateDto) {
    return this.rewards.createMethod(dto);
  }

  @Patch('methods/:id')
  updateMethod(@Param('id') id: string, @Body() dto: PayoutMethodUpdateDto) {
    return this.rewards.updateMethod(id, dto);
  }

  @Get('pending-payouts')
  pendingPayouts() {
    return this.rewards.listPendingPayouts();
  }

  @Get('records')
  records(
    @Query('status') status?: string,
    @Query('currency') currency?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.rewards.listRecords({ status, currency, q, from, to });
  }

  @Post('channels/:id/skip')
  skip(@Param('id') id: string, @Body() dto: SkipPayoutDto) {
    return this.rewards.skipPayout(id, dto.reason, dto.force);
  }

  @Post('records/:id/void')
  voidRecord(@Param('id') id: string, @Body() dto: VoidPayoutDto) {
    return this.rewards.voidRecord(id, dto.reason);
  }

  @Post('records/:id/confirm')
  confirm(@Param('id') id: string, @Body() dto: ConfirmPayoutDto) {
    return this.rewards.confirmRecord(id, dto.memo);
  }

  @Post('records/:id/fail')
  fail(@Param('id') id: string, @Body() dto: FailPayoutDto) {
    return this.rewards.failRecord(id, dto.reason);
  }
}
