import { apiClient } from './client';
import type { CategoryItem } from '../types/categoryItem';
import type { ChannelPreview, PendingChannel } from '../types/channel';
import type { Channel } from '../types/channel';
import type { TonPaymentRecord } from '../types/tonPayment';
import type { AdminUser } from '../types/user';
import { getAdminAuthHeaders } from '../utils/adminAccess';


export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data } = await apiClient.get<AdminUser[]>('/admin/users', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function deleteAdminUser(telegramId: number) {
  const { data } = await apiClient.delete<{ ok: boolean; telegramId: number }>(
    `/admin/users/${telegramId}`,
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function setAdminUserBlocked(telegramId: number, isBlocked: boolean) {
  const { data } = await apiClient.patch<{ ok: boolean; telegramId: number; isBlocked: boolean }>(
    `/admin/users/${telegramId}/block`,
    { isBlocked },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function importChannelAvatarFromTelegram(id: string): Promise<{
  avatarUrl: string | null;
  avatarApproved: boolean;
}> {
  const { data } = await apiClient.post<{ avatarUrl: string | null; avatarApproved: boolean }>(
    `/admin/channels/${id}/import-avatar`,
    {},
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function getChannelPreview(id: string): Promise<ChannelPreview> {
  const { data } = await apiClient.get<ChannelPreview>(`/admin/channels/${id}/preview`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}
export async function getPendingChannels(): Promise<PendingChannel[]> {
  const { data } = await apiClient.get<PendingChannel[]>('/admin/channels/pending', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getPendingChannelCount(): Promise<number> {
  const { data } = await apiClient.get<{ count: number }>('/admin/channels/pending-count', {
    headers: getAdminAuthHeaders(),
  });
  return data.count;
}

export interface AdminChannelListResponse {
  items: PendingChannel[];
  total: number;
  page: number;
  pageSize: number;
  categoryCounts?: Record<string, number>;
}

export interface AdminDashboard {
  channelCount: number;
  groupCount: number;
  memberVisible: number;
  memberHidden: number;
  hiddenReasons: Record<string, number>;
  registered: {
    today: { auto: number; admin: number; report: number; total: number };
    last7d: { auto: number; admin: number; report: number; total: number };
  };
  pendingCount: number;
  collectStatus: Record<string, number>;
  language: { ko: number; foreign: number; unknown: number };
  categories: Array<{ name: string; count: number }>;
  lastCollectRun: {
    mode: string;
    startedAt: string;
    finishedAt: string | null;
    processed: number;
    total: number;
    remaining?: number;
    status: string;
  } | null;
}

export async function getAdminDashboard(): Promise<AdminDashboard> {
  const { data } = await apiClient.get<AdminDashboard>('/admin/dashboard', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export type AdminStatsRunKind = 'running' | 'completed' | 'budget' | 'interrupted';

export interface AdminStatsRun {
  id: string;
  mode: string;
  kind: AdminStatsRunKind;
  status: AdminStatsRunKind;
  processed: number;
  total: number;
  remaining: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  durationLabel: string;
  endedReason: string | null;
  budgetNote: string | null;
}

export interface AdminStatsOps {
  mtproto: {
    enabled: boolean;
    requestsToday: number;
    resolvesToday: number;
    resolveDailyLimit: number;
    searchesToday: number;
    searchDailyLimit: number;
    lastError: string | null;
    countersFromMemory: boolean;
    floodWait: {
      startedAt: string | null;
      until: string | null;
      seconds: number | null;
    };
  };
  budgets: {
    lightMin: number;
    fullMin: number;
    discoveryMin: number;
    verifyRecheckMin: number;
  };
  discovery: { today: number; dailyMax: number };
  running: boolean;
}

export async function getAdminStatsRuns(limit = 30): Promise<AdminStatsRun[]> {
  const { data } = await apiClient.get<AdminStatsRun[]>('/admin/stats/runs', {
    params: { limit },
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAdminStatsOps(): Promise<AdminStatsOps> {
  const { data } = await apiClient.get<AdminStatsOps>('/admin/stats/ops', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function startAdminLightCollect(): Promise<{
  started: boolean;
  runId: string | null;
  mode: string;
}> {
  const { data } = await apiClient.post(
    '/admin/stats/run',
    {},
    {
      params: { mode: 'light' },
      headers: getAdminAuthHeaders(),
    },
  );
  return data;
}

export async function getAdminChannels(params?: {
  status?: string;
  q?: string;
  category?: string;
  linkType?: 'channel' | 'group';
  collectStatus?: string;
  visibility?: 'visible' | 'hidden';
  autoRegistered?: string;
  language?: string;
  source?: string;
  memberPage?: string;
  hideReason?: string;
  createdFrom?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
  promoted?: string;
}): Promise<AdminChannelListResponse> {
  const { data } = await apiClient.get<AdminChannelListResponse>('/admin/channels/all', {
    headers: getAdminAuthHeaders(),
    params,
  });
  return data;
}

export async function getAdminPromotedChannelsPaged(q?: string): Promise<Channel[]> {
  const pageSize = 200;
  const items: Channel[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;
  while (items.length < total) {
    const result = await getAdminChannels({
      promoted: '1',
      q: q || undefined,
      sort: 'promo_order',
      page,
      pageSize,
    });
    total = result.total;
    items.push(...result.items);
    if (result.items.length < pageSize) break;
    page += 1;
  }
  return items;
}

export interface AdminChannelLookup {
  link: string;
  title: string;
  description: string;
  avatarUrl: string | null;
  memberCount: string | null;
  alreadyRegistered: boolean;
  existingChannelId: string | null;
  existingStatus: string | null;
}

export async function lookupAdminChannel(link: string): Promise<AdminChannelLookup> {
  const { data } = await apiClient.get<AdminChannelLookup>('/admin/channels/lookup', {
    headers: getAdminAuthHeaders(),
    params: { link },
  });
  return data;
}

export async function registerAdminChannel(payload: {
  title: string;
  link: string;
  linkType: 'channel' | 'group';
  category: string;
  description?: string;
  isPromoted?: boolean;
}): Promise<Channel> {
  const { data } = await apiClient.post<Channel>('/admin/channels/register', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getPromotedChannels(q?: string): Promise<Channel[]> {
  const { data } = await apiClient.get<Channel[]>('/admin/promotions', {
    headers: getAdminAuthHeaders(),
    params: q ? { q } : undefined,
  });
  return data;
}

export async function updatePromotionOrder(ids: string[]): Promise<void> {
  await apiClient.patch('/admin/promotions/order', { ids }, { headers: getAdminAuthHeaders() });
}

export async function updateAdminChannel(
  id: string,
  payload: Partial<{
    title: string;
    category: string;
    linkType: 'channel' | 'group';
    status: string;
    isPromoted: boolean;
    promotedUntil: string | null;
    promotionClientTelegramId?: number | null;
    promotionClientName?: string | null;
    promotionTonAmount?: number | null;
    avatarUrl?: string | null;
    avatarApproved?: boolean;
    language?: 'ko' | 'foreign' | 'unknown';
    languageLocked?: boolean;
    link?: string;
    isVisible?: boolean;
    categoryLocked?: boolean;
  }>,
) {
  const { data } = await apiClient.patch(`/admin/channels/${id}`, payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function setAdminChannelsVisibility(
  ids: string[],
  isVisible: boolean,
): Promise<{ ok: boolean; updated: number }> {
  const { data } = await apiClient.post<{ ok: boolean; updated: number }>(
    '/admin/channels/visibility',
    { ids, isVisible },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function setAdminChannelsCategory(
  ids: string[],
  category: string,
): Promise<{ ok: boolean; updated: number }> {
  const { data } = await apiClient.post<{ ok: boolean; updated: number }>(
    '/admin/channels/category',
    { ids, category },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function collectAdminChannel(id: string): Promise<PendingChannel> {
  const { data } = await apiClient.post<PendingChannel>(
    `/admin/channels/${id}/collect`,
    {},
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function collectAdminChannels(
  ids: string[],
): Promise<{ results: Array<{ id: string; ok: boolean; message?: string }> }> {
  const { data } = await apiClient.post<{
    results: Array<{ id: string; ok: boolean; message?: string }>;
  }>('/admin/channels/collect', { ids }, { headers: getAdminAuthHeaders() });
  return data;
}

export async function deleteAdminChannel(id: string) {
  const { data } = await apiClient.delete(`/admin/channels/${id}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function approveChannel(id: string, isPromoted = false) {
  const { data } = await apiClient.patch(`/admin/channels/${id}/approve`, { isPromoted }, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function rejectChannel(id: string) {
  const { data } = await apiClient.patch(`/admin/channels/${id}/reject`, {}, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function rejectInvalidChannels(ids: string[]): Promise<{ rejected: number }> {
  const { data } = await apiClient.post<{ rejected: number }>(
    '/admin/channels/reject-invalid',
    { ids },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function recordReporterReward(
  id: string,
  payload: {
    amountTon: number;
    wallet?: string;
    method?: 'tonconnect' | 'external';
    memo?: string;
  },
): Promise<Channel> {
  const { data } = await apiClient.post<Channel>(`/admin/channels/${id}/reward`, payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getTonPaymentHistory(q?: string): Promise<TonPaymentRecord[]> {
  const { data } = await apiClient.get<TonPaymentRecord[]>('/admin/ton-payments', {
    headers: getAdminAuthHeaders(),
    params: q ? { q } : undefined,
  });
  return data;
}

export async function deleteTonPaymentRecord(id: string): Promise<void> {
  await apiClient.delete(`/admin/ton-payments/${id}`, {
    headers: getAdminAuthHeaders(),
  });
}

export async function promoteChannel(id: string, promotedUntil?: string) {
  const body = promotedUntil ? { promotedUntil } : { durationDays: 7 };
  const { data } = await apiClient.patch(`/admin/channels/${id}/promote`, body, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAdminCategories(): Promise<CategoryItem[]> {
  const { data } = await apiClient.get<CategoryItem[]>('/admin/categories', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function createCategory(payload: {
  name: string;
  emoji?: string;
  iconUrl?: string | null;
  sortOrder?: number;
}) {
  const { data } = await apiClient.post<CategoryItem>('/admin/categories', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

async function postFormData<T>(url: string, formData: FormData): Promise<T> {
  const { data } = await apiClient.post<T>(url, formData, {
    headers: getAdminAuthHeaders(),
    transformRequest: (payload, headers) => {
      if (payload instanceof FormData) {
        delete headers['Content-Type'];
      }
      return payload;
    },
  });
  return data;
}

export async function uploadCategoryIcon(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('icon', file);
  const data = await postFormData<{ iconUrl: string }>('/admin/categories/upload-icon', formData);
  return data.iconUrl;
}

export async function uploadChannelAvatar(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('icon', file);
  const data = await postFormData<{ avatarUrl: string }>('/admin/channels/upload-avatar', formData);
  return data.avatarUrl;
}

export async function updateCategory(
  id: string,
  payload: Partial<{ name: string; emoji: string; iconUrl: string | null; sortOrder: number; isActive: boolean }>,
) {
  const { data } = await apiClient.patch<CategoryItem>(`/admin/categories/${id}`, payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function deleteCategory(id: string) {
  const { data } = await apiClient.delete(`/admin/categories/${id}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export interface AutoManageStatus {
  sources: string[];
  tgstatConfigured: boolean;
  googleConfigured?: boolean;
  serperConfigured?: boolean;
  searchConfigured?: boolean;
  searchProvider?: 'serper' | 'google' | null;
  aiConfigured?: boolean;
  label: string;
  hint: string;
}

export interface ImportCandidate {
  id: string;
  link: string;
  title: string;
  category: string;
  categoryAiSuggested?: string | null;
  categoryConfidence?: number | null;
  categoryReviewed?: boolean;
  categorySource?: string;
  linkType: 'channel' | 'group';
  participantsCount: number;
  avatarUrl: string | null;
  source: string;
  discoverySources?: string[];
  status: 'pending' | 'published' | 'skipped';
  publishedChannelId: string | null;
  fetchedAt: string;
  publishedAt: string | null;
  alreadyOnMemberPage: boolean;
}

export interface AutoManageCategory {
  id: string;
  name: string;
  emoji: string;
  count: number;
}

export type GoogleSearchPreset =
  | 'site'
  | 'groups'
  | 'intitle'
  | 'invite'
  | 'directory'
  | 'custom';

export async function getAutoManageStatus(): Promise<AutoManageStatus> {
  const { data } = await apiClient.get<AutoManageStatus>('/admin/auto-manage/status', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAutoManageCategories(): Promise<AutoManageCategory[]> {
  const { data } = await apiClient.get<AutoManageCategory[]>('/admin/auto-manage/categories', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function syncAutoManageCandidates(category?: string) {
  const { data } = await apiClient.post<{
    created: number;
    updated: number;
    total: number;
    skippedNonKorean?: number;
    cleanedNonKorean?: number;
    categoriesSynced?: string[];
  }>(
    '/admin/auto-manage/sync',
    {},
    {
      headers: getAdminAuthHeaders(),
      params: category ? { category } : undefined,
      timeout: 300000,
    },
  );
  return data;
}

export async function searchGoogleAutoManageCandidates(body: {
  topic?: string;
  preset: GoogleSearchPreset;
  customQuery?: string;
  category?: string;
  pages?: number;
  strictTopic?: boolean;
}) {
  const { data } = await apiClient.post<{
    query: string;
    created: number;
    updated: number;
    skippedExisting: number;
    total: number;
    rawResultCount: number;
    filteredOut?: number;
    inviteCount: number;
    publicCount: number;
    aiClassified?: number;
    aiConfigured?: boolean;
  }>('/admin/auto-manage/google-search', body, {
    headers: getAdminAuthHeaders(),
    timeout: 180000,
  });
  return data;
}

export async function classifyAutoManageCandidates(ids: string[]) {
  const { data } = await apiClient.post<{
    updated: number;
    total: number;
    aiConfigured: boolean;
  }>(
    '/admin/auto-manage/classify',
    { ids },
    { headers: getAdminAuthHeaders(), timeout: 300000 },
  );
  return data;
}

export async function classifyPendingAutoManageCandidates() {
  const { data } = await apiClient.post<{
    updated: number;
    total: number;
    aiConfigured: boolean;
  }>('/admin/auto-manage/classify-pending', {}, {
    headers: getAdminAuthHeaders(),
    timeout: 300000,
  });
  return data;
}

export async function updateAutoManageCandidate(
  id: string,
  payload: {
    category?: string;
    categoryReviewed?: boolean;
    linkType?: 'channel' | 'group';
    title?: string;
  },
) {
  const { data } = await apiClient.patch<ImportCandidate>(
    `/admin/auto-manage/candidates/${id}`,
    payload,
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function getAutoManageCandidates(params?: {
  status?: string;
  category?: string;
  source?: string;
}): Promise<ImportCandidate[]> {
  const { data } = await apiClient.get<ImportCandidate[]>('/admin/auto-manage/candidates', {
    headers: getAdminAuthHeaders(),
    params,
  });
  return data;
}

export async function publishAutoManageCandidates(ids: string[]) {
  const { data } = await apiClient.post<{ id: string; ok: boolean; message?: string }[]>(
    '/admin/auto-manage/publish',
    { ids },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function skipAutoManageCandidates(ids: string[]) {
  const { data } = await apiClient.post<{ ok: boolean; count: number }>(
    '/admin/auto-manage/skip',
    { ids },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}