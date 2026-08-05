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
}