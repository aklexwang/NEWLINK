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
  /** 켜져 있으면 수집이 제목을 덮어쓰지 않는다 */
  titleLocked?: boolean;
  isVisible?: boolean;
  categoryLocked?: boolean;
  illegalCleared?: boolean;
  illegalClearedAt?: string | null;
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
  /** 검색어에 금지어가 있어 결과를 막았을 때 true */
  blocked?: boolean;
  message?: string;
}

export interface CreateChannelPayload {
  title: string;
  link: string;
  /** 비워 두면 서버가 링크를 검사해 판별한다 */
  linkType?: LinkType;
  category: string;
  description: string;
}