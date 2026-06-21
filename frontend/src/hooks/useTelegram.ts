import { useEffect, useMemo } from 'react';
import WebApp from '@twa-dev/sdk';
import { setInitDataHeader } from '../api/client';

function isRealTelegramEnv(): boolean {
  try {
    return Boolean(WebApp?.initData) && typeof WebApp?.ready === 'function';
  } catch {
    return false;
  }
}

export function useTelegram() {
  const initData = WebApp.initData ?? '';
  const user = WebApp.initDataUnsafe?.user;
  const isLocalBrowser = !isRealTelegramEnv();

  useEffect(() => {
    if (isLocalBrowser) return;

    try {
      WebApp.ready();
      WebApp.expand?.();
      WebApp.setHeaderColor?.('secondary_bg_color');
      WebApp.setBackgroundColor?.('bg_color');

      if (initData) {
        setInitDataHeader(initData);
      }
    } catch (error) {
      console.warn('[useTelegram] init skipped:', error);
    }
  }, [initData, isLocalBrowser]);

  return useMemo(
    () => ({
      initData,
      user,
      webApp: WebApp,
      colorScheme: WebApp.colorScheme,
      isExpanded: WebApp.isExpanded,
      isLocalBrowser,
    }),
    [initData, user, isLocalBrowser],
  );
}

export function notifyUser(webApp: typeof WebApp, isLocalBrowser: boolean, message: string) {
  if (isLocalBrowser) {
    window.alert(message);
    return;
  }

  try {
    if (typeof webApp.showAlert === 'function') {
      webApp.showAlert(message);
      return;
    }
  } catch {
    // fall through
  }

  window.alert(message);
}

export function hapticSuccess(webApp: typeof WebApp, isLocalBrowser: boolean) {
  if (isLocalBrowser) return;

  try {
    webApp.HapticFeedback?.notificationOccurred?.('success');
  } catch {
    // ignore
  }
}

export function openTelegramChannel(webApp: typeof WebApp, isLocalBrowser: boolean, link: string) {
  const url = link.startsWith('http') ? link : `https://${link}`;

  if (isLocalBrowser) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    if (typeof webApp.openTelegramLink === 'function') {
      webApp.openTelegramLink(url);
      return;
    }
  } catch {
    // fall through
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function openTonInvoice(invoiceLink: string): Promise<boolean> {
  if (!isRealTelegramEnv()) {
    window.alert('Telegram 앱에서만 결제가 가능합니다.');
    return false;
  }

  return new Promise((resolve) => {
    WebApp.openInvoice(invoiceLink, (status) => {
      resolve(status === 'paid');
    });
  });
}