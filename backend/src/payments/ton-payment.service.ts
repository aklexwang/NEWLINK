import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Channel } from '../channels/channel.entity';
import { UsersService } from '../users/users.service';
import { TonPayment } from './ton-payment.entity';

export type CreateTonPaymentInput = {
  channelId: string;
  amount: number;
  wallet: string;
  method?: 'tonconnect' | 'external';
  memo?: string | null;
  telegramId?: number | null;
  reporterName?: string | null;
  channelTitle?: string;
  channelLink?: string;
};

@Injectable()
export class TonPaymentService {
  constructor(
    @InjectRepository(TonPayment)
    private readonly tonPaymentRepository: Repository<TonPayment>,
    @InjectRepository(Channel)
    private readonly channelRepository: Repository<Channel>,
    private readonly usersService: UsersService,
  ) {}

  async list(q?: string): Promise<TonPayment[]> {
    const items = await this.tonPaymentRepository.find({
      order: { paidAt: 'DESC' },
    });
    const keyword = (q ?? '').trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      [
        item.channelTitle,
        item.channelLink,
        item.wallet,
        item.reporterName,
        item.telegramId != null ? String(item.telegramId) : '',
        item.memo,
        item.method,
      ]
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
  }

  async create(input: CreateTonPaymentInput): Promise<TonPayment> {
    const channel = await this.channelRepository.findOne({ where: { id: input.channelId } });
    if (!channel && !input.channelTitle) {
      throw new NotFoundException('Channel not found');
    }

    let reporterName = input.reporterName ?? null;
    let telegramId = input.telegramId ?? channel?.submittedBy ?? null;
    if (!reporterName && telegramId) {
      const reporter = await this.usersService.getReporterOrNull(telegramId);
      reporterName = reporter?.username
        ? `@${reporter.username}`
        : reporter?.firstName ?? null;
    }

    const row = this.tonPaymentRepository.create({
      amount: input.amount,
      wallet: input.wallet,
      telegramId,
      reporterName,
      channelId: input.channelId,
      channelTitle: input.channelTitle ?? channel?.title ?? '',
      channelLink: input.channelLink ?? channel?.link ?? '',
      memo: input.memo ?? null,
      method: input.method ?? 'external',
    });
    return this.tonPaymentRepository.save(row);
  }

  async remove(id: string): Promise<{ ok: true }> {
    const existing = await this.tonPaymentRepository.findOne({ where: { id } });
    if (!existing) throw new NotFoundException('Payment not found');
    await this.tonPaymentRepository.remove(existing);
    return { ok: true };
  }
}
