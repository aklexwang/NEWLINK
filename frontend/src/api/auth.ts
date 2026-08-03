import { apiClient } from './client';
import type { AppUser } from '../types/user';

export interface TelegramAuthResponse {
  accessToken: string;
  isNewUser: boolean;
  user: AppUser;
}

export interface TelegramLoginWidgetPayload {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export async function loginWithTelegram(initData: string): Promise<TelegramAuthResponse> {
  const { data } = await apiClient.post<TelegramAuthResponse>('/auth/telegram', { initData });
  return data;
}

export async function loginWithTelegramWidget(
  payload: TelegramLoginWidgetPayload,
): Promise<TelegramAuthResponse> {
  const { data } = await apiClient.post<TelegramAuthResponse>('/auth/telegram-login', payload);
  return data;
}

export async function fetchAuthMe(): Promise<AppUser | null> {
  const { data } = await apiClient.get<{ user: AppUser | null }>('/auth/me');
  return data.user;
}
