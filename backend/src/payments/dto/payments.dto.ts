import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID()
  @IsNotEmpty()
  channelId: string;
}

export interface TelegramInvoicePayload {
  title: string;
  description: string;
  payload: string;
  provider_token: string;
  currency: string;
  prices: Array<{ label: string; amount: number }>;
}

export interface TelegramCreateInvoiceResponse {
  ok: boolean;
  result: string;
}

export interface TelegramSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

export interface TelegramPreCheckoutQuery {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface TelegramWebhookUpdate {
  update_id: number;
  pre_checkout_query?: TelegramPreCheckoutQuery;
  message?: {
    successful_payment?: TelegramSuccessfulPayment;
    from?: { id: number };
  };
}

export interface PromotionInvoicePayload {
  channelId: string;
  userId: number;
  type: 'promotion';
}
