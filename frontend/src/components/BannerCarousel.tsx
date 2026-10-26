import { useEffect, useRef, useState } from 'react';
import { trackBannerClick, type PublicBanner } from '../api/ads';
import { openTelegramChannel, useTelegram } from '../hooks/useTelegram';
import { resolveMediaUrl } from '../utils/mediaUrl';

/**
 * 홈 배너 광고. 여러 개면 rotateSeconds 마다 옆으로 자연스럽게 넘어간다(손으로 밀어도 됨).
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
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = banners.length;

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const timer = window.setInterval(
      () => setIndex((value) => (value + 1) % count),
      Math.max(1, rotateSeconds) * 1000,
    );
    return () => window.clearInterval(timer);
  }, [count, paused, rotateSeconds]);

  if (count === 0) return null;

  const open = (banner: PublicBanner) => {
    trackBannerClick(banner.id);
    openTelegramChannel(webApp, isLocalBrowser, banner.link);
  };

  return (
    <div
      className="relative overflow-hidden rounded-2xl ring-1 ring-nl-line"
      onTouchStart={(event) => {
        touchX.current = event.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(event) => {
        const start = touchX.current;
        const end = event.changedTouches[0]?.clientX ?? null;
        touchX.current = null;
        setPaused(false);
        if (start == null || end == null || count < 2) return;
        const dx = end - start;
        if (Math.abs(dx) < 40) return;
        setIndex((value) => (dx < 0 ? (value + 1) % count : (value - 1 + count) % count));
      }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {banners.map((banner) => (
          <button
            key={banner.id}
            type="button"
            onClick={() => open(banner)}
            className="block w-full shrink-0"
            aria-label={`${banner.title} 텔레그램으로 이동`}
          >
            <img
              src={resolveMediaUrl(banner.imageUrl)}
              alt={banner.title}
              draggable={false}
              className="block aspect-[3/1] w-full bg-nl-elev object-cover"
            />
          </button>
        ))}
      </div>
      {count > 1 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {banners.map((banner, i) => (
            <span
              key={banner.id}
              className={`h-1.5 rounded-full bg-white shadow transition-all ${
                i === index ? 'w-4 opacity-100' : 'w-1.5 opacity-60'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
