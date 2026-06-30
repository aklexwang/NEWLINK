import { useCallback, useRef, useState } from 'react';

interface SlideToLoginProps {
  label?: string;
  onComplete: () => void;
}

export function SlideToLogin({ label = '밀어서 로그인', onComplete }: SlideToLoginProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [completed, setCompleted] = useState(false);
  const startXRef = useRef(0);
  const maxXRef = useRef(0);

  const reset = () => {
    setDragX(0);
    setDragging(false);
  };

  const finish = useCallback(() => {
    setCompleted(true);
    setDragX(maxXRef.current);
    onComplete();
  }, [onComplete]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (completed) return;
    const track = trackRef.current;
    if (!track) return;
    const knobWidth = 48;
    maxXRef.current = Math.max(track.clientWidth - knobWidth - 8, 0);
    startXRef.current = e.clientX - dragX;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || completed) return;
    const next = Math.min(Math.max(e.clientX - startXRef.current, 0), maxXRef.current);
    setDragX(next);
    if (maxXRef.current > 0 && next >= maxXRef.current * 0.92) {
      finish();
    }
  };

  const onPointerUp = () => {
    if (completed) return;
    if (maxXRef.current > 0 && dragX >= maxXRef.current * 0.92) {
      finish();
      return;
    }
    reset();
  };

  return (
    <div className="rounded-2xl bg-tg-secondary/70 p-4">
      <p className="mb-3 text-center text-sm text-tg-hint">데모: 옆으로 밀어 임의 회원 ID가 생성됩니다</p>
      <div
        ref={trackRef}
        className="relative h-14 overflow-hidden rounded-full bg-tg-bg ring-1 ring-black/5"
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-tg-button/20 transition-[width]"
          style={{ width: `${dragX + 56}px` }}
        />
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-tg-hint">
          {completed ? '로그인 완료' : label}
        </p>
        <div
          role="button"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`absolute left-1 top-1 flex h-12 w-12 items-center justify-center rounded-full bg-tg-button text-lg text-tg-button-text shadow-md ${dragging ? '' : 'transition-transform'}`}
          style={{ transform: `translateX(${dragX}px)` }}
          aria-label={label}
        >
          →
        </div>
      </div>
    </div>
  );
}
