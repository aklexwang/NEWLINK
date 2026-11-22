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

// 방 링크 이동은 로그인한 회원만 (AuthProvider 가 로그인 상태를 알려 준다)
let roomLinkAllowed = false;
export function setRoomLinkAllowed(allowed: boolean) {
  roomLinkAllowed = allowed;
}

// 마지막으로 누른 위치 (안내 말풍선을 그 자리에 띄우려고)
let lastTap: { x: number; y: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    (e) => {
      lastTap = { x: e.clientX, y: e.clientY };
    },
    { capture: true, passive: true },
  );
}

/** 누른 자리 바로 위에 텔레그램 파란 말풍선으로 로그인 안내 */
function showLoginBubble() {
  if (typeof document === 'undefined') return;
  document.getElementById('nl-login-bubble')?.remove();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tap = lastTap ?? { x: vw / 2, y: vh / 2 };
  const el = document.createElement('div');
  el.id = 'nl-login-bubble';
  el.setAttribute('role', 'alert');
  el.textContent = '🔒 로그인 후 이용 가능합니다';
  Object.assign(el.style, {
    position: 'fixed',
    zIndex: '9999',
    left: '0px',
    top: '0px',
    padding: '12px 18px',
    borderRadius: '16px',
    background: '#2AABEE',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '800',
    whiteSpace: 'nowrap',
    boxShadow: '0 8px 28px rgba(42,171,238,0.55), 0 0 0 3px rgba(255,255,255,0.9)',
    pointerEvents: 'none',
    opacity: '0',
    transform: 'scale(0.85)',
    transition: 'opacity .15s ease, transform .15s ease',
  } as Partial<CSSStyleDeclaration>);
  document.body.appendChild(el);
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const left = Math.min(Math.max(tap.x - w / 2, 8), vw - w - 8);
  // 손가락에 가리지 않게 누른 자리 위쪽, 공간이 없으면 아래쪽
  let top = tap.y - h - 18;
  if (top < 8) top = Math.min(tap.y + 24, vh - h - 8);
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  requestAnimationFrame(() => {
    el.style.opacity = '1';
    el.style.transform = 'scale(1)';
  });
  window.setTimeout(() => {
    el.style.opacity = '0';
    window.setTimeout(() => el.remove(), 200);
  }, 2200);
}

/** 방으로 이동: 로그인 안 했으면 안내만 하고 false */
export function openRoomLink(webApp: typeof WebApp, isLocalBrowser: boolean, link: string): boolean {
  if (!roomLinkAllowed) {
    showLoginBubble();
    return false;
  }
  openTelegramChannel(webApp, isLocalBrowser, link);
  return true;
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
