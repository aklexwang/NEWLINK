import { useCallback, useEffect, useRef, useState } from 'react';
import { getTelegramLoginConfig } from '../api/auth';
import type { TelegramLoginWidgetPayload } from '../api/auth';

interface SlideTelegramLoginProps {
  onAuth: (payload: TelegramLoginWidgetPayload) => Promise<void> | void;
  onError?: (message: string) => void;
}

const OAUTH_ORIGIN = 'https://oauth.telegram.org';

function parseAuthMessage(raw: unknown): TelegramLoginWidgetPayload | null {
  let data = raw;
  if (typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!data || typeof data !== 'object') return null;

  const record = data as Record<string, unknown>;
  const result =
    record.event === 'auth_result' && record.result && typeof record.result === 'object'
      ? (record.result as Record<string, unknown>)
      : record;

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

function openLegacyTelegramAuth(botId: number): Promise<TelegramLoginWidgetPayload> {
  const origin = window.location.origin;
  const authUrl =
    `${OAUTH_ORIGIN}/auth` +
    `?bot_id=${encodeURIComponent(String(botId))}` +
    `&origin=${encodeURIComponent(origin)}` +
    `&request_access=write` +
    `&return_to=${encodeURIComponent(origin)}`;

  const width = 550;
  const height = 470;
  const left = Math.max(0, (window.screen.width - width) / 2);
  const top = Math.max(0, (window.screen.height - height) / 2);
  const features = `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`;

  return new Promise((resolve, reject) => {
    const popup = window.open(authUrl, 'telegram_login', features);
    if (!popup) {
      reject(new Error('팝업이 차단되었습니다. 브라우저에서 팝업을 허용해 주세요.'));
      return;
    }

    let finished = false;
    const done = (fn: () => void) => {
      if (finished) return;
      finished = true;
      window.removeEventListener('message', onMessage);
      window.clearInterval(timer);
      fn();
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== OAUTH_ORIGIN) return;
      if (event.source && event.source !== popup) return;

      const payload = parseAuthMessage(event.data);
      if (payload) {
        done(() => {
          try {
            popup.close();
          } catch {
            // ignore
          }
          resolve(payload);
        });
        return;
      }

      let data = event.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      if (
        data &&
        typeof data === 'object' &&
        (data as { event?: string }).event === 'auth_result' &&
        (data as { error?: string }).error
      ) {
        done(() => reject(new Error(String((data as { error?: string }).error))));
      }
    };

    window.addEventListener('message', onMessage);

    const timer = window.setInterval(() => {
      if (!popup.closed) return;
      done(() => reject(new Error('로그인이 취소되었습니다.')));
    }, 300);

    try {
      popup.focus();
    } catch {
      // ignore
    }
  });
}

/** 올링크 스타일: 밀면 Telegram 로그인 팝업 (BotFather Domain / 레거시 oauth) */
export function SlideTelegramLogin({ onAuth, onError }: SlideTelegramLoginProps) {
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const config = await getTelegramLoginConfig();
        if (!cancelled) setBotId(config.clientId);
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
    if (!botId) {
      onError?.('봇 ID를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
      reset();
      return;
    }

    busyRef.current = true;
    setBusy(true);
    try {
      const payload = await openLegacyTelegramAuth(botId);
      await onAuth(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.';
      if (message !== '로그인이 취소되었습니다.') {
        onError?.(message);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      reset();
    }
  }, [botId, onAuth, onError, reset]);

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
          {busy ? 'Telegram 연결 중...' : '밀어서 로그인'}
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

      <button
        type="button"
        disabled={busy || !botId}
        onClick={() => void startTelegramAuth()}
        className="mt-3 w-full rounded-xl bg-[#2AABEE] py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? '연결 중...' : '탭하여 로그인'}
      </button>
    </div>
  );
}
