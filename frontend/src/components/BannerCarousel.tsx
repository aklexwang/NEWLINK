import { useEffect, useRef, useState } from 'react';
import { trackAdImpressions, trackBannerClick, type PublicBanner } from '../api/ads';
import { openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import { resolveMediaUrl } from '../utils/mediaUrl';

/** 넘어갈 때 움직임: 부드럽게 출발해 천천히 멈춤 */
const SLIDE_MS = 750;
const EASE = 'cubic-bezier(0.25, 0.8, 0.25, 1)';

/**
 * 홈 배너 광고. 여러 개면 rotateSeconds 마다 옆으로 넘어간다.
 * - 끝에서 처음으로 갈 때도 되감기 없이 같은 방향으로 계속 흐른다(앞뒤 복제 슬라이드).
 * - 손가락으로 끌면 배너가 손을 따라 움직이고, 놓으면 넘어가거나 제자리로 돌아온다.
 * - 누르고 있거나 마우스를 올려두거나 화면이 안 보일 때는 멈춘다.
 * 누르면 그 텔레그램 방으로 이동. 배너 비율 3:1 (1200×400).
 */
export function BannerCarousel({
  banners,
  rotateSeconds,
}: {
  banners: PublicBanner[];
  rotateSeconds: number;
}) {
  const { webApp, isLocalBrowser } = useTelegram();
  const count = banners.length;
  const loop = count > 1;
  // 화면 순서: [마지막 복제, 1, 2, …, n, 첫번째 복제] → 진짜 첫 배너는 pos 1
  const slides = loop ? [banners[count - 1], ...banners, banners[0]] : banners;

  const [pos, setPos] = useState(loop ? 1 : 0);
  const [animate, setAnimate] = useState(true);
  const [dragPx, setDragPx] = useState(0);
  const [hover, setHover] = useState(false);
  const [hidden, setHidden] = useState(
    typeof document !== 'undefined' && document.visibilityState === 'hidden',
  );
  const drag = useRef<{ x: number; y: number; width: number; horizontal: boolean | null } | null>(
    null,
  );
  const moved = useRef(false);
  const [dragging, setDragging] = useState(false);

  // 한 장이 자리 잡을 때마다 +1 → 자동 넘김 타이머가 여기서부터 다시 센다
  const [tick, setTick] = useState(0);

  // 배너 개수가 바뀌면 처음으로 (렌더 중 상태 맞추기)
  const [prevCount, setPrevCount] = useState(count);
  if (prevCount !== count) {
    setPrevCount(count);
    setAnimate(false);
    setPos(count > 1 ? 1 : 0);
  }

  // 복제 슬라이드 위에 멈추면 소리 없이 진짜 위치로 순간 이동
  const settle = () => {
    setTick((value) => value + 1);
    if (!loop) return;
    if (pos >= count + 1) {
      setAnimate(false);
      setPos(1);
    } else if (pos <= 0) {
      setAnimate(false);
      setPos(count);
    }
  };

  // 순간 이동 후 다음 프레임에 다시 애니메이션 켜기
  useEffect(() => {
    if (animate) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
    return () => cancelAnimationFrame(id);
  }, [animate]);

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 자동 넘김: 한 장이 완전히 멈춘 뒤부터 rotateSeconds 동안 보여 준다(손으로 넘겨도 동일)
  const paused = hover || dragging || hidden;
  useEffect(() => {
    if (!loop || paused) return;
    const timer = window.setTimeout(
      () => {
        setAnimate(true);
        setPos((value) => (value >= count + 1 ? 1 : value) + 1);
      },
      Math.max(1, rotateSeconds) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [loop, paused, rotateSeconds, tick, count]);

  // 지금 보이는 배너 노출 기록 (같은 배너는 하루 한 번만)
  const visibleId =
    count === 0 ? null : banners[loop ? (((pos - 1) % count) + count) % count : 0]?.id ?? null;
  useEffect(() => {
    if (visibleId && !hidden) trackAdImpressions('banner', [visibleId]);
  }, [visibleId, hidden]);

  if (count === 0) return null;

  const open = (banner: PublicBanner) => {
    if (moved.current) return; // 끌기 끝에 생기는 클릭은 무시
    openTelegramChannel(webApp, isLocalBrowser, banner.link);
    trackBannerClick(banner.id);
  };

  const onStart = (x: number, y: number, width: number) => {
    if (!loop) return;
    // 복제 위에서 잡으면 먼저 진짜 위치로
    if (pos >= count + 1 || pos <= 0) settle();
    drag.current = { x, y, width, horizontal: null };
    moved.current = false;
    setDragging(true);
  };

  const onMove = (x: number, y: number) => {
    const d = drag.current;
    if (!d) return;
    const dx = x - d.x;
    const dy = y - d.y;
    if (d.horizontal == null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      d.horizontal = Math.abs(dx) > Math.abs(dy);
    }
    if (!d.horizontal) return; // 세로 스크롤은 그대로 둔다
    moved.current = true;
    setAnimate(false);
    setDragPx(dx);
  };

  const onEnd = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    const dx = dragPx;
    setAnimate(true);
    setDragPx(0);
    if (Math.abs(dx) > Math.min(60, d.width * 0.18)) {
      setPos((value) => value + (dx < 0 ? 1 : -1));
    }
    // 클릭 무시 표시는 이번 탭이 끝난 뒤 해제
    window.setTimeout(() => {
      moved.current = false;
    }, 0);
  };

  const active = loop ? (((pos - 1) % count) + count) % count : 0;

  return (
    <div
      className="relative touch-pan-y select-none overflow-hidden rounded-2xl ring-1 ring-nl-line"
      onTouchStart={(event) => {
        const t = event.touches[0];
        if (t) onStart(t.clientX, t.clientY, event.currentTarget.clientWidth);
      }}
      onTouchMove={(event) => {
        const t = event.touches[0];
        if (t) onMove(t.clientX, t.clientY);
      }}
      onTouchEnd={onEnd}
      onTouchCancel={onEnd}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="flex"
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget) settle();
        }}
        style={{
          transform: `translate3d(calc(${-pos * 100}% + ${dragPx}px), 0, 0)`,
          transition: animate && !dragging ? `transform ${SLIDE_MS}ms ${EASE}` : 'none',
          willChange: 'transform',
        }}
      >
        {slides.map((banner, i) => (
          <button
            key={`${banner.id}-${i}`}
            type="button"
            onClick={() => open(banner)}
            tabIndex={loop && (i === 0 || i === slides.length - 1) ? -1 : 0}
            aria-hidden={loop && (i === 0 || i === slides.length - 1) ? true : undefined}
            className="block w-full shrink-0"
            aria-label={`${banner.title} 텔레그램으로 이동`}
          >
            <img
              src={resolveMediaUrl(banner.imageUrl)}
              alt={banner.title}
              draggable={false}
              loading="eager"
              decoding="async"
              className="block aspect-[3/1] w-full bg-nl-elev object-cover"
            />
          </button>
        ))}
      </div>
      {loop && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {banners.map((banner, i) => (
            <span
              key={banner.id}
              className={`h-1.5 rounded-full bg-white shadow transition-all duration-500 ${
                i === active ? 'w-4 opacity-100' : 'w-1.5 opacity-60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
