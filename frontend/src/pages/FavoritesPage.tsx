import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyFavorites } from '../api/channels';
import { CategorySelect } from '../components/CategorySelect';
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
  const { favoriteIds, load: loadFavoriteIds, toggleFavorite } = useMyFavorites();

  const [selectedCategory, setSelectedCategory] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  const isLoggedIn = authStatus === 'authenticated' && Boolean(user);

  const loadList = useCallback(async () => {
    if (!isLoggedIn) {
      setChannels([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const items = await getMyFavorites(selectedCategory || undefined);
      setChannels(items);
    } catch {
      setChannels([]);
      notifyUser(webApp, isLocalBrowser, '즐겨찾기를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [isLoggedIn, selectedCategory, webApp, isLocalBrowser]);

  useEffect(() => {
    if (authStatus === 'loading') return;
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }
    void loadList();
    void loadFavoriteIds();
  }, [authStatus, isLoggedIn, loadList, loadFavoriteIds]);

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

  const handleToggleFavorite = async (id: string) => {
    const wasFavorite = favoriteIds.has(id);
    try {
      await toggleFavorite(id);
      if (wasFavorite) {
        setChannels((prev) => prev.filter((c) => c.id !== id));
      }
      hapticSuccess(webApp, isLocalBrowser);
    } catch {
      notifyUser(webApp, isLocalBrowser, '즐겨찾기 변경에 실패했습니다.');
      await loadFavoriteIds();
      await loadList();
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

      <CategorySelect
        categories={searchCategories}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
      />

      <ChannelList
        channels={channels}
        isLoading={loading}
        recommendedIds={recommendedIds}
        favoriteIds={favoriteIds}
        categoryEmojis={searchCategories}
        onRecommend={handleRecommend}
        onToggleFavorite={handleToggleFavorite}
        sectionTitle={selectedCategory ? selectedCategory : '전체'}
        emptyMessage={
          selectedCategory
            ? '이 카테고리에 저장한 항목이 없습니다.'
            : '아직 즐겨찾기가 없습니다. 검색 결과에서 ⭐를 눌러 추가해 보세요.'
        }
      />
    </div>
  );
}
