import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyFavorites } from '../api/channels';
import { AdultConfirmDialog, hasConfirmedAdult } from '../components/AdultConfirmDialog';
import { RankingCategoryPicker } from '../components/RankingCategoryPicker';
import { getRankingCategories } from '../api/ranking';
import type { RankingCategoryItem } from '../types/ranking';
import { ChannelList } from '../components/ChannelList';
import { useCategories } from '../hooks/useCategories';
import { useMyFavorites } from '../hooks/useMyFavorites';
import { useMyRecommendations } from '../hooks/useMyRecommendations';
import { useAuth } from '../providers/AuthProvider';
import { hapticSuccess, notifyUser, useTelegram } from '../hooks/useTelegram';
import type { Channel } from '../types/channel';

export function FavoritesPage() {
  const { webApp, isLocalBrowser } = useTelegram();
  const { user, status: authStatus } = useAuth();
  const { searchCategories } = useCategories();
  const { recommendedIds, recommend, load: loadRecommended } = useMyRecommendations();
  const { favoriteIds, load: loadFavoriteIds, removeFromFavorites } = useMyFavorites();

  const [selectedCategory, setSelectedCategory] = useState('');
  const [adultOpen, setAdultOpen] = useState(false);
  /** 즐겨찾기 전체 (카테고리는 화면에서 걸러 보여 준다) */
  const [allChannels, setAllChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  /** 카테고리 화면과 같은 아이콘·이름을 쓰기 위한 목록 */
  const [baseCategories, setBaseCategories] = useState<RankingCategoryItem[]>([]);

  useEffect(() => {
    getRankingCategories()
      .then(setBaseCategories)
      .catch(() => setBaseCategories([]));
  }, []);

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);

  const loadList = useCallback(async () => {
    if (!isLoggedIn) {
      setAllChannels([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await getMyFavorites();
      setAllChannels(items);
    } catch {
      setAllChannels([]);
      notifyUser(webApp, isLocalBrowser, '즐겨찾기를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, webApp, isLocalBrowser]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    void loadList();
    void loadFavoriteIds();
  }, [authStatus, isLoggedIn, loadList, loadFavoriteIds]);

  // 카테고리 화면과 같은 선택 상자: 숫자는 "내 즐겨찾기 수", 즐겨찾기가 있는 카테고리만 보인다
  const pickerCategories = useMemo<RankingCategoryItem[]>(() => {
    const counts = new Map<string, number>();
    for (const channel of allChannels) {
      const name = channel.category || '기타';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const base = baseCategories.filter((c) => c.id !== 'all');
    const known = new Set(base.map((c) => c.name));
    const rows: RankingCategoryItem[] = base.map((c) => ({ ...c, count: counts.get(c.name) ?? 0 }));
    for (const [name, count] of counts) {
      if (!known.has(name)) rows.push({ id: name, name, emoji: '📁', count });
    }
    const allRow = baseCategories.find((c) => c.id === 'all');
    return [
      { id: 'all', name: allRow?.name ?? '전체', emoji: allRow?.emoji ?? '🏆', iconUrl: allRow?.iconUrl, count: allChannels.length },
      ...rows,
    ];
  }, [allChannels, baseCategories]);

  const selectedName = useMemo(
    () => pickerCategories.find((c) => c.id === selectedCategory)?.name ?? selectedCategory,
    [pickerCategories, selectedCategory],
  );
  const channels = useMemo(
    () => (selectedCategory ? allChannels.filter((c) => (c.category || '기타') === selectedName) : allChannels),
    [allChannels, selectedCategory, selectedName],
  );

  const handleRecommend = async (id: string) => {
    if (recommendedIds.has(id)) {
      notifyUser(webApp, isLocalBrowser, '이미 추천한 채널/그룹입니다.');
      return;
    }
    try {
      await recommend(id);
      hapticSuccess(webApp, isLocalBrowser);
    } catch {
      notifyUser(webApp, isLocalBrowser, '이미 추천했거나 추천 처리에 실패했습니다.');
      await loadRecommended();
    }
  };

  // 즐겨찾기 화면의 [해제]는 항상 "해제" — 누르는 즉시 목록에서 빠진다
  const handleToggleFavorite = async (id: string) => {
    const removed = allChannels.find((c) => c.id === id);
    setAllChannels((prev) => prev.filter((c) => c.id !== id));
    try {
      await removeFromFavorites(id);
      hapticSuccess(webApp, isLocalBrowser);
    } catch {
      notifyUser(webApp, isLocalBrowser, '즐겨찾기 해제에 실패했습니다.');
      if (removed) setAllChannels((prev) => (prev.some((c) => c.id === id) ? prev : [removed, ...prev]));
      await loadFavoriteIds();
    }
  };

  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-[calc(100dvh-68px)] items-center justify-center">
        <p className="text-sm text-tg-hint">확인 중…</p>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex min-h-[calc(100dvh-68px)] flex-col px-4 pt-8">
        <h1 className="text-[22px] font-bold tracking-tight text-tg-text">즐겨찾기</h1>
        <p className="mt-3 text-sm leading-relaxed text-tg-hint">
          즐겨찾기는 회원 로그인 후 이용할 수 있습니다.
        </p>
        <Link
          to="/my"
          className="mt-6 inline-flex items-center justify-center rounded-2xl bg-tg-button px-4 py-3 text-sm font-semibold text-tg-button-text"
        >
          MY에서 로그인하기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-68px)] flex-col">
      <header className="bg-tg-bg px-4 pb-1 pt-5">
        <h1 className="text-[22px] font-bold tracking-tight text-tg-text">즐겨찾기</h1>
        <p className="mt-1 text-[13px] text-tg-hint">저장한 채널·그룹을 카테고리별로 모아보세요</p>
      </header>

      <RankingCategoryPicker
        categories={pickerCategories}
        selected={selectedCategory || 'all'}
        onSelect={(id) => {
          if (id === '성인' && !hasConfirmedAdult()) {
            setAdultOpen(true);
            return;
          }
          setSelectedCategory(id === 'all' ? '' : id);
        }}
      />
      <AdultConfirmDialog
        open={adultOpen}
        onCancel={() => setAdultOpen(false)}
        onConfirm={() => {
          setAdultOpen(false);
          setSelectedCategory('성인');
        }}
      />

      <ChannelList
        channels={channels}
        isLoading={loading}
        recommendedIds={recommendedIds}
        favoriteIds={favoriteIds}
        categoryEmojis={searchCategories}
        onRecommend={handleRecommend}
        onToggleFavorite={handleToggleFavorite}
        removeMode
        sectionTitle={selectedCategory ? selectedName : '전체'}
        emptyMessage={
          selectedCategory
            ? '이 카테고리에 저장한 항목이 없습니다.'
            : '아직 즐겨찾기가 없습니다. 검색 결과에서 ⭐를 눌러 추가해 보세요.'
        }
      />
    </div>
  );
}
