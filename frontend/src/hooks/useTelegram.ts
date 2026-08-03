import { useEffect, useMemo } from 'react';
import WebApp from '@twa-dev/sdk';
import { toastMessage } from '../providers/ToastProvider';

function isRealTelegramEnv(): boolean {
  try {
    if (typeof window !== 'undefined') {
      const w = window as Window & {
        TelegramWebviewProxy?: unknown;
        Telegram?: { WebApp?: { initData?: string } };
      };
      if (w.TelegramWebviewProxy) return true;
      if (w.Telegram?.WebApp?.initData) return true;
      if (/Telegram/i.test(navigator.userAgent)) return true;
    }
    if (typeof WebApp?.ready !== 'function') return false;
    if (WebApp.initData) return true;
    const platform = WebApp.platform;
    return Boolean(platform && platform !== 'unknown');
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

/** 회원 알림 — window.alert 금지 (브라우저가 origin/도메인을 표시함) */
export function notifyUser(
  _webApp: typeof WebApp,
  _isLocalBrowser: boolean,
  message: string,
) {
  toastMessage(message, 'info');
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
    toastMessage('Telegram 앱에서만 결제가 가능합니다.', 'error');
    return false;
  }

  return new Promise((resolve) => {
    WebApp.openInvoice(invoiceLink, (status) => {
      resolve(status === 'paid');
    });
  });
}
