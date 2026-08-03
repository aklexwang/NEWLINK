import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TelegramLoginButton,
  type TelegramLoginUser,
} from './TelegramLoginButton';

interface SlideTelegramLoginProps {
  botUsername: string;
  onAuth: (payload: TelegramLoginUser) => Promise<void> | void;
  onError?: (message: string) => void;
}

/**
 * 올링크 스타일 슬라이드 → BotFather Domain용 공식 Login Widget 표시.
 * (커스텀 oauth 리다이렉트는 미니앱/인앱브라우저에서 Bot domain invalid 가 자주 남)
 */
export function SlideTelegramLogin({ botUsername, onAuth, onError }: SlideTelegramLoginProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [unlocked, setUnlocked] = useState(false);
  const dragXRef = useRef(0);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const maxXRef = useRef(0);
  const finishedRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);

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

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    draggingRef.current = false;
    setKnobX(maxXRef.current);
    setUnlocked(true);
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || unlocked) return;
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
      if (finishedRef.current || unlocked) return;
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
  }, [finish, reset, unlocked]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (unlocked || finishedRef.current) return;
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

  const handleAuth = async (user: TelegramLoginUser) => {
    try {
      await onAuth(user);
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.');
    }
  };

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="mb-1 text-center text-sm font-semibold text-tg-text">텔레그램 로그인</p>
      <p className="mb-4 text-center text-xs text-tg-hint">
        {unlocked
          ? '아래 버튼으로 Telegram 로그인을 완료하세요.'
          : '오른쪽으로 슬라이드하여 로그인하세요.'}
      </p>

      {!unlocked && (
        <>
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
              밀어서 로그인
            </p>
            <button
              type="button"
              onPointerDown={onPointerDown}
              className="absolute left-1 top-1 flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[#2AABEE] text-white shadow-md"
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
            onClick={finish}
            className="mt-3 w-full rounded-xl bg-[#2AABEE] py-3 text-sm font-semibold text-white"
          >
            탭하여 로그인
          </button>
        </>
      )}

      {unlocked && (
        <div className="mt-1">
          <TelegramLoginButton botUsername={botUsername} onAuth={handleAuth} />
        </div>
      )}
    </div>
  );
}
