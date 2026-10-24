import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { telegramIdKey } from '../common/telegram-id';
import { Channel } from '../channels/channel.entity';
import { User } from '../users/user.entity';
import { PayoutMethod } from './payout-method.entity';
import { PayoutRecord } from './payout-record.entity';
import { backfillPayoutStatus } from './payout-status.logic';
import {
  newPayoutMethodSeedRows,
  newPayoutRecordId,
  newRewardSettingsRow,
  shouldCopyTonPayment,
  shouldGapFillRewardChannel,
  shouldInsertWhenEmpty,
} from './reward-seed.logic';
import { RewardSettings } from './reward-settings.entity';
import { TonPayment } from './ton-payment.entity';
import { classifyWalletKind } from './wallet-kind.logic';

@Injectable()
export class RewardSeedService implements OnModuleInit {
  constructor(
    @InjectRepository(RewardSettings)
    private readonly settingsRepository: Repository<RewardSettings>,
    @InjectRepository(PayoutMethod)
    private readonly methodRepository: Repository<PayoutMethod>,
    @InjectRepository(PayoutRecord)
    private readonly recordRepository: Repository<PayoutRecord>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(TonPayment)
    private readonly tonPaymentRepository: Repository<TonPayment>,
  ) {}

  async onModuleInit() {
    if (shouldInsertWhenEmpty(await this.settingsRepository.count())) {
      await this.settingsRepository.insert(newRewardSettingsRow());
    }
    if (shouldInsertWhenEmpty(await this.methodRepository.count())) {
      await this.methodRepository.insert(newPayoutMethodSeedRows());
    }
    await this.backfillLocal();
  }

  /** 이미 채워진 행은 건너뜁니다. 운영 마이그레이션 이후에도 한 번 더 돌아도 됩니다. */
  async backfillLocal() {
    const users = await this.userRepository.find();
    for (const user of users) {
      if (user.walletKind) continue;
      const kind = classifyWalletKind(user.tonWalletAddress);
      if (!kind && !telegramIdKey(user.telegramId)) continue;
      user.walletKind = kind;
      await this.userRepository.save(user);
    }

    const channels = await this.channelRepository.find();
    for (const channel of channels) {
      if (channel.payoutStatus === 'skipped') continue;
      const next = backfillPayoutStatus({
        rewardTonAmount: channel.rewardTonAmount,
        submittedBy: channel.submittedBy,
        status: channel.status,
      });
      if (channel.payoutStatus !== next) {
        channel.payoutStatus = next;
        await this.channelRepository.save(channel);
      }
    }

    const payments = await this.tonPaymentRepository.find();
    const seen = new Set(
      (await this.recordRepository.find())
        .map((row) => row.sourceTonPaymentId)
        .filter((id): id is string => Boolean(id)),
    );
    const now = new Date();
    for (const payment of payments) {
      if (!shouldCopyTonPayment(payment.id, seen)) continue;
      await this.recordRepository.insert({
        id: newPayoutRecordId(),
        channelId: payment.channelId,
        telegramId: payment.telegramId,
        username: payment.reporterName,
        methodId: null,
        destinationKind: 'wallet_address',
        currency: 'TON',
        amount: payment.amount,
        walletAddress: payment.wallet,
        sendMethod: payment.method === 'tonconnect' ? 'tonconnect' : 'external',
        status: 'paid',
        txOrMemo: payment.memo,
        voidOrFailReason: null,
        source: 'ton_payment',
        sourceTonPaymentId: payment.id,
        createdAt: payment.paidAt ?? now,
        updatedAt: now,
        paidAt: payment.paidAt ?? now,
      });
      seen.add(payment.id);
    }

    const rewarded = channels.filter(
      (channel) =>
        channel.rewardTonAmount != null && Number(channel.rewardTonAmount) > 0,
    );
    for (const channel of rewarded) {
      const count = await this.recordRepository.count({
        where: { channelId: channel.id },
      });
      if (!shouldGapFillRewardChannel(count)) continue;
      await this.recordRepository.insert({
        id: newPayoutRecordId(),
        channelId: channel.id,
        telegramId: channel.submittedBy,
        username: null,
        methodId: null,
        destinationKind: 'wallet_address',
        currency: 'TON',
        amount: Number(channel.rewardTonAmount),
        walletAddress: channel.rewardWallet,
        sendMethod: 'external',
        status: 'paid',
        txOrMemo: 'reward_* 보강',
        voidOrFailReason: null,
        source: 'channel_reward',
        sourceTonPaymentId: null,
        createdAt: channel.rewardPaidAt ?? now,
        updatedAt: now,
        paidAt: channel.rewardPaidAt ?? now,
      });
    }
  }
}
