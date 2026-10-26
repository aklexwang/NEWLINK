import { apiClient } from './client';
import { getAdminAuthHeaders } from '../utils/adminAccess';

export type ReclassifyTransition = { from: string; to: string; count: number };

export type ReclassifyStatus = {
  batchId: string | null;
  running: boolean;
  total: number;
  processed: number;
  changed: number;
  aiCalls: number;
  startedAt: string | null;
  finishedAt: string | null;
  stopReason: string | null;
  targets: number;
  done: number;
  counts: Record<string, number>;
  transitions: ReclassifyTransition[];
};

export type ReclassifyItem = {
  id: string;
  channelId: string;
  before: string;
  after: string;
  confidence: number | null;
  source: string;
  reason: string | null;
  status: 'pending' | 'applied' | 'skipped' | 'same';
  title: string;
  username: string | null;
  memberCount: number | null;
};

export async function getReclassifyStatus(): Promise<ReclassifyStatus> {
  const { data } = await apiClient.get<ReclassifyStatus>('/admin/reclassify/status', {
    headers: getAdminAuthHeaders(),
  });
  return data;
}

export async function startReclassify(
  resume: boolean,
): Promise<{ started: boolean; batchId: string | null; reason?: string }> {
  const { data } = await apiClient.post(
    '/admin/reclassify/start',
    { resume },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}

export async function stopReclassify(): Promise<void> {
  await apiClient.post('/admin/reclassify/stop', {}, { headers: getAdminAuthHeaders() });
}

export async function getReclassifyItems(params: {
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
}): Promise<{ total: number; items: ReclassifyItem[] }> {
  const { data } = await apiClient.get('/admin/reclassify/items', {
    headers: getAdminAuthHeaders(),
    params,
  });
  return data;
}

export async function applyReclassify(
  excludeIds: string[],
): Promise<{ applied: number; skipped: number }> {
  const { data } = await apiClient.post(
    '/admin/reclassify/apply',
    { excludeIds },
    { headers: getAdminAuthHeaders() },
  );
  return data;
}
