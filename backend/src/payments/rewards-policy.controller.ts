import { Controller, Get } from '@nestjs/common';
import { RewardPayoutService } from './reward-payout.service';

@Controller('rewards')
export class RewardsPolicyController {
  constructor(private readonly rewards: RewardPayoutService) {}

  @Get('policy')
  policy() {
    return this.rewards.getPublicPolicy();
  }
}
