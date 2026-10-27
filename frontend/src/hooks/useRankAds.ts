import { useEffect, useState } from 'react';
import { trackAdImpressions } from '../api/ads';
import { getRankingAds, type RankAdSlot } from '../api/ranking';

/** 지금 목록(카테고리·채널/그룹)의 1~5위 광고 자리 */
export function useRankAds(category: string, type?: 'channel' | 'group'): RankAdSlot[] {
  const [state, setState] = useState<{ key: string; ads: RankAdSlot[] }>({ key: '', ads: [] });
  const key = `${category}:${type ?? ''}`;
  useEffect(() => {
    let alive = true;
    void getRankingAds(category, type).then((ads) => {
      if (!alive) return;
      setState({ key, ads });
      if (ads.length) trackAdImpressions('rank', ads.map((ad) => ad.adId));
    });
    return () => {
      alive = false;
    };
  }, [category, type, key]);
  // 카테고리를 바꾼 직후 이전 목록의 광고가 잠깐 보이지 않게
  return state.key === key ? state.ads : [];
}
