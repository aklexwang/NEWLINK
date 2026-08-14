import { isAxiosError } from 'axios';
import { apiClient } from './client';
import type { Channel, CreateChannelPayload, SearchResult } from '../types/channel';
import { getMemberAuthHeaders } from '../utils/memberAuth';
export async function searchChannels(params: {
  q?: string;
  category?: string;
  page?: number;
  limit?: number;
}): Promise<SearchResult> {
  const { data } = await apiClient.get<SearchResult>('/channels/search', { params });
  return data;
}

export async function getPromotedChannels(): Promise<Channel[]> {
  try {
    const { data } = await apiClient.get<Channel[]>('/channels/promoted');
    return data;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      const { data } = await apiClient.get<SearchResult>('/channels/search', { params: { limit: 100 } });
      return data.items.filter((channel) => channel.isPromoted);
    }
    throw error;
  }
}
export async function getMyRecommendedIds(): Promise<string[]> {
  const { data } = await apiClient.get<string[]>('/channels/my-recommendations', {
    headers: getMemberAuthHeaders(),
  });
  return data;
}

export async function getMySubmissions(): Promise<Channel[]> {
  const { data } = await apiClient.get<Channel[]>('/channels/my-submissions', {
    headers: getMemberAuthHeaders(),
  });
  return data;
}

export async function submitChannel(payload: CreateChannelPayload) {
  const { data } = await apiClient.post('/channels', payload, { headers: getMemberAuthHeaders() });
  return data;
}

export async function recommendChannel(id: string) {
  const { data } = await apiClient.post(`/channels/${id}/recommend`, {}, { headers: getMemberAuthHeaders() });
  return data;
}

export async function getMyFavorites(category?: string): Promise<Channel[]> {
  const { data } = await apiClient.get<Channel[]>('/channels/my-favorites', {
    params: category ? { category } : undefined,
    headers: getMemberAuthHeaders(),
  });
  return data;
}

export async function getMyFavoriteIds(): Promise<string[]> {
  const { data } = await apiClient.get<string[]>('/channels/my-favorite-ids', {
    headers: getMemberAuthHeaders(),
  });
  return data;
}

export async function addFavorite(id: string) {
  const { data } = await apiClient.post(`/channels/${id}/favorite`, {}, { headers: getMemberAuthHeaders() });
  return data;
}

export async function removeFavorite(id: string) {
  const { data } = await apiClient.delete(`/channels/${id}/favorite`, { headers: getMemberAuthHeaders() });
  return data;
}

export async function createPromotionInvoice(channelId: string) {
  const { data } = await apiClient.post<{ invoiceLink: string }>('/payments/invoice', { channelId }, { headers: getMemberAuthHeaders() });
  return data;
}