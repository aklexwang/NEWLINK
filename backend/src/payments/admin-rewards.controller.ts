import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TelegramAdminGuard } from '../auth/telegram-admin.guard';
import { TelegramAuthGuard } from '../auth/telegram-auth.guard';
import {
  PayoutMethodCreateDto,
  PayoutMethodUpdateDto,
  RewardSettingsPatchDto,
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
    return this.rewards.setEnabled(dto.enabled);
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
}
