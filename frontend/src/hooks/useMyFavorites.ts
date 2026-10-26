import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { addFavorite, getMyFavoriteIds, removeFavorite } from '../api/channels';
import { useAuth } from '../providers/AuthProvider';

/**
 * 즐겨찾기 목록을 화면 전체가 함께 쓴다.
 * 카드마다 별 버튼이 있어도 서버에서는 한 번만 불러오고, 한 곳에서 바꾸면 모든 카드가 같이 바뀐다.
 */
let ids: Set<string> = new Set();
let loadPromise: Promise<void> | null = null;
/** 마지막으로 불러올 때 로그인 상태였는지. 로그인하면 다시 불러온다 */
let loadedAs: 'authenticated' | 'guest' | null = null;
const listeners = new Set<() => void>();

function emit(next: Set<string>) {
  ids = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return ids;
}

async function reload(): Promise<void> {
  try {
    emit(new Set(await getMyFavoriteIds()));
  } catch {
    emit(new Set());
  }
}

function ensureLoaded(as: 'authenticated' | 'guest'): Promise<void> {
  if (!loadPromise || loadedAs !== as) {
    loadedAs = as;
    loadPromise = as === 'authenticated' ? reload() : Promise.resolve(emit(new Set()));
  }
  return loadPromise;
}

async function toggle(channelId: string): Promise<void> {
  const isFav = ids.has(channelId);
  const optimistic = new Set(ids);
  if (isFav) optimistic.delete(channelId);
  else optimistic.add(channelId);
  emit(optimistic);
  try {
    if (isFav) await removeFavorite(channelId);
    else await addFavorite(channelId);
  } catch (error) {
    const rollback = new Set(ids);
    if (isFav) rollback.add(channelId);
    else rollback.delete(channelId);
    emit(rollback);
    throw error;
  }
}

export function useMyFavorites() {
  const favoriteIds = useSyncExternalStore(subscribe, snapshot, snapshot);
  const { status } = useAuth();

  useEffect(() => {
    if (status === 'loading') return;
    void ensureLoaded(status === 'authenticated' ? 'authenticated' : 'guest');
  }, [status]);

  const load = useCallback(async () => {
    loadPromise = reload();
    await loadPromise;
  }, []);

  const toggleFavorite = useCallback((channelId: string) => toggle(channelId), []);

  return { favoriteIds, load, toggleFavorite };
}
