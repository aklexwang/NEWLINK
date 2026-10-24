export type LinkType = 'channel' | 'group';

export interface AdClient {
  telegramId: number | null;
  name: string | null;
  username: string | null;
  tonWalletAddress: string | null;
  tonAmount: number | null;
}

export interface Channel {
  id: string;
  title: string;
  link: string;
  linkType: LinkType;
  category: string;
  description: string;
  recommendCount: number;
  status: 'pending' | 'active' | 'rejected';
  isPromoted: boolean;
  promotedUntil: string | null;
  promotionClientTelegramId?: number | null;
  promotionClientName?: string | null;
  promotionTonAmount?: number | null;
  promotionSortOrder?: number;
  adClient?: AdClient;
  submittedBy?: number | null;
  avatarUrl?: string | null;
  avatarApproved?: boolean;
  isVerified?: boolean;
  score?: number | null;
  viewRate?: number | null;
  createdAt: string;
  /** Reporter reward paid in TON */
  rewardTonAmount?: number | null;
  /** USD value at the time of payment */
  rewardUsdAmount?: number | null;
  rewardTonUsdRate?: number | null;
  rewardPaidAt?: string | null;
  rewardWallet?: string | null;
  rewardStarsAmount?: number | null;
  username?: string | null;
  language?: 'ko' | 'foreign' | 'unknown';
  languageLocked?: boolean;
  isVisible?: boolean;
  categoryLocked?: boolean;
  categoryConfidence?: number | null;
  payoutStatus?: 'not_eligible' | 'pending' | 'paid' | 'skipped';
  payoutSkipReason?: string | null;
  autoRegistered?: boolean;
  collectStatus?:
    | 'ok'
    | 'failed'
    | 'gone'
    | 'private'
    | 'invalid'
    | 'invite_only'
    | 'invite_expired'
    | 'merged'
    | null;
  collectError?: string | null;
  lastCollectedAt?: string | null;
  firstObservedAt?: string | null;
  collectTier?: 'daily' | 'weekly' | null;
  memberCount?: number | null;
  memberPageVisible?: boolean;
  memberPageHiddenReason?: string;
  memberPageReasonKey?: string;
}

export interface ChannelPreview {
  id: string;
  title: string;
  description: string;
  avatarUrl: string | null;
  memberCount: string | null;
  link: string;
  avatarApproved: boolean;
}

export interface PendingChannel extends Channel {
  reporter: {
    telegramId: number;
    username: string | null;
    firstName: string | null;
    tonWalletAddress: string | null;
    walletKind?: string | null;
    isRegistered: boolean;
  } | null;
}

export interface SearchResult {
  items: Channel[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateChannelPayload {
  title: string;
  link: string;
  linkType: LinkType;
  category: string;
  description: string;
}