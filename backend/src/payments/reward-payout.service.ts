import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { Channel } from '../channels/channel.entity';
import { ChannelsService } from '../channels/channels.service';
import { UsersService } from '../users/users.service';
import { PayoutMethod } from './payout-method.entity';
import {
  PayoutRecord,
  type PayoutRecordStatus,
  type PayoutSendMethod,
} from './payout-record.entity';
import {
  isBlockingPayoutStatus,
  submitRequiresWallet,
} from './payout-status.logic';
import { newRewardSettingsRow } from './reward-seed.logic';
import { RewardSettings } from './reward-settings.entity';
import { TonPaymentService } from './ton-payment.service';

export const DUPLICATE_PAYOUT_MESSAGE = '이미 지급 기록이 있습니다';

export type RecordPayoutInput = {
  amountTon?: number;
  amount?: number;
  wallet?: string | null;
  memo?: string | null;
  method?: 'tonconnect' | 'external';
  sendMethod?: PayoutSendMethod;
  currency?: string;
  force?: boolean;
  phase?: 'sending' | 'paid' | 'failed';
  payoutRecordId?: string;
};

@Injectable()
export class RewardPayoutService {
  constructor(
    @InjectRepository(RewardSettings)
    private readonly settingsRepository: Repository<RewardSettings>,
    @InjectRepository(PayoutMethod)
    private readonly methodRepository: Repository<PayoutMethod>,
    @InjectRepository(PayoutRecord)
    private readonly recordRepository: Repository<PayoutRecord>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly channelsService: ChannelsService,
    private readonly usersService: UsersService,
    private readonly tonPaymentService: TonPaymentService,
  ) {}

  async getPublicPolicy() {
    const settings = await this.getSettings();
    const methods = await this.methodRepository.find();
    return {
      rewardsEnabled: settings.enabled,
      requireWallet: submitRequiresWallet({
        rewardsEnabled: settings.enabled,
        methods: methods.map((method) => ({
          enabled: method.enabled,
          destinationKind: method.destinationKind,
        })),
      }),
    };
  }

  async getSettings() {
    const existing = await this.settingsRepository.find({
      order: { updatedAt: 'DESC' },
      take: 1,
    });
    if (existing[0]) return existing[0];
    return this.settingsRepository.save(
      this.settingsRepository.create(newRewardSettingsRow()),
    );
  }

  async setEnabled(enabled: boolean) {
    const row = await this.getSettings();
    row.enabled = enabled;
    return this.settingsRepository.save(row);
  }

  listMethods() {
    return this.methodRepository.find({ order: { sort: 'ASC' } });
  }

  async createMethod(input: {
    code: string;
    label: string;
    destinationKind: 'wallet_address' | 'telegram_account';
    network?: string | null;
    currency: string;
    defaultAmount?: number;
    enabled?: boolean;
  }) {
    const code = input.code.trim().slice(0, 32);
    if (!code) throw new BadRequestException('수단 코드를 입력해 주세요.');
    const exists = await this.methodRepository.findOne({ where: { code } });
    if (exists) throw new ConflictException('이미 있는 지급 수단입니다.');
    const maxSort = await this.methodRepository
      .createQueryBuilder('row')
      .select('MAX(row.sort)', 'max')
      .getRawOne<{ max: number | null }>();
    const row = this.methodRepository.create({
      id: randomUUID(),
      code,
      label: input.label.trim().slice(0, 64) || code,
      destinationKind: input.destinationKind,
      network: input.network?.trim() || null,
      currency: input.currency.trim().slice(0, 16) || 'TON',
      defaultAmount: Number(input.defaultAmount ?? 0) || 0,
      enabled: input.enabled ?? true,
      sort: (maxSort?.max ?? -1) + 1,
      createdAt: new Date(),
    });
    return this.methodRepository.save(row);
  }

  async updateMethod(
    id: string,
    patch: { enabled?: boolean; defaultAmount?: number; label?: string },
  ) {
    const row = await this.methodRepository.findOneBy({ id });
    if (!row) throw new NotFoundException('지급 수단을 찾을 수 없습니다.');
    if (patch.enabled !== undefined) row.enabled = patch.enabled;
    if (patch.defaultAmount !== undefined) {
      row.defaultAmount = Number(patch.defaultAmount) || 0;
    }
    if (patch.label != null) row.label = patch.label.trim().slice(0, 64);
    return this.methodRepository.save(row);
  }

  async attachMemberRewards<T extends { id: string; rewardTonAmount?: number | null }>(
    channels: T[],
  ): Promise<Array<T & { rewardStarsAmount: number }>> {
    if (channels.length === 0) return [];
    const records = await this.recordRepository.find({
      where: {
        channelId: In(channels.map((channel) => channel.id)),
        status: 'paid',
        currency: 'STARS',
      },
    });
    const stars = new Map<string, number>();
    for (const record of records) {
      stars.set(
        record.channelId,
        (stars.get(record.channelId) ?? 0) + Number(record.amount || 0),
      );
    }
    return channels.map((channel) => ({
      ...channel,
      rewardStarsAmount: stars.get(channel.id) ?? 0,
    }));
  }

  async recordChannelPayout(channelId: string, input: RecordPayoutInput) {
    const channel = await this.channelRepository.findOneBy({ id: channelId });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');
    const phase = input.phase ?? 'paid';
    if (input.payoutRecordId) {
      return this.finishExisting(channel, input.payoutRecordId, phase, input);
    }
    if (phase === 'failed') {
      throw new BadRequestException('원장 아이디가 필요합니다.');
    }
    await this.assertNoBlocking(channelId, input.force === true);
    const currency = (input.currency ?? 'TON').toUpperCase();
    const sendMethod = this.resolveSendMethod(input, currency);
    const amount = this.resolveAmount(input, currency);
    const now = new Date();
    const reporter = await this.usersService.getReporterOrNull(channel.submittedBy);
    const record = this.recordRepository.create({
      id: randomUUID(),
      channelId: channel.id,
      telegramId: channel.submittedBy,
      username: reporter?.username
        ? `@${reporter.username}`
        : (reporter?.firstName ?? null),
      methodId: await this.methodIdForCurrency(currency),
      destinationKind:
        currency === 'STARS' ? 'telegram_account' : 'wallet_address',
      currency,
      amount,
      walletAddress:
        currency === 'STARS' ? null : input.wallet?.trim() || null,
      sendMethod,
      status: phase === 'sending' ? 'sending' : 'paid',
      txOrMemo: input.memo?.trim() || null,
      voidOrFailReason: null,
      source: 'live',
      sourceTonPaymentId: null,
      createdAt: now,
      updatedAt: now,
      paidAt: phase === 'paid' ? now : null,
    });
    await this.recordRepository.save(record);
    if (record.status === 'paid') {
      await this.dualWritePaid(channel, record, input);
    }
    return { channel: await this.reloadChannel(channel.id), payoutRecord: record };
  }

  private async finishExisting(
    channel: Channel,
    payoutRecordId: string,
    phase: 'sending' | 'paid' | 'failed',
    input: RecordPayoutInput,
  ) {
    const record = await this.recordRepository.findOneBy({ id: payoutRecordId });
    if (!record || record.channelId !== channel.id) {
      throw new NotFoundException('지급 기록을 찾을 수 없습니다.');
    }
    if (phase === 'sending') {
      return { channel, payoutRecord: record };
    }
    const now = new Date();
    record.updatedAt = now;
    if (input.memo?.trim()) record.txOrMemo = input.memo.trim();
    if (phase === 'failed') {
      record.status = 'failed';
      record.voidOrFailReason = input.memo?.trim() || '송금 실패 또는 취소';
      await this.recordRepository.save(record);
      return { channel, payoutRecord: record };
    }
    record.status = 'paid';
    record.paidAt = now;
    await this.recordRepository.save(record);
    await this.dualWritePaid(channel, record, input);
    return { channel: await this.reloadChannel(channel.id), payoutRecord: record };
  }

  private async assertNoBlocking(channelId: string, force: boolean) {
    const rows = await this.recordRepository.find({
      where: { channelId, status: In(['paid', 'sending'] as PayoutRecordStatus[]) },
    });
    if (rows.some((row) => isBlockingPayoutStatus(row.status)) && !force) {
      throw new ConflictException(DUPLICATE_PAYOUT_MESSAGE);
    }
  }

  private resolveSendMethod(
    input: RecordPayoutInput,
    currency: string,
  ): PayoutSendMethod {
    if (input.sendMethod) return input.sendMethod;
    if (currency === 'STARS') return 'manual_gift';
    if (input.method === 'tonconnect') return 'tonconnect';
    return 'external';
  }

  private resolveAmount(input: RecordPayoutInput, currency: string) {
    const raw =
      currency === 'STARS' ? (input.amount ?? input.amountTon) : input.amountTon;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('지급 수량을 확인해 주세요.');
    }
    if (currency === 'STARS' && !Number.isInteger(amount)) {
      throw new BadRequestException('Stars 는 정수만 기록합니다.');
    }
    return amount;
  }

  private async methodIdForCurrency(currency: string) {
    const map: Record<string, string> = {
      TON: 'ton',
      STARS: 'stars',
      USDT: 'usdt_trc20',
    };
    const code = map[currency];
    if (!code) return null;
    const method = await this.methodRepository.findOne({ where: { code } });
    return method?.id ?? null;
  }

  private async dualWritePaid(
    channel: Channel,
    record: PayoutRecord,
    input: RecordPayoutInput,
  ) {
    if (record.currency === 'TON') {
      await this.channelsService.recordReporterReward(channel.id, {
        amountTon: record.amount,
        wallet: record.walletAddress,
      });
      await this.tonPaymentService.create({
        channelId: channel.id,
        amount: record.amount,
        wallet: record.walletAddress || '',
        method:
          record.sendMethod === 'tonconnect' ? 'tonconnect' : 'external',
        memo: record.txOrMemo,
        telegramId: channel.submittedBy ?? null,
        channelTitle: channel.title,
        channelLink: channel.link,
      });
    }
    channel.payoutStatus = 'paid';
    channel.payoutSkipReason = null;
    await this.channelRepository.update(channel.id, {
      payoutStatus: 'paid',
      payoutSkipReason: null,
    });
    void input;
  }

  private reloadChannel(id: string) {
    return this.channelsService.findById(id);
  }
}
