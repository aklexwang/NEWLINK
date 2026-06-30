import { apiClient } from './client';
import type { AppUser } from '../types/user';

export interface TelegramAuthResponse {
  accessToken: string;
  isNewUser: boolean;
  user: AppUser;
}

export async function loginWithTelegram(initData: string): Promise<TelegramAuthResponse> {
  const { data } = await apiClient.post<TelegramAuthResponse>('/auth/telegram', { initData });
  return data;
}
