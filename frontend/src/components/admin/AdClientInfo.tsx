import type { AdClient, Channel } from '../../types/channel';
import { WalletNetworkBadge } from '../WalletNetworkBadge';

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
  return (
    client.name ??
    (client.username ? `@${client.username}` : '의뢰자 정보 없음')
  );
}

interface AdClientCellsProps {
  channel: Channel;
}

export function AdClientCells({ channel }: AdClientCellsProps) {
  const client = resolveAdClient(channel);
  if (!client.telegramId && !client.name && client.tonAmount == null) {
    return <span className="text-xs text-muted-foreground">의뢰자 정보 없음</span>;
  }

  return (
    <div className="space-y-0.5 text-xs leading-tight">
      <p className="truncate font-medium text-foreground">{adClientDisplayName(client)}</p>
      <p className="text-muted-foreground">TG {client.telegramId ?? '-'}</p>
      <p className="font-semibold text-purple-700">{client.tonAmount != null ? `${client.tonAmount} TON` : '-'}</p>
    </div>
  );
}

interface AdClientDetailProps {
  channel: Channel;
}

export function AdClientDetail({ channel }: AdClientDetailProps) {
  const client = resolveAdClient(channel);
  if (!client.telegramId && !client.name && client.tonAmount == null) {
    return (
      <p className="text-xs text-muted-foreground">의뢰자 정보 없음</p>
    );
  }

  return (
    <div className="grid gap-2 rounded-lg bg-purple-50/50 p-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
      <div>
        <p className="text-muted-foreground">의뢰자</p>
        <p className="font-medium text-foreground">{adClientDisplayName(client)}</p>
      </div>
      <div>
        <p className="text-muted-foreground">Telegram ID</p>
        <p className="font-medium text-foreground">{client.telegramId ?? '-'}</p>
      </div>
      <div>
        <p className="text-muted-foreground">입금 TON</p>
        <p className="font-semibold text-purple-700">{client.tonAmount != null ? `${client.tonAmount} TON` : '-'}</p>
      </div>
      {client.tonWalletAddress && (
        <div className="sm:col-span-2 lg:col-span-1">
          <p className="text-muted-foreground">지갑</p>
          <WalletNetworkBadge address={client.tonWalletAddress} className="mt-1" />
          <p className="mt-1 break-all font-mono text-[11px] text-subtle">{client.tonWalletAddress}</p>
        </div>
      )}
    </div>
  );
}
