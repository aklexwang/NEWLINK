import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Channel } from '../channels/channel.entity';
import { ChannelsModule } from '../channels/channels.module';
import { UsersModule } from '../users/users.module';
import { AdminTonPaymentsController } from './admin-ton-payments.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TonPayment } from './ton-payment.entity';
import { TonPaymentService } from './ton-payment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TonPayment, Channel]),
    ChannelsModule,
    UsersModule,
  ],
  controllers: [PaymentsController, AdminTonPaymentsController],
  providers: [PaymentsService, TonPaymentService],
  exports: [TonPaymentService],
})
export class PaymentsModule {}
