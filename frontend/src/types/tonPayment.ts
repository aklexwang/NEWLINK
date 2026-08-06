export type TonPaymentMethod = 'tonconnect' | 'external';

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
  /** tonconnect: 앱 Wallet 송금 / external: 외부 지갑 송금 후 수동 기록 */
  method?: TonPaymentMethod;
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
  method?: TonPaymentMethod;
}
