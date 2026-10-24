import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/channel.entity';
import { ChannelsModule } from '../channels/channels.module';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { AdminRewardsController } from './admin-rewards.controller';
import { AdminTonPaymentsController } from './admin-ton-payments.controller';
import { PayoutMethod } from './payout-method.entity';
import { PayoutRecord } from './payout-record.entity';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { RewardPayoutService } from './reward-payout.service';
import { RewardSeedService } from './reward-seed.service';
import { RewardSettings } from './reward-settings.entity';
import { RewardsPolicyController } from './rewards-policy.controller';
import { TonPayment } from './ton-payment.entity';
import { TonPaymentService } from './ton-payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TonPayment,
      Channel,
      User,
      RewardSettings,
      PayoutMethod,
      PayoutRecord,
    ]),
    ChannelsModule,
    UsersModule,
  ],
  controllers: [
    PaymentsController,
    AdminTonPaymentsController,
    AdminRewardsController,
    RewardsPolicyController,
  ],
  providers: [
    PaymentsService,
    TonPaymentService,
    RewardPayoutService,
    RewardSeedService,
  ],
  exports: [TonPaymentService, RewardPayoutService],
})
export class PaymentsModule {}
