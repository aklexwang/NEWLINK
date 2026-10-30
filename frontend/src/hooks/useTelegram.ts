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
      // Mini App WebView만 진짜 텔레그램 환경으로 본다.
      // UA에 Telegram이 있어도(인앱 브라우저) initData가 없으면 웹 로그인 위젯을 써야 한다.
      if (w.TelegramWebviewProxy) return true;
      if (w.Telegram?.WebApp?.initData) return true;
    }
    if (typeof WebApp?.ready !== 'function') return false;
    return Boolean(WebApp.initData);
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

/** 텔레그램 앱 안(미니앱 웹뷰)인지 — initData 가 비어 있어도(키보드 버튼으로 연 경우 등) platform 으로 판단 */
function insideTelegramApp(webApp: typeof WebApp): boolean {
  try {
    const w = window as Window & {
      TelegramWebviewProxy?: unknown;
      Telegram?: { WebApp?: { platform?: string } };
    };
    if (w.TelegramWebviewProxy) return true;
    const platform = w.Telegram?.WebApp?.platform ?? webApp.platform;
    return Boolean(platform && platform !== 'unknown');
  } catch {
    return false;
  }
}

export function openTelegramChannel(webApp: typeof WebApp, isLocalBrowser: boolean, link: string) {
  const raw = link.startsWith('http') ? link : `https://${link}`;
  // telegram.me → t.me (텔레그램 열기 함수는 t.me 만 받는다)
  const url = raw.replace(/^https?:\/\/(www\.)?telegram\.me\//i, 'https://t.me/');

  if (isLocalBrowser && !insideTelegramApp(webApp)) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  // 텔레그램 안: 공식 스크립트의 함수 → SDK 함수 → 같은 창 이동 순서로 시도
  try {
    const tg = (window as Window & {
      Telegram?: { WebApp?: { openTelegramLink?: (u: string) => void } };
    }).Telegram?.WebApp;
    if (tg && typeof tg.openTelegramLink === 'function') {
      tg.openTelegramLink(url);
      return;
    }
  } catch {
    // 다음 방법
  }
  try {
    if (typeof webApp.openTelegramLink === 'function') {
      webApp.openTelegramLink(url);
      return;
    }
  } catch {
    // 다음 방법
  }
  // 텔레그램 웹뷰는 t.me 주소로 이동하면 앱이 가로채서 방을 연다
  window.location.href = url;
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
