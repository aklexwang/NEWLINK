import type { ReactNode } from 'react';
import { resolveMediaUrl } from '../../utils/mediaUrl';

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
  return <td colSpan={colSpan} className={`${tdClass} ${className}`}>{children}</td>;
}

export function AdminTable({ children }: { children: ReactNode }) {
  return <table className="min-w-full divide-y divide-slate-100">{children}</table>;
}

export function ChannelAvatar({ channel }: { channel: { avatarUrl?: string | null; avatarApproved?: boolean; linkType?: string; title: string } }) {
  if (channel.avatarUrl && channel.avatarApproved) {
    return (
      <img
        src={resolveMediaUrl(channel.avatarUrl)}
        alt=""
        referrerPolicy="no-referrer"
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
