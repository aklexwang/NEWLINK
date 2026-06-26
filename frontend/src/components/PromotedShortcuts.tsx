import { useEffect, useMemo, useState } from 'react';
import type { Channel } from '../types/channel';
import { linkTypeLabel } from '../utils/linkType';
import { getChannelAvatarSources } from '../utils/channelAvatar';
import { CategoryIcon } from './CategoryIcon';

interface CategoryChip {
  id: string;
  label: string;
  emoji: string;
  iconUrl?: string | null;
}

interface PromotedShortcutsProps {
  channels: Channel[];
  categoryEmojis: CategoryChip[];
  isLoading: boolean;
  onOpen: (link: string) => void;
}

function getGridColumns(count: number): number {
  if (count <= 1) return 1;
  if (count === 2) return 2;
  if (count === 3) return 3;
  return 4;
}

function getGridMaxWidth(columns: number): string {
  if (columns === 1) return '96px';
  if (columns === 2) return '200px';
  if (columns === 3) return '288px';
  return '360px';
}

function getShortcutLabel(channel: Channel, all: Channel[]): string {
  const duplicates = all.filter(
    (item) => item.title.trim() === channel.title.trim() || item.link.trim() === channel.link.trim(),
  );
  if (duplicates.length > 1) {
    return `${channel.title} · ${linkTypeLabel(channel.linkType)}`;
  }
  return channel.title;
}

function getCategoryMeta(categoryEmojis: CategoryChip[], category: string) {
  const found = categoryEmojis.find((item) => item.id === category);
  return {
    emoji: found?.emoji ?? '📁',
    iconUrl: found?.iconUrl ?? null,
  };
}

function ShortcutItem({
  channel,
  label,
  categoryEmojis,
  onOpen,
}: {
  channel: Channel;
  label: string;
  categoryEmojis: CategoryChip[];
  onOpen: (link: string) => void;
}) {
  const meta = getCategoryMeta(categoryEmojis, channel.category);
  const avatarSources = useMemo(() => getChannelAvatarSources(channel), [channel]);
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [channel.id, avatarSources]);

  const currentSrc = avatarSources[sourceIndex];

  return (
    <button
      type="button"
      onClick={() => onOpen(channel.link)}
      className="group mx-auto flex w-[88px] flex-col items-center gap-3 active:scale-[0.97]"
    >
      <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-[#f1f3f4] transition group-hover:bg-[#e8eaed]">
        {currentSrc ? (
          <img
            src={currentSrc}
            alt=""
            referrerPolicy="no-referrer"
            onError={() => {
              if (sourceIndex + 1 < avatarSources.length) {
                setSourceIndex((index) => index + 1);
              }
            }}
            className="h-full w-full object-cover"
          />
        ) : (
          <CategoryIcon emoji={meta.emoji} iconUrl={meta.iconUrl} size="md" className="bg-transparent" />
        )}
      </div>
      <span className="block w-full truncate px-0.5 text-center text-[12px] leading-tight text-tg-text/85">
        {label}
      </span>
    </button>
  );
}

export function PromotedShortcuts({
  channels,
  categoryEmojis,
  isLoading,
  onOpen,
}: PromotedShortcutsProps) {
  const displayChannels = useMemo(() => channels.slice(0, 8), [channels]);
  const columns = getGridColumns(displayChannels.length);

  if (isLoading) {
    return (
      <div className="mt-12 w-full">
        <div className="mx-auto grid max-w-[360px] grid-cols-4 gap-x-2 gap-y-8">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="mx-auto flex w-[88px] flex-col items-center gap-3">
              <div className="h-14 w-14 animate-pulse rounded-full bg-tg-secondary" />
              <div className="h-3 w-16 animate-pulse rounded bg-tg-secondary" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (displayChannels.length === 0) {
    return (
      <p className="mt-12 text-center text-sm text-tg-hint">등록된 Promoted 채널이 없습니다.</p>
    );
  }

  return (
    <section className="mt-12 w-full">
      <div
        className="mx-auto grid justify-items-center gap-x-2 gap-y-8"
        style={{
          maxWidth: getGridMaxWidth(columns),
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {displayChannels.map((channel) => (
          <ShortcutItem
            key={channel.id}
            channel={channel}
            label={getShortcutLabel(channel, displayChannels)}
            categoryEmojis={categoryEmojis}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}
