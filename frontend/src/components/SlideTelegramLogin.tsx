import { useCallback, useEffect, useRef, useState } from 'react';
import type { TelegramLoginWidgetPayload } from '../api/auth';

interface SlideTelegramLoginProps {
  mode: 'miniapp' | 'browser';
  onMiniAppLogin: () => Promise<void>;
  onBrowserAuth?: (payload: TelegramLoginWidgetPayload) => Promise<void>;
  onError?: (message: string) => void;
}

/** BotFather Domain이 걸린 @newlinkcom_bot 숫자 ID (공개 값) */
const TELEGRAM_BOT_ID = Number(
  (import.meta.env.VITE_TELEGRAM_BOT_ID as string | undefined)?.trim() || '8792449981',
);

type TelegramWidgetLogin = {
  auth: (
    options: { bot_id: string | number; request_access?: string; lang?: string },
    callback: (authData: TelegramLoginWidgetPayload | false) => void,
  ) => void;
};

declare global {
  interface Window {
    Telegram?: { Login?: TelegramWidgetLogin };
  }
}

function loadWidgetSdk(): Promise<TelegramWidgetLogin> {
  if (window.Telegram?.Login?.auth) {
    return Promise.resolve(window.Telegram.Login);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-newlink-tg-widget="1"]',
    );
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.Telegram?.Login?.auth) resolve(window.Telegram.Login);
        else reject(new Error('Telegram Login Widget load failed'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.dataset.newlinkTgWidget = '1';
    script.onload = () => {
      if (window.Telegram?.Login?.auth) resolve(window.Telegram.Login);
      else reject(new Error('Telegram Login Widget missing'));
    };
    script.onerror = () => reject(new Error('Telegram Login Widget network error'));
    document.head.appendChild(script);
  });
}

function assertLoginHost() {
  const host = window.location.hostname.replace(/^www\./, '');
  if (host !== 'global-spay.com') {
    throw new Error('웹 로그인은 https://global-spay.com 에서만 가능합니다.');
  }
}

/** 올링크 스타일: 밀면 로그인 (미니앱=initData / 웹=공식 Login.auth 팝업) */
export function SlideTelegramLogin({
  mode,
  onMiniAppLogin,
  onBrowserAuth,
  onError,
}: SlideTelegramLoginProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [busy, setBusy] = useState(false);
  const dragXRef = useRef(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const maxXRef = useRef(0);
  const finishedRef = useRef(false);
  const busyRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  const setKnobX = (x: number) => {
    dragXRef.current = x;
    setDragX(x);
  };

  const resetKnob = useCallback(() => {
    finishedRef.current = false;
    draggingRef.current = false;
    pointerIdRef.current = null;
    setKnobX(0);
  }, []);

  const runLogin = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode === 'miniapp') {
        // 미니앱에서는 oauth.telegram.org 를 절대 쓰지 않음 → Bot domain invalid 방지
        await onMiniAppLogin();
        return;
      }

      assertLoginHost();
      if (!onBrowserAuth) {
        throw new Error('브라우저 로그인 핸들러가 없습니다.');
      }
      const login = await loadWidgetSdk();
      const handleBrowserAuth = onBrowserAuth;
      await new Promise<void>((resolve, reject) => {
        login.auth({ bot_id: TELEGRAM_BOT_ID, request_access: 'write', lang: 'ko' }, (authData) => {
          if (!authData) {
            reject(new Error('로그인이 취소되었습니다.'));
            return;
          }
          void Promise.resolve(handleBrowserAuth(authData))
            .then(() => resolve())
            .catch(reject);
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.';
      if (message !== '로그인이 취소되었습니다.') {
        onError?.(message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      resetKnob();
    }
  }, [mode, onBrowserAuth, onError, onMiniAppLogin, resetKnob]);

  const finish = useCallback(() => {
    if (finishedRef.current || busyRef.current) return;
    finishedRef.current = true;
    draggingRef.current = false;
    setKnobX(maxXRef.current);
    void runLogin();
  }, [runLogin]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || busyRef.current) return;
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      e.preventDefault();
      const next = Math.min(Math.max(e.clientX - startXRef.current, 0), maxXRef.current);
      setKnobX(next);
      if (maxXRef.current > 0 && next >= maxXRef.current * 0.9) {
        finish();
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;
      if (busyRef.current || finishedRef.current) return;
      if (maxXRef.current > 0 && dragXRef.current >= maxXRef.current * 0.9) {
        finish();
        return;
      }
      resetKnob();
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [finish, resetKnob]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (busyRef.current || finishedRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    maxXRef.current = Math.max(track.clientWidth - 52 - 8, 0);
    startXRef.current = e.clientX - dragXRef.current;
    draggingRef.current = true;
    pointerIdRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="mb-1 text-center text-sm font-semibold text-tg-text">텔레그램 로그인</p>
      <p className="mb-4 text-center text-xs text-tg-hint">오른쪽으로 슬라이드하여 로그인하세요.</p>

      <div
        ref={trackRef}
        className="relative h-[56px] select-none overflow-hidden rounded-full bg-[#eef2f6]"
        style={{ touchAction: 'none' }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-[#2AABEE]/22"
          style={{ width: `${Math.max(dragX + 56, 56)}px` }}
        />
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-[#7b8794]">
          {busy ? '로그인 중...' : '밀어서 로그인'}
        </p>
        <button
          type="button"
          disabled={busy}
          onPointerDown={onPointerDown}
          className="absolute left-1 top-1 flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-md disabled:opacity-70"
          style={{
            transform: `translateX(${dragX}px)`,
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
          aria-label="밀어서 Telegram 로그인"
        >
          <svg viewBox="0 0 24 24" className="pointer-events-none h-6 w-6 fill-current" aria-hidden>
            <path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.51-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.33 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
