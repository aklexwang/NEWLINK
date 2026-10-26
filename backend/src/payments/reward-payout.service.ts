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
  addPaidAmount,
  emptyUserPayoutTotals,
  normalizePayoutAmount,
  type UserPayoutTotals,
} from './payout-format.logic';
import {
  isBlockingPayoutStatus,
  submitRequiresWallet,
} from './payout-status.logic';
import { newRewardSettingsRow } from './reward-seed.logic';
import { telegramIdKey } from '../common/telegram-id';
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
  methodId?: string;
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

  async attachMemberRewards<
    T extends { id: string; rewardTonAmount?: number | null },
  >(channels: T[]): Promise<Array<T & { rewardStarsAmount: number }>> {
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
    const reporter = await this.usersService.getReporterOrNull(
      channel.submittedBy,
    );
    const record = this.recordRepository.create({
      id: randomUUID(),
      channelId: channel.id,
      telegramId: channel.submittedBy,
      username: reporter?.username
        ? `@${reporter.username}`
        : (reporter?.firstName ?? null),
      methodId: input.methodId ?? (await this.methodIdForCurrency(currency)),
      destinationKind:
        currency === 'STARS' ? 'telegram_account' : 'wallet_address',
      currency,
      amount,
      walletAddress: currency === 'STARS' ? null : input.wallet?.trim() || null,
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
    return {
      channel: await this.reloadChannel(channel.id),
      payoutRecord: record,
    };
  }

  private async finishExisting(
    channel: Channel,
    payoutRecordId: string,
    phase: 'sending' | 'paid' | 'failed',
    input: RecordPayoutInput,
  ) {
    const record = await this.recordRepository.findOneBy({
      id: payoutRecordId,
    });
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
    return {
      channel: await this.reloadChannel(channel.id),
      payoutRecord: record,
    };
  }

  private async assertNoBlocking(channelId: string, force: boolean) {
    const rows = await this.recordRepository.find({
      where: {
        channelId,
        status: In(['paid', 'sending'] as PayoutRecordStatus[]),
      },
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
    try {
      return normalizePayoutAmount(
        currency,
        Number(input.amount ?? input.amountTon),
      );
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : '지급 수량을 확인해 주세요.',
      );
    }
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
        method: record.sendMethod === 'tonconnect' ? 'tonconnect' : 'external',
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

  async listPendingPayouts() {
    const [channels, methods] = await Promise.all([
      this.channelRepository.find({
        where: { payoutStatus: 'pending' },
        order: { createdAt: 'DESC' },
      }),
      this.listMethods(),
    ]);
    const items = await Promise.all(
      channels.map(async (channel) => ({
        ...channel,
        reporter: await this.usersService.getReporterOrNull(
          channel.submittedBy,
        ),
      })),
    );
    return {
      methods: methods.filter((method) => method.enabled),
      items,
    };
  }

  async listRecords(filter: {
    status?: string;
    currency?: string;
    q?: string;
    from?: string;
    to?: string;
  }) {
    const rows = await this.recordRepository.find();
    const q = filter.q?.trim().toLowerCase() ?? '';
    const from = filter.from ? new Date(filter.from) : null;
    const to = filter.to ? new Date(`${filter.to}T23:59:59.999`) : null;
    const filtered = rows.filter((row) => {
      if (filter.status && row.status !== filter.status) return false;
      if (
        filter.currency &&
        row.currency.toUpperCase() !== filter.currency.toUpperCase()
      ) {
        return false;
      }
      if (from && new Date(row.createdAt) < from) return false;
      if (to && new Date(row.createdAt) > to) return false;
      if (q) {
        const hay = [
          row.username,
          row.walletAddress,
          row.txOrMemo,
          row.channelId,
          row.telegramId,
          row.currency,
          row.sendMethod,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      if (a.status === 'sending' && b.status !== 'sending') return -1;
      if (b.status === 'sending' && a.status !== 'sending') return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const ids = [...new Set(filtered.map((row) => row.channelId))];
    const channels =
      ids.length > 0
        ? await this.channelRepository.find({ where: { id: In(ids) } })
        : [];
    const titles = new Map(
      channels.map((channel) => [channel.id, channel.title]),
    );
    return filtered.map((row) => ({
      ...row,
      channelTitle: titles.get(row.channelId) ?? null,
    }));
  }

  async skipPayout(channelId: string, reason: string, force?: boolean) {
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new BadRequestException('지급 안 함 이유를 입력해 주세요.');
    }
    const channel = await this.channelRepository.findOneBy({ id: channelId });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');
    await this.assertNoBlocking(channelId, force === true);
    await this.channelRepository.update(channelId, {
      payoutStatus: 'skipped',
      payoutSkipReason: trimmed.slice(0, 500),
    });
    return this.reloadChannel(channelId);
  }

  async voidRecord(id: string, reason: string) {
    const trimmed = reason.trim();
    if (!trimmed) {
      throw new BadRequestException('취소 이유를 입력해 주세요.');
    }
    const record = await this.recordRepository.findOneBy({ id });
    if (!record) throw new NotFoundException('지급 기록을 찾을 수 없습니다.');
    if (record.status === 'void') {
      throw new BadRequestException('이미 취소된 기록입니다.');
    }
    const wasPaid = record.status === 'paid';
    record.status = 'void';
    record.voidOrFailReason = trimmed.slice(0, 500);
    record.updatedAt = new Date();
    await this.recordRepository.save(record);
    if (wasPaid) {
      const stillPaid = await this.recordRepository.find({
        where: { channelId: record.channelId, status: 'paid' },
      });
      if (stillPaid.length === 0) {
        await this.channelRepository.update(record.channelId, {
          payoutStatus: 'pending',
          payoutSkipReason: null,
        });
      }
    }
    return record;
  }

  async confirmRecord(id: string, memo: string) {
    const tx = memo.trim();
    if (!tx) {
      throw new BadRequestException('TX 또는 메모를 입력해 주세요.');
    }
    const record = await this.recordRepository.findOneBy({ id });
    if (!record) throw new NotFoundException('지급 기록을 찾을 수 없습니다.');
    if (record.status !== 'sending') {
      throw new BadRequestException('확인이 필요한 지급만 확정할 수 있습니다.');
    }
    const channel = await this.channelRepository.findOneBy({
      id: record.channelId,
    });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');
    return this.finishExisting(channel, id, 'paid', {
      memo: tx,
      amount: record.amount,
    });
  }

  async failRecord(id: string, reason?: string) {
    const record = await this.recordRepository.findOneBy({ id });
    if (!record) throw new NotFoundException('지급 기록을 찾을 수 없습니다.');
    if (record.status !== 'sending') {
      throw new BadRequestException(
        '확인이 필요한 지급만 실패 처리할 수 있습니다.',
      );
    }
    const channel = await this.channelRepository.findOneBy({
      id: record.channelId,
    });
    if (!channel) throw new NotFoundException('채널을 찾을 수 없습니다.');
    return this.finishExisting(channel, id, 'failed', {
      memo: reason?.trim() || '실패 처리',
    });
  }

  async paidTotalsByTelegramId(): Promise<Record<string, UserPayoutTotals>> {
    const rows = await this.recordRepository.find({
      where: { status: 'paid' },
    });
    const map: Record<string, UserPayoutTotals> = {};
    for (const row of rows) {
      const key = telegramIdKey(row.telegramId);
      if (!key) continue;
      map[key] = addPaidAmount(
        map[key] ?? emptyUserPayoutTotals(),
        row.currency,
        row.amount,
      );
    }
    return map;
  }
}
