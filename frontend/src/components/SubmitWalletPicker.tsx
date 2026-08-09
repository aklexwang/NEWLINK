import { useEffect, useRef, useState } from 'react';
import { isTrc20UsdtAddress, identifyWalletAddress } from '../utils/walletAddress';
import { useTonWalletLink } from '../hooks/useTonWalletLink';
import { WalletNetworkBadge } from './WalletNetworkBadge';

export type WalletMethod = 'telegram' | 'external';

interface SubmitWalletPickerProps {
  onLinked?: (address: string, method: WalletMethod) => void;
  onNotify?: (message: string) => void;
}

export function SubmitWalletPicker({ onLinked, onNotify }: SubmitWalletPickerProps) {
  const [method, setMethod] = useState<WalletMethod>('telegram');
  const [externalWallet, setExternalWallet] = useState('');
  const [savingExternal, setSavingExternal] = useState(false);

  const { savedAddress, isLinked, linking, connect, disconnect, persistAddress, error, connectedAddress } =
    useTonWalletLink({ autoSync: method === 'telegram' });

  const wasLinkedRef = useRef(isLinked);
  const methodRef = useRef(method);
  methodRef.current = method;

  const savedInfo = identifyWalletAddress(savedAddress);

  useEffect(() => {
    if (!wasLinkedRef.current && isLinked && savedAddress && methodRef.current === 'telegram') {
      onLinked?.(savedAddress, 'telegram');
    }
    wasLinkedRef.current = isLinked;
  }, [isLinked, savedAddress, onLinked]);

  const handleTelegramConnect = async () => {
    try {
      const address = await connect();
      if (address) onLinked?.(address, 'telegram');
    } catch {
      // shown via error
    }
  };

  const saveExternalWallet = async () => {
    const address = externalWallet.trim();
    if (!address) {
      onNotify?.('외부 지갑 주소를 입력해 주세요.');
      return false;
    }
    if (!isTrc20UsdtAddress(address)) {
      onNotify?.('USDT TRC-20(트론) 주소만 등록할 수 있습니다. (T로 시작하는 주소)');
      return false;
    }
    setSavingExternal(true);
    try {
      await disconnect();
      await persistAddress(address);
      setExternalWallet('');
      onNotify?.('USDT TRC-20 지갑이 등록되었습니다. 보상은 이 주소로만 지급됩니다.');
      onLinked?.(address, 'external');
      return true;
    } catch {
      onNotify?.('외부 지갑 등록에 실패했습니다.');
      return false;
    } finally {
      setSavingExternal(false);
    }
  };

  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-black/[0.06]">
      <h3 className="text-sm font-semibold text-slate-900">보상 받을 지갑</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        텔레그램 Wallet 또는 외부 지갑 중 <span className="font-semibold">하나만</span> 선택하세요.
      </p>

      <div className="mt-3 inline-flex w-full gap-1.5 rounded-xl bg-tg-secondary p-1">
        <button
          type="button"
          onClick={() => setMethod('telegram')}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            method === 'telegram' ? 'bg-tg-button text-tg-button-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          텔레그램 Wallet
        </button>
        <button
          type="button"
          onClick={() => setMethod('external')}
          className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
            method === 'external' ? 'bg-tg-button text-tg-button-text shadow-sm' : 'text-tg-hint'
          }`}
        >
          외부 지갑
        </button>
      </div>

      {method === 'telegram' && isLinked && savedAddress && savedInfo.kind === 'ton' && (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-100">
          <p className="text-[11px] font-medium text-emerald-800">현재 등록 주소 · 텔레그램 Wallet</p>
          <WalletNetworkBadge address={savedAddress} className="mt-1.5" showHint={false} />
          <p className="mt-1.5 break-all font-mono text-[11px] text-emerald-900">{savedAddress}</p>
        </div>
      )}

      {method === 'external' && isLinked && savedAddress && savedInfo.kind === 'trc20' && (
        <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 ring-1 ring-emerald-100">
          <p className="text-[11px] font-medium text-emerald-800">현재 등록 주소 · USDT TRC-20</p>
          <WalletNetworkBadge address={savedAddress} className="mt-1.5" showHint={false} />
          <p className="mt-1.5 break-all font-mono text-[11px] text-emerald-900">{savedAddress}</p>
        </div>
      )}

      {method === 'telegram' ? (
        <div className="mt-3 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 p-3 ring-1 ring-blue-100">
          {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
          <button
            type="button"
            onClick={() => void handleTelegramConnect()}
            disabled={linking}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {linking
              ? '등록 중…'
              : (isLinked && savedInfo.kind === 'ton') || connectedAddress
                ? '텔레그램 Wallet 변경하기'
                : '텔레그램 Wallet 연결하기'}
          </button>
        </div>
      ) : (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="text-xs leading-relaxed text-slate-600">
            외부지갑은 USDT TRC-20 등록만 가능합니다
          </p>
          <input
            value={externalWallet}
            onChange={(e) => setExternalWallet(e.target.value)}
            placeholder="T로 시작하는 USDT TRC-20 주소"
            className="mt-3 w-full rounded-xl bg-white px-4 py-3 font-mono text-sm outline-none ring-1 ring-slate-200 focus:ring-blue-300"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={() => void saveExternalWallet()}
            disabled={savingExternal || linking || !externalWallet.trim()}
            className="mt-3 w-full rounded-xl bg-slate-800 py-3 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingExternal ? '등록 중…' : '외부 USDT TRC20 지갑 등록하기'}
          </button>
        </div>
      )}
    </section>
  );
}
