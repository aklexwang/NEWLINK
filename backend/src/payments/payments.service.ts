import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChannelsService } from '../channels/channels.service';
import {
  CreateInvoiceDto,
  PromotionInvoicePayload,
  TelegramCreateInvoiceResponse,
  TelegramInvoicePayload,
  TelegramWebhookUpdate,
} from './dto/payments.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly botToken: string;
  private readonly providerToken: string;
  private readonly promotionPrice: number;
  private readonly promotionDurationDays: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly channelsService: ChannelsService,
  ) {
    this.botToken = this.configService.getOrThrow<string>('TELEGRAM_BOT_TOKEN');
    this.providerToken = this.configService.getOrThrow<string>(
      'TELEGRAM_PAYMENT_PROVIDER_TOKEN',
    );
    this.promotionPrice = Number(
      this.configService.get('PROMOTION_PRICE_TON', '1000000000'),
    );
    this.promotionDurationDays = Number(
      this.configService.get('PROMOTION_DURATION_DAYS', '7'),
    );
  }

  async createPromotionInvoice(
    dto: CreateInvoiceDto,
    userId: number,
  ): Promise<{ invoiceLink: string }> {
    const channel = await this.channelsService.findById(dto.channelId);

    if (channel.status !== 'active') {
      throw new BadRequestException('승인된 채널만 상단 노출 결제가 가능합니다.');
    }

    const payload: PromotionInvoicePayload = {
      channelId: dto.channelId,
      userId,
      type: 'promotion',
    };

    const invoice: TelegramInvoicePayload = {
      title: '상단 노출 7일',
      description: `"${channel.title}" 채널/그룹을 7일간 상단에 노출합니다.`,
      payload: JSON.stringify(payload),
      provider_token: this.providerToken,
      currency: 'TON',
      prices: [
        {
          label: '7일 상단 노출',
          amount: this.promotionPrice,
        },
      ],
    };

    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/createInvoiceLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoice),
      },
    );

    const data = (await response.json()) as TelegramCreateInvoiceResponse;

    if (!data.ok) {
      this.logger.error('Invoice creation failed', data);
      throw new BadRequestException('결제 인보이스 생성에 실패했습니다.');
    }

    return { invoiceLink: data.result };
  }

  async handleWebhook(update: TelegramWebhookUpdate): Promise<void> {
    if (update.pre_checkout_query) {
      await this.answerPreCheckoutQuery(update.pre_checkout_query.id, true);
      return;
    }

    const payment = update.message?.successful_payment;
    if (!payment) {
      return;
    }

    let payload: PromotionInvoicePayload;
    try {
      payload = JSON.parse(payment.invoice_payload) as PromotionInvoicePayload;
    } catch {
      throw new BadRequestException('결제 payload 파싱 실패');
    }

    if (payload.type !== 'promotion') {
      return;
    }

    await this.channelsService.promote(payload.channelId, {
      durationDays: this.promotionDurationDays,
    });

    this.logger.log(
      `Promotion activated for channel ${payload.channelId} by user ${payload.userId}`,
    );
  }

  private async answerPreCheckoutQuery(
    queryId: string,
    ok: boolean,
    errorMessage?: string,
  ): Promise<void> {
    await fetch(
      `https://api.telegram.org/bot${this.botToken}/answerPreCheckoutQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_checkout_query_id: queryId,
          ok,
          error_message: errorMessage,
        }),
      },
    );
  }
}
