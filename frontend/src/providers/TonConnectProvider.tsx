import type { ReactNode } from 'react';
import { TonConnectUIProvider } from '@tonconnect/ui-react';

const BOT_USERNAME =
  (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, '') ||
  'newlinkcom_bot';

/** Always use production HTTPS manifest — Mini App origin quirks can break relative URLs. */
const MANIFEST_URL = 'https://global-spay.com/tonconnect-manifest.json';

interface TonConnectProviderProps {
  children: ReactNode;
}

export function TonConnectProvider({ children }: TonConnectProviderProps) {
  return (
    <TonConnectUIProvider
      manifestUrl={MANIFEST_URL}
      actionsConfiguration={{
        twaReturnUrl: `https://t.me/${BOT_USERNAME}`,
      }}
    >
      {children}
    </TonConnectUIProvider>
  );
}
