import { identifyWalletAddress } from '../utils/walletAddress';

interface WalletNetworkBadgeProps {
  address: string | null | undefined;
  className?: string;
  showHint?: boolean;
}

/** Shows which coin/network a wallet address belongs to. */
export function WalletNetworkBadge({ address, className = '', showHint = true }: WalletNetworkBadgeProps) {
  const info = identifyWalletAddress(address);
  const tone =
    info.kind === 'ton'
      ? 'bg-sky-100 text-sky-800 ring-sky-200'
      : info.kind === 'trc20'
        ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
        : info.valid
          ? 'bg-slate-100 text-slate-700 ring-slate-200'
          : 'bg-amber-100 text-amber-900 ring-amber-200';

  return (
    <div className={className}>
      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${tone}`}>
        {info.badge}
      </span>
      <span className="ml-1.5 text-[11px] font-medium text-slate-700">{info.label}</span>
      {showHint && <p className="mt-1 text-[10px] leading-snug text-slate-500">{info.hint}</p>}
    </div>
  );
}
