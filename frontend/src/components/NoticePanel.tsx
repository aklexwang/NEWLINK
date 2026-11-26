import { useEffect, useRef, useState, type TouchEvent } from "react";
import { getNotices, type NoticeItem } from "../api/notices";
import { useAuth } from "../providers/AuthProvider";
import { openLoginPrompt } from "../utils/loginPrompt";

const OPEN_EVENT = "nl-notices-open";
const SEEN_KEY = "nl-notices-seen-at";
const SEEN_EVENT = "nl-notices-seen";

function seenAt(): number {
  try {
    return Number(localStorage.getItem(SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function markSeen(latestMs: number) {
  try {
    localStorage.setItem(SEEN_KEY, String(latestMs));
  } catch {
    /* 저장 못 해도 괜찮다 */
  }
  window.dispatchEvent(new Event(SEEN_EVENT));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** [공지] 버튼: 비회원은 로그인 안내, 회원은 위에서 내려오는 공지 창. 새 공지가 있으면 빨간 점 */
export function NoticeButton({ className = "" }: { className?: string }) {
  const { status, user } = useAuth();
  const isLoggedIn = status === "authenticated" && Boolean(user);
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setHasNew(false);
      return;
    }
    let alive = true;
    const check = () =>
      getNotices()
        .then((list) => {
          const latest = Math.max(
            0,
            ...list.map((n) => new Date(n.createdAt).getTime()),
          );
          if (alive) setHasNew(latest > seenAt());
        })
        .catch(() => undefined);
    void check();
    const onSeen = () => setHasNew(false);
    window.addEventListener(SEEN_EVENT, onSeen);
    return () => {
      alive = false;
      window.removeEventListener(SEEN_EVENT, onSeen);
    };
  }, [isLoggedIn]);

  return (
    <span className={`inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => {
          if (!isLoggedIn) {
            openLoginPrompt({
              reason: "로그인하면 공지를 볼 수 있어요",
              onSuccess: () => {
                window.dispatchEvent(new Event(OPEN_EVENT));
              },
            });
            return;
          }
          window.dispatchEvent(new Event(OPEN_EVENT));
        }}
        className="relative h-8 rounded-lg bg-[#2aabee] px-3 text-[13px] font-bold text-white shadow-[0_2px_10px_rgba(42,171,238,0.35)]"
      >
        공지
        {hasNew && (
          <span
            className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-nl-bg"
            aria-label="새 공지"
          />
        )}
      </button>
    </span>
  );
}

/** 위에서 아래로 내려오는 공지 창 (AppLayout 에 한 번만 둔다) */
export function NoticePanel() {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const [items, setItems] = useState<NoticeItem[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  // 위로 밀어서 닫기: 끌고 있는 거리(px, 위로는 음수)
  const [dragY, setDragY] = useState(0);
  const dragStart = useRef<number | null>(null);

  useEffect(() => {
    const on = () => {
      setOpen(true);
      setItems(null);
      setDragY(0);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      getNotices()
        .then((list) => {
          setItems(list);
          setExpanded(list[0]?.id ?? null);
          const latest = Math.max(0, ...list.map((n) => new Date(n.createdAt).getTime()));
          markSeen(latest);
        })
        .catch(() => setItems([]));
    };
    window.addEventListener(OPEN_EVENT, on);
    return () => window.removeEventListener(OPEN_EVENT, on);
  }, []);

  if (!open) return null;
  const close = () => {
    setShown(false);
    dragStart.current = null;
    window.setTimeout(() => {
      setOpen(false);
      setDragY(0);
    }, 250);
  };

  const dragHandlers = {
    onTouchStart: (e: TouchEvent) => {
      dragStart.current = e.touches[0]?.clientY ?? null;
    },
    onTouchMove: (e: TouchEvent) => {
      if (dragStart.current == null) return;
      const dy = (e.touches[0]?.clientY ?? dragStart.current) - dragStart.current;
      setDragY(Math.min(0, dy));
    },
    onTouchEnd: () => {
      if (dragStart.current == null) return;
      dragStart.current = null;
      if (dragY < -50) close();
      else setDragY(0);
    },
  };

  return (
    <div
      className={`fixed inset-0 z-[80] flex justify-center transition-colors duration-200 ${shown ? 'bg-black/55' : 'bg-black/0'}`}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="공지"
        onClick={(e) => e.stopPropagation()}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        className={`flex max-h-[78vh] w-full max-w-lg flex-col rounded-b-[24px] bg-nl-card pt-[calc(var(--nl-safe-top)+12px)] ring-1 ring-nl-line transition-transform duration-250 ease-out ${
          shown ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="px-5 pb-3" {...dragHandlers}>
          <p className="text-[18px] font-bold text-nl-text">📢 공지</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
          {items === null ? (
            <p className="py-8 text-center text-[14px] text-nl-muted">불러오는 중…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-[14px] text-nl-muted">아직 공지가 없어요.</p>
          ) : (
            items.map((n) => {
              const isOpen = expanded === n.id;
              return (
                <div key={n.id} className="border-b border-nl-line py-3 last:border-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : n.id)}
                    className="flex w-full items-start gap-2 text-left"
                  >
                    {n.pinned && (
                      <span className="mt-0.5 shrink-0 rounded bg-[#2aabee]/15 px-1.5 text-[11px] font-bold text-[#2aabee]">
                        고정
                      </span>
                    )}
                    <span className="min-w-0 flex-1 text-[15px] font-semibold text-nl-text">{n.title}</span>
                    <span className="shrink-0 text-[12px] text-nl-muted">{formatDate(n.createdAt)}</span>
                  </button>
                  {isOpen && n.body && (
                    <p className="mt-2 whitespace-pre-line break-words text-[14px] leading-[1.6] text-nl-text/90">{n.body}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
        {/* 아래쪽: 닫기 버튼 + 위로 밀어서 닫기 손잡이 (텔레그램 위쪽 버튼과 헷갈리지 않게 닫기는 아래에만) */}
        <div className="px-5 pt-2 pb-1" {...dragHandlers}>
          <button
            type="button"
            onClick={close}
            className="h-12 w-full rounded-xl bg-[#2aabee] text-[15px] font-bold text-white shadow-[0_2px_10px_rgba(42,171,238,0.35)]"
          >
            닫기
          </button>
          <div className="flex flex-col items-center pt-2.5 pb-1.5">
            <span className="block h-1.5 w-12 rounded-full bg-nl-muted/60" />
            <span className="mt-1 text-[11px] text-nl-muted">위로 밀어서 닫기</span>
          </div>
        </div>
      </div>
    </div>
  );
}
