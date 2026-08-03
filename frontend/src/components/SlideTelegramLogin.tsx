import { useCallback, useEffect, useRef, useState } from 'react';
import { getTelegramLoginConfig, type TelegramLoginWidgetPayload } from '../api/auth';

interface SlideTelegramLoginProps {
  /** 미니앱: initData 로그인 / 브라우저: 위젯 페이로드 로그인 */
  mode: 'miniapp' | 'browser';
  onMiniAppLogin: () => Promise<void>;
  onBrowserAuth: (payload: TelegramLoginWidgetPayload) => Promise<void>;
  onError?: (message: string) => void;
}

const OAUTH_ORIGIN = 'https://oauth.telegram.org';

function getAllowedOrigin(): string {
  const host = window.location.hostname.replace(/^www\./, '');
  if (host === 'global-spay.com' || host.endsWith('.pages.dev')) {
    return 'https://global-spay.com';
  }
  return window.location.origin;
}

function parseWidgetPayload(raw: unknown): TelegramLoginWidgetPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const result = raw as Record<string, unknown>;
  const id = Number(result.id);
  const hash = typeof result.hash === 'string' ? result.hash : '';
  const firstName = typeof result.first_name === 'string' ? result.first_name : '';
  const authDate = Number(result.auth_date);
  if (!Number.isFinite(id) || id <= 0 || !hash || !firstName || !Number.isFinite(authDate)) {
    return null;
  }
  return {
    id,
    first_name: firstName,
    last_name: typeof result.last_name === 'string' ? result.last_name : undefined,
    username: typeof result.username === 'string' ? result.username : undefined,
    photo_url: typeof result.photo_url === 'string' ? result.photo_url : undefined,
    auth_date: authDate,
    hash,
  };
}

export function consumeTelegramAuthRedirect(): TelegramLoginWidgetPayload | null {
  if (typeof window === 'undefined') return null;

  const hash = window.location.hash || '';
  const marker = 'tgAuthResult=';
  const idx = hash.indexOf(marker);
  if (idx === -1) return null;

  const encoded = hash.slice(idx + marker.length);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);

  const tryParse = (value: string) => {
    const decoded = JSON.parse(atob(value));
    if (decoded?.error) return null;
    return parseWidgetPayload(decoded);
  };

  try {
    return tryParse(decodeURIComponent(encoded));
  } catch {
    try {
      return tryParse(encoded);
    } catch {
      return null;
    }
  }
}

function startBrowserTelegramLogin(botId: number) {
  const origin = getAllowedOrigin();
  const returnTo = `${origin}${window.location.pathname}${window.location.search}`;
  const authUrl =
    `${OAUTH_ORIGIN}/auth` +
    `?bot_id=${encodeURIComponent(String(botId))}` +
    `&origin=${encodeURIComponent(origin)}` +
    `&request_access=write` +
    `&return_to=${encodeURIComponent(returnTo)}`;

  window.location.assign(authUrl);
}

/** 올링크 스타일: 밀면 바로 로그인 */
export function SlideTelegramLogin({
  mode,
  onMiniAppLogin,
  onBrowserAuth,
  onError,
}: SlideTelegramLoginProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [busy, setBusy] = useState(false);
  const [botId, setBotId] = useState<number | null>(null);
  const dragXRef = useRef(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const maxXRef = useRef(0);
  const finishedRef = useRef(false);
  const busyRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const handledRedirectRef = useRef(false);

  useEffect(() => {
    if (mode !== 'browser') return;
    let cancelled = false;
    void getTelegramLoginConfig()
      .then((config) => {
        if (!cancelled) setBotId(config.clientId);
      })
      .catch((error) => {
        if (!cancelled) {
          onError?.(error instanceof Error ? error.message : 'Telegram 로그인 준비 실패');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode, onError]);

  useEffect(() => {
    if (mode !== 'browser' || handledRedirectRef.current) return;
    const payload = consumeTelegramAuthRedirect();
    if (!payload) return;
    handledRedirectRef.current = true;
    busyRef.current = true;
    setBusy(true);
    void Promise.resolve(onBrowserAuth(payload))
      .catch((error) => {
        onError?.(error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.');
      })
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  }, [mode, onBrowserAuth, onError]);

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
        await onMiniAppLogin();
        return;
      }
      if (!botId) {
        throw new Error('봇 정보를 불러오는 중입니다. 잠시 후 다시 밀어 주세요.');
      }
      startBrowserTelegramLogin(botId);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.');
      busyRef.current = false;
      setBusy(false);
      resetKnob();
    }
  }, [botId, mode, onBrowserAuth, onError, onMiniAppLogin, resetKnob]);

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
