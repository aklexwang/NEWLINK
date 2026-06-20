import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { resolveMediaUrl } from '../utils/mediaUrl';

interface CategoryChip {
  id: string;
  label: string;
  emoji: string;
  iconUrl?: string | null;
}

interface CategoryHoneycombProps {
  categories: CategoryChip[];
  onSelect: (id: string) => void;
}

const BUBBLE_SIZE = 78;
const HEX_SPACING = 60;
const MIN_SCALE = 0.44;
const MAX_SCALE = 1.1;
const FISHEYE_RADIUS = 190;
const DRAG_THRESHOLD = 10;
const FRICTION = 0.9;

const BUBBLE_COLORS = [
  '#FF3B30',
  '#FF9500',
  '#FFCC00',
  '#34C759',
  '#30D158',
  '#5AC8FA',
  '#007AFF',
  '#5856D6',
  '#AF52DE',
  '#FF2D55',
  '#64D2FF',
  '#BF5AF2',
];

function hexRingPositions(count: number) {
  const positions: { q: number; r: number }[] = [{ q: 0, r: 0 }];
  if (count <= 1) return positions.slice(0, count);

  let ring = 1;
  while (positions.length < count) {
    let q = 0;
    let r = -ring;
    const directions: [number, number][] = [
      [1, 0],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [0, -1],
      [1, -1],
    ];

    for (const [dq, dr] of directions) {
      for (let step = 0; step < ring && positions.length < count; step += 1) {
        positions.push({ q, r });
        q += dq;
        r += dr;
      }
    }
    ring += 1;
  }

  return positions.slice(0, count);
}

function axialToPixel(q: number, r: number, spacing: number) {
  const x = spacing * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r);
  const y = spacing * ((3 / 2) * r);
  return { x, y };
}

function fisheyeScale(x: number, y: number, centerX: number, centerY: number) {
  const dist = Math.hypot(x - centerX, y - centerY);
  const t = Math.min(dist / FISHEYE_RADIUS, 1);
  const eased = 1 - t ** 1.55;
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * eased;
}

function shadeColor(hex: string, amount: number) {
  const value = hex.replace('#', '');
  const num = parseInt(value, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (num & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function BubbleVisual({
  category,
  diameter,
  color,
  scale,
}: {
  category: CategoryChip;
  diameter: number;
  color: string;
  scale: number;
}) {
  const iconSize = diameter * 0.72;
  const emojiSize = Math.max(22, diameter * 0.42);

  return (
    <div
      className="relative flex items-center justify-center rounded-full"
      style={{
        width: diameter,
        height: diameter,
        background: `linear-gradient(145deg, ${shadeColor(color, 24)} 0%, ${color} 52%, ${shadeColor(color, -28)} 100%)`,
        boxShadow: `
          0 ${6 * scale}px ${22 * scale}px rgba(0, 0, 0, ${0.08 + scale * 0.1}),
          0 ${2 * scale}px ${6 * scale}px rgba(0, 0, 0, 0.06),
          inset 0 1px 0 rgba(255, 255, 255, 0.45)
        `,
        opacity: 0.55 + scale * 0.45,
      }}
    >
      <div className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-white/40 via-white/5 to-black/10" />
      <div
        className="relative overflow-hidden rounded-full bg-white/20 ring-2 ring-white/50"
        style={{ width: iconSize, height: iconSize }}
      >
        {category.iconUrl ? (
          <img
            src={resolveMediaUrl(category.iconUrl)}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
            style={{ imageRendering: 'auto' }}
          />
        ) : (
          <span
            className="flex h-full w-full items-center justify-center leading-none"
            style={{ fontSize: emojiSize }}
          >
            {category.emoji || '📁'}
          </span>
        )}
      </div>
    </div>
  );
}

export function CategoryHoneycomb({ categories, onSelect }: CategoryHoneycombProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const panRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef(0);
  const dragRef = useRef({
    active: false,
    moved: false,
    pointerId: -1,
    startX: 0,
    startY: 0,
    panX: 0,
    panY: 0,
    targetId: null as string | null,
    lastX: 0,
    lastY: 0,
    lastT: 0,
  });

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [, setFrame] = useState(0);

  const layout = useMemo(() => {
    const coords = hexRingPositions(categories.length);
    return categories.map((category, index) => {
      const { q, r } = coords[index];
      const { x, y } = axialToPixel(q, r, HEX_SPACING);
      return {
        category,
        x,
        y,
        color: BUBBLE_COLORS[index % BUBBLE_COLORS.length],
      };
    });
  }, [categories]);

  const bumpFrame = useCallback(() => {
    setFrame((value) => value + 1);
  }, []);

  const stopInertia = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const startInertia = useCallback(() => {
    stopInertia();

    const tick = () => {
      const velocity = velocityRef.current;
      if (Math.hypot(velocity.x, velocity.y) < 0.25) {
        rafRef.current = 0;
        return;
      }

      panRef.current = {
        x: panRef.current.x + velocity.x,
        y: panRef.current.y + velocity.y,
      };
      velocity.x *= FRICTION;
      velocity.y *= FRICTION;
      bumpFrame();
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [bumpFrame, stopInertia]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      setSize({ width: node.clientWidth, height: node.clientHeight });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => {
      observer.disconnect();
      stopInertia();
    };
  }, [stopInertia]);

  const centerX = size.width / 2;
  const centerY = size.height / 2;
  const pan = panRef.current;

  const getBubbleAtPoint = useCallback(
    (localX: number, localY: number) => {
      const { x: panX, y: panY } = panRef.current;
      const hits = layout
        .map(({ category, x, y }) => {
          const screenX = centerX + x + panX;
          const screenY = centerY + y + panY;
          const scale = fisheyeScale(screenX, screenY, centerX, centerY);
          const dist = Math.hypot(localX - screenX, localY - screenY);
          return { id: category.id, dist, scale };
        })
        .filter((item) => item.dist <= (BUBBLE_SIZE * item.scale) / 2 + 12)
        .sort((a, b) => a.dist - b.dist || b.scale - a.scale);

      return hits[0]?.id ?? null;
    },
    [layout, centerX, centerY],
  );

  const toLocalPoint = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      stopInertia();
      velocityRef.current = { x: 0, y: 0 };

      const point = toLocalPoint(event.clientX, event.clientY);
      if (!point) return;

      dragRef.current = {
        active: true,
        moved: false,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        panX: panRef.current.x,
        panY: panRef.current.y,
        targetId: getBubbleAtPoint(point.x, point.y),
        lastX: event.clientX,
        lastY: event.clientY,
        lastT: performance.now(),
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [getBubbleAtPoint, stopInertia, toLocalPoint],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag.active || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        drag.moved = true;
        drag.targetId = null;
      }

      const now = performance.now();
      const dt = Math.max(now - drag.lastT, 1);
      velocityRef.current = {
        x: ((event.clientX - drag.lastX) / dt) * 16,
        y: ((event.clientY - drag.lastY) / dt) * 16,
      };
      drag.lastX = event.clientX;
      drag.lastY = event.clientY;
      drag.lastT = now;

      panRef.current = {
        x: drag.panX + dx,
        y: drag.panY + dy,
      };
      bumpFrame();
    },
    [bumpFrame],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag.pointerId !== event.pointerId) return;

      if (!drag.moved && drag.targetId) {
        onSelect(drag.targetId);
      } else if (drag.moved) {
        startInertia();
      }

      drag.active = false;
      drag.moved = false;
      drag.targetId = null;

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [onSelect, startInertia],
  );

  return (
    <div className="relative flex-1 overflow-hidden bg-white">
      <div
        ref={containerRef}
        className="absolute inset-0 touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {size.width > 0 &&
          layout.map(({ category, x, y, color }) => {
            const screenX = centerX + x + pan.x;
            const screenY = centerY + y + pan.y;
            const scale = fisheyeScale(screenX, screenY, centerX, centerY);
            const diameter = BUBBLE_SIZE * scale;
            const labelScale = Math.max(0, Math.min(1, (scale - 0.42) / 0.55));
            const fontSize = 10 + labelScale * 4;
            const labelOpacity = 0.62 + labelScale * 0.38;

            return (
              <div
                key={category.id}
                className="pointer-events-none absolute flex flex-col items-center"
                style={{
                  left: screenX,
                  top: screenY,
                  transform: 'translate(-50%, -50%)',
                  zIndex: Math.round(scale * 100),
                  willChange: 'transform, left, top',
                }}
                aria-hidden
              >
                <BubbleVisual category={category} diameter={diameter} color={color} scale={scale} />
                <div
                  className="mt-2 max-w-[96px] rounded-full px-2.5 py-0.5 text-center shadow-sm ring-1 ring-black/[0.04]"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.94)',
                    opacity: labelOpacity,
                    transform: `scale(${0.88 + labelScale * 0.12})`,
                  }}
                >
                  <span
                    className="block truncate font-bold leading-tight tracking-tight"
                    style={{
                      fontSize,
                      color,
                      textShadow: '0 1px 0 rgba(255,255,255,0.9)',
                    }}
                  >
                    {category.label}
                  </span>
                </div>
              </div>
            );
          })}
      </div>

      <p className="pointer-events-none absolute bottom-3 left-0 right-0 text-center text-xs text-tg-hint">
        드래그하여 탐색 · 탭하여 선택
      </p>
    </div>
  );
}
