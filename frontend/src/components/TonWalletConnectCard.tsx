import { useEffect, useRef } from 'react';
import { shortenTonAddress } from '../utils/tonAmount';
import { useTonWalletLink } from '../hooks/useTonWalletLink';

interface TonWalletConnectCardProps {
  title?: string;
  description?: string;
  onLinked?: (address: string) => void;
  className?: string;
}

export function TonWalletConnectCard({
  title = '텔레그램 Wallet 연결',
  description = '버튼을 누르면 텔레그램 Wallet과 바로 연결됩니다.',
  onLinked,
  className = '',
}: TonWalletConnectCardProps) {
  const { savedAddress, isLinked, linking, connect, error, connectedAddress } = useTonWalletLink();
  const wasLinkedRef = useRef(isLinked);

  useEffect(() => {
    if (!wasLinkedRef.current && isLinked && savedAddress) {
      onLinked?.(savedAddress);
    }
    wasLinkedRef.current = isLinked;
  }, [isLinked, savedAddress, onLinked]);

  const handleConnect = async () => {
    try {
      await connect();
    } catch {
      // error state is shown below
    }
  };

  if (isLinked && savedAddress) {
    return (
      <section className={`rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 p-4 ring-1 ring-emerald-100 ${className}`}>
        <h3 className="text-sm font-semibold text-slate-900">Wallet 연결됨</h3>
        <p className="mt-1 break-all font-mono text-xs text-slate-600">{savedAddress}</p>
        <p className="mt-2 text-xs text-emerald-700">보상 지급 시 이 주소로 전송됩니다.</p>
        <button
          type="button"
          onClick={() => void handleConnect()}
          disabled={linking}
          className="mt-3 w-full rounded-xl bg-white py-2.5 text-sm font-medium text-blue-700 ring-1 ring-blue-100 disabled:opacity-50"
        >
          텔레그램 Wallet 다시 연결
        </button>
      </section>
    );
  }

  return (
    <section className={`rounded-2xl bg-gradient-to-br from-blue-50 to-sky-50 p-4 ring-1 ring-blue-100 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">{description}</p>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => void handleConnect()}
        disabled={linking}
        className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {linking
          ? '등록 중…'
          : connectedAddress
            ? `연결 확정 (${shortenTonAddress(connectedAddress)})`
            : '텔레그램 Wallet 연결하기'}
      </button>
    </section>
  );
}
