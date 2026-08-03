import type { ReactNode } from 'react';
import { TonConnectUIProvider } from '@tonconnect/ui-react';
import { getSiteOrigin } from '../config/site';

const BOT_USERNAME =
  (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, '') ||
  'newlinkcom_bot';

interface TonConnectProviderProps {
  children: ReactNode;
}

export function TonConnectProvider({ children }: TonConnectProviderProps) {
  const origin = getSiteOrigin() || 'https://global-spay.com';
  const manifestUrl = `${origin}/tonconnect-manifest.json`;

  return (
    <TonConnectUIProvider
      manifestUrl={manifestUrl}
      actionsConfiguration={{
        twaReturnUrl: `https://t.me/${BOT_USERNAME}`,
      }}
    >
      {children}
    </TonConnectUIProvider>
  );
}
