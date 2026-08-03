import { useCallback, useEffect, useRef, useState } from 'react';
import { getTelegramLoginConfig } from '../api/auth';

interface SlideTelegramLoginProps {
  onIdToken: (idToken: string) => Promise<void> | void;
  onError?: (message: string) => void;
}

type TelegramLoginSdk = {
  init?: (
    options: { client_id: number; scope?: string[]; lang?: string },
    callback: (data: { id_token?: string; user?: unknown; error?: string }) => void,
  ) => void;
  auth?: (
    options: { client_id: number; scope?: string[]; lang?: string },
    callback: (data: { id_token?: string; user?: unknown; error?: string }) => void,
  ) => void;
  open?: (callback?: (data: { id_token?: string; error?: string }) => void) => void;
};

declare global {
  interface Window {
    Telegram?: { Login?: TelegramLoginSdk };
  }
}

function loadTelegramLoginSdk(): Promise<TelegramLoginSdk> {
  if (window.Telegram?.Login?.auth || window.Telegram?.Login?.init) {
    return Promise.resolve(window.Telegram.Login);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-newlink-telegram-login="1"]',
    );
    if (existing) {
      existing.addEventListener('load', () => {
        if (window.Telegram?.Login) resolve(window.Telegram.Login);
        else reject(new Error('Telegram Login SDK load failed'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://oauth.telegram.org/js/telegram-login.js?5';
    script.async = true;
    script.dataset.newlinkTelegramLogin = '1';
    script.onload = () => {
      if (window.Telegram?.Login) resolve(window.Telegram.Login);
      else reject(new Error('Telegram Login SDK missing'));
    };
    script.onerror = () => reject(new Error('Telegram Login SDK network error'));
    document.head.appendChild(script);
  });
}

/** 올링크 스타일: 밀면 Telegram OIDC 로그인 팝업 */
export function SlideTelegramLogin({ onIdToken, onError }: SlideTelegramLoginProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLButtonElement>(null);
  const [dragX, setDragX] = useState(0);
  const [busy, setBusy] = useState(false);
  const [clientId, setClientId] = useState<number | null>(null);
  const dragXRef = useRef(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const maxXRef = useRef(0);
  const finishedRef = useRef(false);
  const busyRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await getTelegramLoginConfig();
        if (!cancelled) setClientId(config.clientId);
        await loadTelegramLoginSdk();
      } catch (error) {
        if (!cancelled) {
          onError?.(error instanceof Error ? error.message : 'Telegram 로그인 준비 실패');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onError]);

  const setKnobX = (x: number) => {
    dragXRef.current = x;
    setDragX(x);
  };

  const reset = useCallback(() => {
    finishedRef.current = false;
    draggingRef.current = false;
    pointerIdRef.current = null;
    setKnobX(0);
  }, []);

  const startTelegramAuth = useCallback(async () => {
    if (busyRef.current) return;
    if (!clientId) {
      onError?.('Telegram Client ID를 불러오지 못했습니다. BotFather Domain을 확인하세요.');
      reset();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const sdk = await loadTelegramLoginSdk();
      const options = {
        client_id: clientId,
        scope: ['profile', 'write'],
        lang: 'ko',
      };

      await new Promise<void>((resolve, reject) => {
        const handler = (data: { id_token?: string; error?: string }) => {
          if (data.error) {
            reject(new Error(data.error));
            return;
          }
          if (!data.id_token) {
            reject(new Error('id_token이 없습니다.'));
            return;
          }
          void Promise.resolve(onIdToken(data.id_token))
            .then(() => resolve())
            .catch(reject);
        };

        if (typeof sdk.auth === 'function') {
          sdk.auth(options, handler);
          return;
        }
        if (typeof sdk.init === 'function' && typeof sdk.open === 'function') {
          sdk.init(options, handler);
          sdk.open(handler);
          return;
        }
        reject(new Error('Telegram.Login API를 사용할 수 없습니다.'));
      });
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.');
    } finally {
      busyRef.current = false;
      setBusy(false);
      reset();
    }
  }, [clientId, onError, onIdToken, reset]);

  const finish = useCallback(() => {
    if (finishedRef.current || busyRef.current) return;
    finishedRef.current = true;
    draggingRef.current = false;
    setKnobX(maxXRef.current);
    void startTelegramAuth();
  }, [startTelegramAuth]);

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
      reset();
    };

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [finish, reset]);

  const beginDrag = (clientX: number, pointerId: number, target: HTMLElement) => {
    if (busyRef.current || finishedRef.current) return;
    const track = trackRef.current;
    if (!track) return;
    const knobWidth = 52;
    maxXRef.current = Math.max(track.clientWidth - knobWidth - 8, 0);
    startXRef.current = clientX - dragXRef.current;
    draggingRef.current = true;
    pointerIdRef.current = pointerId;
    try {
      target.setPointerCapture(pointerId);
    } catch {
      // Telegram WebView 등에서 capture 실패해도 document 리스너로 동작
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    beginDrag(e.clientX, e.pointerId, e.currentTarget);
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
          {busy ? 'Telegram 연결 중...' : '밀어서 로그인'}
        </p>
        <button
          ref={knobRef}
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

      <button
        type="button"
        disabled={busy || !clientId}
        onClick={() => void startTelegramAuth()}
        className="mt-3 w-full rounded-xl bg-[#2AABEE] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? '연결 중...' : '탭하여 로그인'}
      </button>
    </div>
  );
}
