export interface AppUser {
  telegramId: number;
  firstName: string | null;
  username: string | null;
  tonWalletAddress: string | null;
  isRegistered: boolean;
  isBlocked?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminUser extends AppUser {
  submissionCount: number;
  isBlocked: boolean;
  /** 광고회원(광고문의로 텔레그램 광고를 하는 회원) */
  isAdvertiser?: boolean;
  walletKind?: string | null;
  payoutCount?: number;
  payoutTon?: number;
  payoutUsdt?: number;
  payoutStars?: number;
}