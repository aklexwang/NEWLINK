import { useCallback, useEffect, useRef, useState } from 'react';
import { useTonAddress, useTonConnectUI, useTonWallet } from '@tonconnect/ui-react';
import { registerUser } from '../api/users';
import { useAuth } from '../providers/AuthProvider';

interface UseTonWalletLinkOptions {
  /** When false, connected wallet is not auto-saved to profile. */
  autoSync?: boolean;
}

/**
 * Connect Telegram/TON Wallet via TonConnect and persist address to our user profile.
 */
export function useTonWalletLink(options: UseTonWalletLinkOptions = {}) {
  const autoSync = options.autoSync !== false;
  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonWallet();
  const address = useTonAddress();
  const { user, status: authStatus, refreshAuth } = useAuth();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedRef = useRef<string | null>(user?.tonWalletAddress ?? null);

  const savedAddress = user?.tonWalletAddress ?? null;
  const isLinked = Boolean(savedAddress);
  const connectedAddress = address || null;
  const canPersist = authStatus === 'authenticated' && Boolean(user);

  const persistAddress = useCallback(
    async (walletAddress: string) => {
      if (!walletAddress || !canPersist) return walletAddress;
      if (lastSavedRef.current === walletAddress) return walletAddress;
      setLinking(true);
      setError(null);
      try {
        await registerUser(walletAddress);
        lastSavedRef.current = walletAddress;
        await refreshAuth();
        return walletAddress;
      } catch (err) {
        setError(err instanceof Error ? err.message : '지갑 등록에 실패했습니다.');
        throw err;
      } finally {
        setLinking(false);
      }
    },
    [canPersist, refreshAuth],
  );

  useEffect(() => {
    lastSavedRef.current = savedAddress;
  }, [savedAddress]);

  useEffect(() => {
    if (!autoSync || !canPersist || !connectedAddress) return;
    if (savedAddress === connectedAddress) return;
    void persistAddress(connectedAddress).catch(() => undefined);
  }, [autoSync, canPersist, connectedAddress, savedAddress, persistAddress]);

  const connect = useCallback(async () => {
    setError(null);
    try {
      if (tonConnectUI.connected && connectedAddress) {
        return await persistAddress(connectedAddress);
      }
      await tonConnectUI.openModal();
      return null;
    } catch (err) {
      setError(err instanceof Error ? err.message : '지갑 연결에 실패했습니다.');
      throw err;
    }
  }, [tonConnectUI, connectedAddress, persistAddress]);

  const disconnect = useCallback(async () => {
    try {
      await tonConnectUI.disconnect();
    } catch {
      // ignore
    }
  }, [tonConnectUI]);

  return {
    wallet,
    connectedAddress,
    savedAddress,
    isLinked,
    linking,
    error,
    connect,
    disconnect,
    persistAddress,
    tonConnectUI,
  };
}
