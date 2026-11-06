import { useEffect } from 'react';

type Inset = { top?: number; bottom?: number; left?: number; right?: number };
type TgWebApp = {
  platform?: string;
  isFullscreen?: boolean;
  safeAreaInset?: Inset;
  contentSafeAreaInset?: Inset;
  isVersionAtLeast?: (v: string) => boolean;
  requestFullscreen?: () => void;
  exitFullscreen?: () => void;
  onEvent?: (e: string, cb: () => void) => void;
  offEvent?: (e: string, cb: () => void) => void;
};

const MOBILE = new Set(['ios']);
const ANDROID = new Set(['android', 'android_x']);
const EVENTS = ['safeAreaChanged', 'contentSafeAreaChanged', 'fullscreenChanged', 'viewportChanged'];

function tg(): TgWebApp | undefined {
  try {
    return (window as Window & { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;
  } catch {
    return undefined;
  }
}

/**
 * 아이폰 텔레그램에서 미니앱을 전체 화면으로 연다. (안드로이드는 폰 기본 버튼이 가려져서 일반 크기)
 * (봇 채팅의 PLAY 메뉴 버튼은 BotFather 의 Fullscreen 설정과 상관없이 일반 크기로 열리기 때문)
 * 전체 화면에서는 휴대폰 상태바와 텔레그램의 닫기·⋯ 버튼이 화면 위에 겹치므로
 * 그 높이를 --nl-safe-top / --nl-safe-bottom 으로 넘겨 헤더·하단 탭을 피하게 한다.
 */
export function useTelegramFullscreen() {
  useEffect(() => {
    const app = tg();
    if (!app || !app.platform || app.platform === 'unknown') return;
    const root = document.documentElement;

    const apply = () => {
      const top = app.isFullscreen
        ? (app.safeAreaInset?.top ?? 0) + (app.contentSafeAreaInset?.top ?? 0)
        : 0;
      const bottom = app.isFullscreen
        ? (app.safeAreaInset?.bottom ?? 0) + (app.contentSafeAreaInset?.bottom ?? 0)
        : 0;
      root.style.setProperty('--nl-safe-top', `${top}px`);
      root.style.setProperty('--nl-safe-bottom', `${bottom}px`);
    };

    apply();
    EVENTS.forEach((e) => app.onEvent?.(e, apply));

    try {
      // 안드로이드 텔레그램은 전체 화면이면 폰 기본 버튼(||| ○ <)을 숨긴다 → 안드로이드는 일반 크기로 둔다
      // (BotFather 설정이 Fullscreen 이라 전체 화면으로 열린 경우에도 되돌림)
      if (ANDROID.has(app.platform)) {
        if (app.isFullscreen && typeof app.exitFullscreen === 'function') app.exitFullscreen();
      } else if (
        MOBILE.has(app.platform) &&
        !app.isFullscreen &&
        app.isVersionAtLeast?.('8.0') &&
        typeof app.requestFullscreen === 'function'
      ) {
        app.requestFullscreen();
      }
    } catch {
      /* 지원하지 않는 버전이면 일반 크기로 둔다 */
    }

    return () => EVENTS.forEach((e) => app.offEvent?.(e, apply));
  }, []);
}
