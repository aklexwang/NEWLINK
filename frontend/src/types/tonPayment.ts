export interface TonPaymentRecord {
  id: string;
  paidAt: string;
  amount: number;
  wallet: string;
  telegramId: number | null;
  reporterName: string | null;
  channelId: string;
  channelTitle: string;
  channelLink: string;
  memo: string | null;
}

export interface CreateTonPaymentInput {
  amount: number;
  wallet: string;
  telegramId: number | null;
  reporterName: string | null;
  channelId: string;
  channelTitle: string;
  channelLink: string;
  memo?: string | null;
}
