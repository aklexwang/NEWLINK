import { apiClient } from './client';
import type { AppUser } from '../types/user';

const authHeaders =
  import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true'
    ? { 'X-Dev-Admin': 'true' }
    : {};

export async function getMyProfile(): Promise<AppUser> {
  const { data } = await apiClient.get<AppUser>('/users/me', { headers: authHeaders });
  return data;
}

export async function registerUser(tonWalletAddress: string): Promise<AppUser> {
  const { data } = await apiClient.post<AppUser>(
    '/users/register',
    { tonWalletAddress },
    { headers: authHeaders },
  );
  return data;
}