import type { RankAdScope } from './rank-ad.entity';

export const RANK_AD_SLOTS = [1, 2, 3, 4, 5] as const;

export function parseRankAdSlot(raw: unknown): number | null {
  const n = Math.trunc(Number(raw));
  return n >= 1 && n <= 5 ? n : null;
}

export function parseRankAdScope(raw: unknown): RankAdScope | null {
  return raw === 'global' || raw === 'category' ? raw : null;
}

type Range = { startsAt: Date | null; endsAt: Date | null };

/** 두 기간이 겹치는지 (비어 있으면 처음부터/끝없이) */
export function rangesOverlap(a: Range, b: Range): boolean {
  const aStart = a.startsAt?.getTime() ?? -Infinity;
  const aEnd = a.endsAt?.getTime() ?? Infinity;
  const bStart = b.startsAt?.getTime() ?? -Infinity;
  const bEnd = b.endsAt?.getTime() ?? Infinity;
  return aStart < bEnd && bStart < aEnd;
}

export type SlotAd = {
  id: string;
  channelId: string;
  scope: RankAdScope;
  slot: number;
};

/**
 * 목록 1~5위 자리 배치.
 * - 전체 광고(global)가 먼저 제 자리를 차지한다.
 * - 카테고리 광고는 제 자리가 비어 있으면 그 자리, 아니면 그 뒤 빈 자리(5위까지).
 * - 같은 방이 둘 다 있으면 전체 광고 하나만.
 * 결과: 자리 번호 → 광고
 */
export function composeAdSlots(
  globalAds: SlotAd[],
  categoryAds: SlotAd[],
): Map<number, SlotAd> {
  const placed = new Map<number, SlotAd>();
  const usedChannels = new Set<string>();
  const sorted = (list: SlotAd[]) => [...list].sort((a, b) => a.slot - b.slot);
  for (const ad of sorted(globalAds)) {
    if (placed.has(ad.slot) || usedChannels.has(ad.channelId)) continue;
    placed.set(ad.slot, ad);
    usedChannels.add(ad.channelId);
  }
  for (const ad of sorted(categoryAds)) {
    if (usedChannels.has(ad.channelId)) continue;
    let slot = ad.slot;
    while (slot <= 5 && placed.has(slot)) slot += 1;
    if (slot > 5) continue;
    placed.set(slot, ad);
    usedChannels.add(ad.channelId);
  }
  return placed;
}
