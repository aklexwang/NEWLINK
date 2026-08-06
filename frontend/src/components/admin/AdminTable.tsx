import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { getChannelAvatarSources } from '../../utils/channelAvatar';

export function AdminTableShell({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/5">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function AdminEmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm ring-1 ring-black/5">
      {message}
    </div>
  );
}

export function AdminMessage({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-xl bg-white px-4 py-3 text-sm text-slate-800 shadow-sm ring-1 ring-black/5">
      {message}
    </div>
  );
}

const thClass = 'px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500';
const tdClass = 'px-3 py-3 align-middle text-sm text-slate-700';

export function AdminTh({ children, className = '' }: { children?: ReactNode; className?: string }) {
  return <th className={`${thClass} ${className}`}>{children}</th>;
}

export function AdminTd({ children, className = '', colSpan }: { children: ReactNode; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={`${tdClass} ${className}`}>
      {children}
    </td>
  );
}

export function AdminTable({ children }: { children: ReactNode }) {
  return <table className="min-w-full divide-y divide-slate-100">{children}</table>;
}

export function ChannelAvatar({
  channel,
}: {
  channel: {
    avatarUrl?: string | null;
    avatarApproved?: boolean;
    linkType?: string;
    title: string;
    link?: string;
  };
}) {
  const avatarSources = useMemo(() => {
    if (!channel.avatarApproved) return [];
    if (channel.link) {
      return getChannelAvatarSources({ avatarUrl: channel.avatarUrl, link: channel.link });
    }
    if (channel.avatarUrl && !channel.avatarUrl.startsWith('/api/uploads/')) {
      return getChannelAvatarSources({ avatarUrl: channel.avatarUrl, link: '' });
    }
    return [];
  }, [channel.avatarApproved, channel.avatarUrl, channel.link]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setFailed(false);
  }, [channel.avatarUrl, channel.link, avatarSources]);

  const currentSrc = avatarSources[sourceIndex];

  if (currentSrc && !failed) {
    return (
      <img
        src={currentSrc}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => {
          if (sourceIndex + 1 < avatarSources.length) {
            setSourceIndex((index) => index + 1);
          } else {
            setFailed(true);
          }
        }}
        className="h-9 w-9 rounded-full object-cover ring-1 ring-black/5"
      />
    );
  }

  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm">
      {channel.linkType === 'group' ? '👥' : '📢'}
    </div>
  );
}
