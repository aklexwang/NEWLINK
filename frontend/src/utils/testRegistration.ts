import WebApp from '@twa-dev/sdk';
import type { AppUser } from '../types/user';

const STORAGE_KEY = 'newlink_test_user';

export function isTestRegistrationMode(): boolean {
  try {
    return !WebApp?.initData;
  } catch {
    return true;
  }
}

export function getTestProfile(): AppUser | null {
  if (!isTestRegistrationMode()) return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AppUser;
  } catch {
    return null;
  }
}

export function saveTestProfile(wallet: string): AppUser {
  const profile: AppUser = {
    telegramId: 999000001,
    firstName: '로컬 사용자',
    username: null,
    tonWalletAddress: wallet.trim(),
    isRegistered: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  return profile;
}
