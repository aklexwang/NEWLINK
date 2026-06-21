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
  categoryEmojis: CategoryChip[];
  onRecommend: (id: string) => void;
  sectionTitle: string;
  emptyMessage: string;
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
  categoryEmojis,
  onRecommend,
  sectionTitle,
  emptyMessage,
}: ChannelListProps) {
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
        <p className="px-4 pb-8 pt-2 text-center text-sm text-tg-hint">{emptyMessage}</p>
      ) : (
        <div>
          {channels.map((channel) => {
            const meta = getCategoryMeta(categoryEmojis, channel.category);
            return (
              <ChannelCard
                key={channel.id}
                channel={channel}
                emoji={meta.emoji}
                iconUrl={meta.iconUrl}
                recommended={recommendedIds.has(channel.id)}
                onRecommend={onRecommend}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
