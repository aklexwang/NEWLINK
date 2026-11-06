import { useEffect } from 'react';

type Inset = { top?: number; bottom?: number; left?: number; right?: number };
type TgWebApp = {
  platform?: string;
  isFullscreen?: boolean;
  safeAreaInset?: Inset;
  contentSafeAreaInset?: Inset;
  isVersionAtLeast?: (v: string) => boolean;
  requestFullscreen?: () => void;
  onEvent?: (e: string, cb: () => void) => void;
  offEvent?: (e: string, cb: () => void) => void;
};

const MOBILE = new Set(['ios', 'android', 'android_x']);
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
 * 모바일 텔레그램에서 미니앱을 전체 화면으로 연다.
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
      // 텔레그램 버튼 줄(닫기 … ⌄ ⋮): 상태바 아래, 버튼 줄 높이
      const contentTop = app.isFullscreen ? (app.contentSafeAreaInset?.top ?? 0) : 0;
      root.style.setProperty('--nl-sys-top', `${app.isFullscreen ? app.safeAreaInset?.top ?? 0 : 0}px`);
      root.style.setProperty('--nl-bar-h', `${contentTop}px`);
      // 버튼 줄이 있으면 그 가운데에 로고·MY 를 올리고 홈 헤더 줄은 숨긴다
      root.classList.toggle('nl-fs', contentTop > 0);
      root.classList.toggle('nl-android', ANDROID.has(app.platform ?? ''));
    };

    apply();
    EVENTS.forEach((e) => app.onEvent?.(e, apply));

    try {
      if (
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
