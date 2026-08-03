import { useCallback, useEffect, useRef, useState } from 'react';
import { addFavorite, getMyFavoriteIds, removeFavorite } from '../api/channels';

export function useMyFavorites() {
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const idsRef = useRef(favoriteIds);
  idsRef.current = favoriteIds;

  const load = useCallback(async () => {
    try {
      const ids = await getMyFavoriteIds();
      setFavoriteIds(new Set(ids));
    } catch {
      setFavoriteIds(new Set());
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFavorite = useCallback(async (channelId: string) => {
    const isFav = idsRef.current.has(channelId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(channelId);
      else next.add(channelId);
      return next;
    });

    try {
      if (isFav) await removeFavorite(channelId);
      else await addFavorite(channelId);
    } catch (error) {
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(channelId);
        else next.delete(channelId);
        return next;
      });
      throw error;
    }
  }, []);

  return { favoriteIds, load, toggleFavorite };
}
