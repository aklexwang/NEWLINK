import { useCallback, useEffect, useState } from 'react';
import { getMyRecommendedIds, recommendChannel } from '../api/channels';

export function useMyRecommendations() {
  const [recommendedIds, setRecommendedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const ids = await getMyRecommendedIds();
      setRecommendedIds(new Set(ids));
    } catch {
      setRecommendedIds(new Set());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const recommend = useCallback(async (channelId: string) => {
    await recommendChannel(channelId);
    setRecommendedIds((prev) => new Set(prev).add(channelId));
  }, []);

  return { recommendedIds, load, recommend };
}