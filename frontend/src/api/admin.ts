import { apiClient } from './client';
import type { CategoryItem } from '../types/categoryItem';
import type { ChannelPreview, PendingChannel } from '../types/channel';
import type { Channel } from '../types/channel';
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

export async function setAdminUserAdvertiser(telegramId: number, isAdvertiser: boolean) {
  const { data } = await apiClient.patch<{ ok: boolean; telegramId: number; isAdvertiser: boolean }>(
    `/admin/users/${telegramId}/advertiser`,
    { isAdvertiser },
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
  /** 노출 조건은 통과했지만 같은 링크의 대표가 따로 있어 회원 화면에서 빠지는 수 */
  memberDuplicateExcess: number;
  /** 노출 중 성인 카테고리 안에서만 보이는 수 */
  memberAdultOnly?: number;
  /** 회원 화면 "전체" 숫자와 같은 값 (= 노출 - 중복) */
  memberListTotal: number;
  hiddenReasons: Record<string, number>;
  registered: {
    today: { auto: number; admin: number; report: number; total: number };
    last7d: { auto: number; admin: number; report: number; total: number };
  };
  /** 비공개(초대 링크) 방 수와 검사 대기 중인 초대 링크 수 */
  privateRooms?: { channel: number; group: number; queuedInvites: number };
  /** 링크 등록(어드민)으로 넣은 방과 그중 회원 화면 노출 수 */
  adminRegistered?: {
    today: { total: number; visible: number; hidden: number };
    last7d: { total: number; visible: number; hidden: number };
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
    /** 이번 수집에서 실제로 성공한 채널 수 / 실패 수 */
    succeeded?: number | null;
    failed?: number | null;
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
  categoryAi: {
    configured: boolean;
    provider: string | null;
    model: string | null;
    today: number;
    dailyMax: number;
    stopped: boolean;
    stopReason: string | null;
  };
  /** t.me 전역 게이트 (오늘 429 수는 DB 에 저장되어 재시작해도 이어짐) */
  collectGate: {
    collectLimit: number;
    collectMax: number;
    gapMs: number;
    coolingRemainingMs: number;
    lockedToday: boolean;
    today: { ymd: string; tme429: number; bot429: number };
    active: { collect: number; preview: number; inspect: number };
    totalMax: number;
    run: AdminCollectGateRun | null;
    lastRun: AdminCollectGateRun | null;
  };
  /** 수집 큐 현황 (next_collect_at 기준) */
  queue: AdminCollectQueue;
  running: boolean;
}

export type AdminCollectBand = 'hot' | 'normal' | 'quiet' | 'dormant';

export interface AdminCollectBandSummary {
  /** 이 구간의 채널 수 */
  count: number;
  /** 지금 수집 시각이 지난(밀린) 채널 수 */
  overdue: number;
  /** 지금부터 24시간 안에 수집될 것으로 예상되는 횟수 */
  expected24h: number;
}

export interface AdminCollectQueue {
  total: number;
  overdue: number;
  expected24h: number;
  bands: Record<AdminCollectBand, AdminCollectBandSummary>;
}

export interface AdminCollectGateRun {
  mode: string;
  startedAt: string;
  finishedAt: string | null;
  peakCollectInflight: number;
  tme429: number;
  bot429: number;
  cooldownMs: number;
  timeoutBackoffs: number;
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
  memberCount: number | null;
  linkType: 'channel' | 'group' | null;
  language: string | null;
  result: AdminInspectItemResult;
  resultCaption: string;
  alreadyRegistered: boolean;
  /** 키워드 분류 추천 카테고리(확신이 낮으면 분류대기) */
  suggestedCategory?: string;
  existingChannelId: string | null;
  existingStatus: string | null;
  memberPageVisible: boolean | null;
  memberPageReason: string | null;
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
  linkType?: 'channel' | 'group';
  category: string;
  description?: string;
  isPromoted?: boolean;
  /** 거절된 같은 링크 행이 있을 때, 새로 만들지 않고 그 행을 다시 활성화 */
  reactivateRejected?: boolean;
}): Promise<Channel> {
  const { data } = await apiClient.post<Channel>('/admin/channels/register', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export type AdminInspectItemResult =
  | 'ok'
  | 'already_registered'
  | 'not_korean'
  | 'language_unknown'
  | 'too_small'
  | 'not_found'
  | 'invite_or_private'
  | 'invalid_format';

export type AdminInspectJobStatus = 'queued' | 'running' | 'completed' | 'interrupted';

export interface AdminInspectItemView {
  id: string;
  lineNo: number;
  rawInput: string;
  link: string | null;
  username: string | null;
  result: AdminInspectItemResult | null;
  title: string | null;
  memberCount: number | null;
  linkType: string | null;
  language: string | null;
  registeredChannelId: string | null;
  registeredThisJob?: boolean;
  memberPageVisible?: boolean | null;
  memberPageReason?: string | null;
  resultCaption?: string;
}

export interface AdminInspectJobView {
  id: string;
  status: AdminInspectJobStatus;
  processed: number;
  total: number;
  endedReason: string | null;
  category: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  items: AdminInspectItemView[];
}

export async function startAdminLinkInspect(payload: {
  text: string;
  category?: string;
}): Promise<{ jobId: string }> {
  const { data } = await apiClient.post<{ jobId: string }>('/admin/links/inspect', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAdminLinkInspectJob(jobId: string): Promise<AdminInspectJobView> {
  const { data } = await apiClient.get<AdminInspectJobView>(`/admin/links/inspect/${jobId}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

/** 등록을 마친 확인 목록 지우기 (등록된 채널은 그대로) */
export async function clearAdminLinkInspect(jobId: string): Promise<void> {
  await apiClient.delete(`/admin/links/inspect/${jobId}`, {
    headers: getAdminAuthHeaders(),
  });
}

export async function getLatestAdminLinkInspect(): Promise<AdminInspectJobView | null> {
  const { data } = await apiClient.get<AdminInspectJobView | null>('/admin/links/inspect/latest', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function resumeAdminLinkInspect(jobId: string): Promise<{ jobId: string }> {
  const { data } = await apiClient.post<{ jobId: string }>(
    `/admin/links/inspect/${jobId}/resume`,
    {},
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function registerAdminInspectMany(payload: {
  ids: string[];
  category?: string;
}): Promise<{ results: Array<{ id: string; ok: boolean; message?: string }> }> {
  const { data } = await apiClient.post<{
    results: Array<{ id: string; ok: boolean; message?: string }>;
  }>('/admin/links/register-many', payload, {
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
    titleLocked?: boolean;
    link?: string;
    isVisible?: boolean;
    categoryLocked?: boolean;
    illegalCleared?: boolean;
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
): Promise<{ ok: boolean; updated: number; stillHidden?: Array<{ id: string; title: string; reason: string }> }> {
  const { data } = await apiClient.post<{ ok: boolean; updated: number; stillHidden?: Array<{ id: string; title: string; reason: string }> }>(
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

export async function approveChannel(id: string, isPromoted = false, category?: string) {
  const { data } = await apiClient.patch(`/admin/channels/${id}/approve`, { isPromoted, category }, {
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
    amountTon?: number;
    amount?: number;
    wallet?: string;
    method?: 'tonconnect' | 'external';
    sendMethod?: 'tonconnect' | 'external' | 'manual_gift' | 'bot_gift';
    currency?: 'TON' | 'STARS' | 'USDT';
    memo?: string;
    force?: boolean;
    phase?: 'sending' | 'paid' | 'failed';
    payoutRecordId?: string;
    methodId?: string;
  },
): Promise<Channel & { payoutRecordId?: string; payoutRecordStatus?: string }> {
  const { data } = await apiClient.post<
    Channel & { payoutRecordId?: string; payoutRecordStatus?: string }
  >(`/admin/channels/${id}/reward`, payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export type RewardSettings = {
  id: string;
  enabled: boolean;
  /** 마지막으로 활성/비활성을 바꾼 시각 */
  enabledChangedAt?: string | null;
  updatedAt: string;
};

export type RewardToggleLog = {
  id: string;
  enabled: boolean;
  changedAt: string;
  changedBy: string | null;
};

export async function getAdminRewardToggleHistory(): Promise<RewardToggleLog[]> {
  const { data } = await apiClient.get<RewardToggleLog[]>('/admin/rewards/settings/history', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export type AdminPayoutMethod = {
  id: string;
  code: string;
  label: string;
  destinationKind: 'wallet_address' | 'telegram_account';
  network: string | null;
  currency: string;
  defaultAmount: number;
  enabled: boolean;
  sort: number;
};

export async function getAdminRewardSettings(): Promise<RewardSettings> {
  const { data } = await apiClient.get<RewardSettings>('/admin/rewards/settings', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function patchAdminRewardSettings(enabled: boolean): Promise<RewardSettings> {
  const { data } = await apiClient.patch<RewardSettings>(
    '/admin/rewards/settings',
    { enabled },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function getAdminPayoutMethods(): Promise<AdminPayoutMethod[]> {
  const { data } = await apiClient.get<AdminPayoutMethod[]>('/admin/rewards/methods', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function createAdminPayoutMethod(payload: {
  code: string;
  label: string;
  destinationKind: 'wallet_address' | 'telegram_account';
  network?: string;
  currency: string;
  defaultAmount?: number;
}): Promise<AdminPayoutMethod> {
  const { data } = await apiClient.post<AdminPayoutMethod>(
    '/admin/rewards/methods',
    payload,
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function patchAdminPayoutMethod(
  id: string,
  payload: { enabled?: boolean; defaultAmount?: number; label?: string },
): Promise<AdminPayoutMethod> {
  const { data } = await apiClient.patch<AdminPayoutMethod>(
    `/admin/rewards/methods/${id}`,
    payload,
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export type AdminPayoutRecord = {
  id: string;
  channelId: string;
  channelTitle?: string | null;
  telegramId: number | null;
  username: string | null;
  methodId: string | null;
  destinationKind: string;
  currency: string;
  amount: number;
  walletAddress: string | null;
  sendMethod: 'tonconnect' | 'external' | 'manual_gift' | 'bot_gift';
  status: 'sending' | 'paid' | 'failed' | 'void';
  txOrMemo: string | null;
  voidOrFailReason: string | null;
  createdAt: string;
  paidAt: string | null;
};

export type PendingPayoutItem = PendingChannel & {
  payoutStatus?: string;
};

export async function getAdminPendingPayouts(): Promise<{
  methods: AdminPayoutMethod[];
  items: PendingPayoutItem[];
}> {
  const { data } = await apiClient.get<{
    methods: AdminPayoutMethod[];
    items: PendingPayoutItem[];
  }>('/admin/rewards/pending-payouts', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAdminPayoutRecords(params?: {
  status?: string;
  currency?: string;
  q?: string;
  from?: string;
  to?: string;
}): Promise<AdminPayoutRecord[]> {
  const { data } = await apiClient.get<AdminPayoutRecord[]>('/admin/rewards/records', {
    headers: getAdminAuthHeaders(),
    params,
  });
  return data;
}

export async function skipAdminPayout(
  channelId: string,
  payload: { reason: string; force?: boolean },
) {
  const { data } = await apiClient.post(`/admin/rewards/channels/${channelId}/skip`, payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function voidAdminPayoutRecord(id: string, reason: string) {
  const { data } = await apiClient.post(
    `/admin/rewards/records/${id}/void`,
    { reason },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function confirmAdminPayoutRecord(id: string, memo: string) {
  const { data } = await apiClient.post(
    `/admin/rewards/records/${id}/confirm`,
    { memo },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function failAdminPayoutRecord(id: string, reason?: string) {
  const { data } = await apiClient.post(
    `/admin/rewards/records/${id}/fail`,
    { reason },
    { headers: getAdminAuthHeaders() },
  );
  return data;
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

export type DiscoveryQueueFilter =
  | 'queued'
  | 'added'
  | 'not_korean'
  | 'too_small'
  | 'not_found'
  | 'invite_or_private'
  | 'already_registered'
  | 'all';

export interface DiscoveryQueueItem {
  username: string;
  result: string;
  resultLabel: string;
  source: string | null;
  sourceLabel: string;
  checkedAt: string;
  mentionCount: number;
  title: string | null;
  memberCount: number | null;
}

export interface DiscoveryQueueResponse {
  page: number;
  pageSize: number;
  total: number;
  items: DiscoveryQueueItem[];
}

export interface DiscoveryUsage {
  snowball: { today: number; dailyMax: number };
  keywordSearch: { today: number; dailyMax: number };
  resolve: { today: number; dailyMax: number };
  queuedInspect: { today: number; dailyMax: number };
}

export interface DiscoveryKeywordRow {
  id: string;
  word: string;
  category: string | null;
  enabled: boolean;
  sort: number;
  createdAt: string;
  lastSearchedAt: string | null;
  lastFoundCount: number | null;
  totalNewCount: number;
}

export async function getDiscoveryQueue(params: {
  filter?: DiscoveryQueueFilter;
  source?: string;
  page?: number;
}): Promise<DiscoveryQueueResponse> {
  const { data } = await apiClient.get<DiscoveryQueueResponse>('/admin/discovery/queue', {
    headers: getAdminAuthHeaders(),
    params,
  });
  return data;
}

export async function getDiscoveryUsage(): Promise<DiscoveryUsage> {
  const { data } = await apiClient.get<DiscoveryUsage>('/admin/discovery/usage', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function registerDiscoveryUsernames(payload: {
  usernames: string[];
  category?: string;
}) {
  const { data } = await apiClient.post<{
    results: Array<{ username: string; ok: boolean; message?: string }>;
  }>('/admin/discovery/register', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function discardDiscoveryUsernames(usernames: string[]) {
  const { data } = await apiClient.post<{ count: number }>(
    '/admin/discovery/discard',
    { usernames },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function getDiscoveryKeywords(sort?: string): Promise<DiscoveryKeywordRow[]> {
  const { data } = await apiClient.get<DiscoveryKeywordRow[]>('/admin/discovery/keywords', {
    headers: getAdminAuthHeaders(),
    params: sort ? { sort } : undefined,
  });
  return data;
}

export async function createDiscoveryKeyword(payload: { word: string; category?: string }) {
  const { data } = await apiClient.post<DiscoveryKeywordRow>('/admin/discovery/keywords', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function updateDiscoveryKeyword(
  id: string,
  payload: { enabled?: boolean; sort?: number; word?: string; category?: string },
) {
  const { data } = await apiClient.patch<DiscoveryKeywordRow>(
    `/admin/discovery/keywords/${id}`,
    payload,
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function deleteDiscoveryKeyword(id: string) {
  const { data } = await apiClient.delete<{ ok: boolean }>(`/admin/discovery/keywords/${id}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function reorderDiscoveryKeywords(ids: string[]) {
  const { data } = await apiClient.post<DiscoveryKeywordRow[]>(
    '/admin/discovery/keywords/reorder',
    { ids },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

// ── 검색 금지어 · 검색 인사이트 · 텔레그램 이동 수 ─────────────────

export type SearchTermKind = 'block' | 'allow';

export interface SearchTermRow {
  id: string;
  kind: SearchTermKind;
  term: string;
  termNormalized: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  /** 예외어가 효과 없을 때 서버가 주는 안내 */
  warning?: string;
}

export type AnalyticsRange = 'today' | '7d' | '30d';

export interface SearchInsightRow {
  query: string;
  sample: string;
  searchCount: number;
  zeroCount: number;
  blockedCount: number;
}

export interface SearchInsights {
  range: AnalyticsRange;
  from: string;
  to: string;
  totals: { searchCount: number; zeroCount: number; blockedCount: number };
  popular: SearchInsightRow[];
  zero: SearchInsightRow[];
  blocked: SearchInsightRow[];
}

export interface OpenRankingRow {
  channelId: string;
  title: string;
  link: string;
  category: string;
  opens: number;
}

export interface OpenRanking {
  range: AnalyticsRange;
  from: string;
  to: string;
  items: OpenRankingRow[];
}

export interface ChannelOpenSummary {
  channelId: string;
  today: number;
  last7d: number;
  last30d: number;
  daily: Array<{ date: string; count: number }>;
}

export async function getSearchTerms(): Promise<SearchTermRow[]> {
  const { data } = await apiClient.get<{ items: SearchTermRow[] }>('/admin/search/terms', {
    headers: getAdminAuthHeaders(),
  });
  return data.items;
}

export async function createSearchTerm(payload: { kind: SearchTermKind; term: string }) {
  const { data } = await apiClient.post<SearchTermRow>('/admin/search/terms', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function updateSearchTerm(id: string, payload: { enabled?: boolean; term?: string }) {
  const { data } = await apiClient.patch<SearchTermRow>(`/admin/search/terms/${id}`, payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function deleteSearchTerm(id: string) {
  const { data } = await apiClient.delete<{ ok: boolean }>(`/admin/search/terms/${id}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getSearchInsights(range: AnalyticsRange): Promise<SearchInsights> {
  const { data } = await apiClient.get<SearchInsights>('/admin/search/insights', {
    headers: getAdminAuthHeaders(),
    params: { range },
  });
  return data;
}

export async function getOpenRanking(range: AnalyticsRange, limit = 50): Promise<OpenRanking> {
  const { data } = await apiClient.get<OpenRanking>('/admin/opens/ranking', {
    headers: getAdminAuthHeaders(),
    params: { range, limit },
  });
  return data;
}

export async function getChannelOpenSummary(channelId: string): Promise<ChannelOpenSummary> {
  const { data } = await apiClient.get<ChannelOpenSummary>(`/admin/opens/channel/${channelId}`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}
export type QuickPreview = {
  description: string;
  posts: Array<{ postedAt: string; views: number | null; mediaType: string; text: string | null }>;
  note: string | null;
};

/** 카테고리 판단용: 소개글 + 최근 공개 글 (서버에 저장하지 않음) */
export async function getChannelQuickPreview(id: string): Promise<QuickPreview> {
  const { data } = await apiClient.get<QuickPreview>(`/admin/channels/${id}/quick-preview`, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export type ServerLevel = 'ok' | 'warn' | 'danger';
export interface ServerStatus {
  checkedAt: string;
  db: {
    usedMb: number;
    limitMb: number;
    percent: number;
    level: ServerLevel;
    growthMbPerDay: number | null;
    daysUntilFull: number | null;
    tables: Array<{ name: string; mb: number; rows: number }>;
    history: Array<{ d: string; mb: number }>;
  };
  memory: { usedMb: number; heapMb: number; limitMb: number; percent: number; level: ServerLevel };
  server: { startedAt: string; uptimeHours: number; node: string; load1m: number };
  plan: { web: string; db: string };
}

export async function getServerStatus(): Promise<ServerStatus> {
  const { data } = await apiClient.get<ServerStatus>('/admin/server-status', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export interface FeedFilterSettings {
  excludeCategories: string[];
  adWords: string[];
  minHits: number;
}

export async function getFeedFilter(): Promise<FeedFilterSettings> {
  const { data } = await apiClient.get<FeedFilterSettings>('/admin/feed-filter', { headers: getAdminAuthHeaders() });
  return data;
}

export async function saveFeedFilter(input: FeedFilterSettings): Promise<FeedFilterSettings> {
  const { data } = await apiClient.put<FeedFilterSettings>('/admin/feed-filter', input, { headers: getAdminAuthHeaders() });
  return data;
}

export interface AdminRegisterRun {
  id: string;
  jobId: string;
  total: number;
  done: number;
  ok: number;
  fail: number;
  running: boolean;
  startedAt: string;
  finishedAt: string | null;
}

/** 서버에서 혼자 끝까지 등록 시작 (화면을 떠나도 계속) */
export async function startAdminRegister(payload: { jobId: string; ids: string[]; category?: string }): Promise<AdminRegisterRun> {
  const { data } = await apiClient.post<AdminRegisterRun>('/admin/links/register-start', payload, {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function getAdminRegisterStatus(): Promise<AdminRegisterRun | null> {
  const { data } = await apiClient.get<AdminRegisterRun | null>('/admin/links/register-status', {
    headers: getAdminAuthHeaders(),
  });
  return data || null;
}

/** 등록이 끝나면 어드민 어디서든 알려 주려고 지켜볼 등록 번호 */
export const REGISTER_WATCH_KEY = 'nl-register-watch';
