import type { RankAdSlot } from '../api/ranking';
import type { RankingChannel } from '../types/ranking';

export type RankRow = {
  channel: RankingChannel;
  /** 광고 자리면 null (순위 대신 AD 표시) */
  rank: number | null;
  adId?: string;
};

/**
 * 순위 목록에 광고 자리(1~5위)를 끼워 넣는다.
 * 광고 방은 원래 순위 자리에서는 빼서 두 번 나오지 않게 하고,
 * 나머지 방의 순위 숫자는 원래 순위를 그대로 쓴다.
 */
export function mergeRankAds(organic: RankingChannel[], ads: RankAdSlot[]): RankRow[] {
  if (ads.length === 0) return organic.map((channel, i) => ({ channel, rank: i + 1 }));
  const adIds = new Set(ads.map((ad) => ad.channel.id));
  const bySlot = new Map(ads.map((ad) => [ad.slot, ad]));
  const rest = organic
    .map((channel, i) => ({ channel, rank: i + 1 }))
    .filter((row) => !adIds.has(row.channel.id));
  const rows: RankRow[] = [];
  let next = 0;
  for (let position = 1; position <= 5; position += 1) {
    const ad = bySlot.get(position);
    if (ad) rows.push({ channel: ad.channel, rank: null, adId: ad.adId });
    else if (next < rest.length) rows.push(rest[next++]);
  }
  return rows.concat(rest.slice(next));
}
