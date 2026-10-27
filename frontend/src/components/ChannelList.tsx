import { useEffect, useMemo, useState } from 'react';
import { getChannelSummaries, type ChannelSummary } from '../api/stats';
import type { Channel } from '../types/channel';
import { ChannelCard } from './ChannelCard';
import { SectionHeader } from './SectionHeader';

interface CategoryChip {
  id: string;
  label: string;
  emoji: string;
  iconUrl?: string | null;
}

interface ChannelListProps {
  channels: Channel[];
  isLoading: boolean;
  recommendedIds: Set<string>;
  favoriteIds?: Set<string>;
  categoryEmojis: CategoryChip[];
  onRecommend: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
  sectionTitle: string;
  emptyMessage: string;
  /** 금지어 검색이면 빨간 카드로 안내 */
  emptyBlocked?: boolean;
  /** 즐겨찾기 목록이면 별 대신 [해제] */
  removeMode?: boolean;
}

function getCategoryMeta(categoryEmojis: CategoryChip[], category: string) {
  const found = categoryEmojis.find((c) => c.id === category);
  return {
    emoji: found?.emoji ?? '📁',
    iconUrl: found?.iconUrl ?? null,
  };
}

export function ChannelList({
  channels,
  isLoading,
  recommendedIds,
  favoriteIds,
  categoryEmojis,
  onRecommend,
  onToggleFavorite,
  sectionTitle,
  emptyMessage,
  emptyBlocked = false,
  removeMode = false,
}: ChannelListProps) {
  // 카드마다 순위·추이·글 수를 보여 주려고 목록 전체 요약을 한 번에 불러온다
  const idsKey = useMemo(() => channels.map((c) => c.id).slice(0, 30).join(','), [channels]);
  const [summaries, setSummaries] = useState<Map<string, ChannelSummary>>(new Map());
  useEffect(() => {
    if (!idsKey) return;
    let cancelled = false;
    getChannelSummaries(idsKey.split(','))
      .then((items) => {
        if (cancelled) return;
        setSummaries((prev) => {
          const next = new Map(prev);
          for (const item of items) next.set(item.id, item);
          return next;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  if (isLoading) {
    return (
      <div className="px-4 py-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="h-12 w-12 animate-pulse rounded-[14px] bg-tg-secondary" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-tg-secondary" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-tg-secondary" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="pb-4">
      <SectionHeader title={sectionTitle} showChevron={false} />
      {channels.length === 0 ? (
        emptyBlocked ? (
          <div className="px-4 pb-8 pt-2">
            <div className="flex items-center gap-3 rounded-[20px] bg-nl-card px-5 py-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ring-1 ring-red-500/30">
              <span className="text-2xl" aria-hidden>
                🚫
              </span>
              <p className="text-[15px] font-bold text-red-500">{emptyMessage}</p>
            </div>
          </div>
        ) : (
          <p className="px-4 pb-8 pt-2 text-center text-sm text-tg-hint">{emptyMessage}</p>
        )
      ) : (
        <div className="space-y-3 px-4">
          {channels.map((channel) => {
            const meta = getCategoryMeta(categoryEmojis, channel.category);
            return (
              <ChannelCard
                key={channel.id}
                channel={channel}
                summary={summaries.get(channel.id)}
                emoji={meta.emoji}
                iconUrl={meta.iconUrl}
                recommended={recommendedIds.has(channel.id)}
                favorited={favoriteIds?.has(channel.id) ?? false}
                onRecommend={onRecommend}
                onToggleFavorite={onToggleFavorite}
                showFavorite={Boolean(onToggleFavorite)}
                removeMode={removeMode}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
