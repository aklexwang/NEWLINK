import { apiClient } from './client';
import type { AppUser } from '../types/user';
import { getTestProfile, isTestRegistrationMode, saveTestProfile } from '../utils/testRegistration';

const authHeaders =
  import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true'
    ? { 'X-Dev-Admin': 'true' }
    : {};

export async function getMyProfile(): Promise<AppUser> {
  const testProfile = getTestProfile();
  if (testProfile) return testProfile;

  const { data } = await apiClient.get<AppUser>('/users/me', { headers: authHeaders });
  return data;
}

export async function registerUser(tonWalletAddress: string): Promise<AppUser> {
  const wallet = tonWalletAddress.trim();
  if (!wallet) {
    throw new Error('Wallet required');
  }

  try {
    const { data } = await apiClient.post<AppUser>(
      '/users/register',
      { tonWalletAddress: wallet },
      { headers: authHeaders },
    );
    return data;
  } catch (error) {
    if (isTestRegistrationMode()) {
      return saveTestProfile(wallet);
    }
    throw error;
  }
}