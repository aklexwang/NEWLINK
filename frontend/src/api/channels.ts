import { apiClient } from './client';
import type { Channel, CreateChannelPayload, SearchResult } from '../types/channel';

const authHeaders =
  import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN === 'true'
    ? { 'X-Dev-Admin': 'true' }
    : {};

export async function searchChannels(params: {
  q?: string;
  category?: string;
  page?: number;
}): Promise<SearchResult> {
  const { data } = await apiClient.get<SearchResult>('/channels/search', { params });
  return data;
}

export async function getMyRecommendedIds(): Promise<string[]> {
  const { data } = await apiClient.get<string[]>('/channels/my-recommendations', {
    headers: authHeaders,
  });
  return data;
}

export async function getMySubmissions(): Promise<Channel[]> {
  const { data } = await apiClient.get<Channel[]>('/channels/my-submissions', {
    headers: authHeaders,
  });
  return data;
}

export async function submitChannel(payload: CreateChannelPayload) {
  const { data } = await apiClient.post('/channels', payload, { headers: authHeaders });
  return data;
}

export async function recommendChannel(id: string) {
  const { data } = await apiClient.post(`/channels/${id}/recommend`, {}, { headers: authHeaders });
  return data;
}

export async function createPromotionInvoice(channelId: string) {
  const { data } = await apiClient.post<{ invoiceLink: string }>('/payments/invoice', { channelId }, { headers: authHeaders });
  return data;
}