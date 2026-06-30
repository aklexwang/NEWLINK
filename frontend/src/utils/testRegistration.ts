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

export function createLocalDemoUser(): AppUser {
  const telegramId = 900_000_000 + Math.floor(Math.random() * 99_999_999);
  const profile: AppUser = {
    telegramId,
    firstName: `회원${String(telegramId).slice(-4)}`,
    username: null,
    tonWalletAddress: null,
    isRegistered: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function saveTestProfile(wallet: string): AppUser {
  const existing = getTestProfile();
  const telegramId = existing?.telegramId ?? 900_000_000 + Math.floor(Math.random() * 99_999_999);
  const profile: AppUser = {
    telegramId,
    firstName: existing?.firstName ?? `회원${String(telegramId).slice(-4)}`,
    username: existing?.username ?? null,
    tonWalletAddress: wallet.trim(),
    isRegistered: true,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  return profile;
}

export function clearTestProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}
