import type { AdClient, Channel } from '../../types/channel';

export function resolveAdClient(channel: Channel): AdClient {
  if (channel.adClient) return channel.adClient;
  return {
    telegramId: channel.promotionClientTelegramId ?? channel.submittedBy ?? null,
    name: channel.promotionClientName ?? null,
    username: null,
    tonWalletAddress: null,
    tonAmount: channel.promotionTonAmount ?? null,
  };
}

export function adClientDisplayName(client: AdClient): string {
  return client.name ?? (client.username ? `@${client.username}` : '광고 의뢰자');
}

interface AdClientCellsProps {
  channel: Channel;
}

export function AdClientCells({ channel }: AdClientCellsProps) {
  const client = resolveAdClient(channel);
  if (!client.telegramId && client.tonAmount == null) {
    return <span className="text-xs text-slate-400">-</span>;
  }

  return (
    <div className="space-y-0.5 text-xs leading-tight">
      <p className="truncate font-medium text-slate-800">{adClientDisplayName(client)}</p>
      <p className="text-slate-500">TG {client.telegramId ?? '-'}</p>
      <p className="font-semibold text-purple-700">{client.tonAmount != null ? `${client.tonAmount} TON` : '-'}</p>
    </div>
  );
}

interface AdClientDetailProps {
  channel: Channel;
}

export function AdClientDetail({ channel }: AdClientDetailProps) {
  const client = resolveAdClient(channel);
  if (!client.telegramId && client.tonAmount == null) return null;

  return (
    <div className="grid gap-2 rounded-lg bg-purple-50/50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="text-slate-500">의뢰자</p>
        <p className="font-medium text-slate-900">{adClientDisplayName(client)}</p>
      </div>
      <div>
        <p className="text-slate-500">Telegram ID</p>
        <p className="font-medium text-slate-900">{client.telegramId ?? '-'}</p>
      </div>
      <div>
        <p className="text-slate-500">입금 TON</p>
        <p className="font-semibold text-purple-700">{client.tonAmount != null ? `${client.tonAmount} TON` : '-'}</p>
      </div>
      {client.tonWalletAddress && (
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="text-slate-500">지갑</p>
          <p className="break-all font-mono text-[11px] text-slate-700">{client.tonWalletAddress}</p>
        </div>
      )}
    </div>
  );
}
