import { useEffect, useRef, useState } from 'react';
import { getPostPreview, type PostPreview } from '../api/stats';
import { MEDIA_ONLY_LABEL } from '../utils/telegramPost';

/**
 * 텔레그램 게시글 보여 주기 (홈 피드·채널 상세 공용).
 * - 안드로이드·PC: 텔레그램 공식 게시글 상자(iframe). 회원 기기가 텔레그램에서 직접 받는다
 * - 아이폰: iframe 이 터치를 가로채서, 서버가 공개 글을 읽어 우리가 그린다(메모리 30분, 저장 안 함)
 */


/**
 * 아이폰용 게시글 미리보기: 서버가 텔레그램 공개 글에서 읽은 글·사진을 우리 화면에 그린다.
 * 링크가 하나도 없어서 어디를 눌러도 이동하지 않는다(방 이동은 아래 줄 텔레그램 버튼만).
 */
export function OwnPostPreview({
  channelId,
  messageId,
  fallbackText,
  mediaType,
}: {
  channelId: string;
  messageId: number;
  fallbackText: string | null;
  mediaType: string;
}) {
  const post = { messageId, text: fallbackText, mediaType };
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [preview, setPreview] = useState<PostPreview | null | undefined>(undefined);
  const [expanded, setExpanded] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const el = boxRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    getPostPreview(channelId, post.messageId)
      .then((data) => {
        if (alive) setPreview(data);
      })
      .catch(() => {
        if (alive) setPreview(null);
      });
    return () => {
      alive = false;
    };
  }, [visible, channelId, post.messageId]);

  const text = (preview?.text || post.text || '').replace(/\n{3,}/g, '\n\n').trim();
  const images = (preview?.images ?? []).filter((src) => !brokenImages.has(src)).slice(0, 4);
  const long = text.length > 220 || text.split('\n').length > 6;

  return (
    <div
      ref={boxRef}
      className="mt-1 select-none"
      // 글·사진 어디를 눌러도 상세 페이지·텔레그램으로 넘어가지 않게 막는다
      onClick={(event) => {
        event.stopPropagation();
        event.preventDefault();
      }}
    >
      {text ? (
        <p
          className={`whitespace-pre-line break-words text-[15px] leading-[1.5] text-nl-text ${
            expanded ? '' : 'line-clamp-6'
          }`}
        >
          {text}
        </p>
      ) : preview !== undefined && images.length === 0 ? (
        <p className="text-[14px] text-nl-muted">{MEDIA_ONLY_LABEL[post.mediaType] ?? '글 내용 없는 게시글'}</p>
      ) : null}
      {long && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-0.5 text-[13px] font-semibold text-nl-muted"
        >
          {expanded ? '접기' : '더 보기'}
        </button>
      )}

      {preview === undefined && post.mediaType !== 'text' ? (
        <div className="mt-2.5 h-48 w-full animate-pulse rounded-xl bg-nl-elev" />
      ) : images.length > 0 ? (
        <div
          className={`mt-2.5 grid gap-0.5 overflow-hidden rounded-xl ring-1 ring-nl-line ${
            images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {images.map((src, i) => (
            <div key={src} className={`relative ${images.length === 3 && i === 0 ? 'col-span-2' : ''}`}>
              <img
                src={src}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                draggable={false}
                onError={() => setBrokenImages((prev) => new Set(prev).add(src))}
                className={`pointer-events-none block w-full object-cover ${
                  images.length === 1 ? 'max-h-[420px]' : images.length === 3 && i === 0 ? 'h-48' : 'h-36'
                }`}
              />
              {preview?.hasVideo && i === 0 && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/55 text-white">
                    <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden>
                      <path d="M7 4v16l13-8z" />
                    </svg>
                  </span>
                </span>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** 텔레그램 공식 게시글 미리보기 (사진·영상·전체 글). 우리 서버에는 저장하지 않는다 */
export function TelegramPostEmbed({ url, onOpenRoom, title }: { url: string; onOpenRoom: () => void; title: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== 'https://t.me' || event.source !== ref.current?.contentWindow) return;
      try {
        const data = typeof event.data === 'string' ? (JSON.parse(event.data) as { event?: string; height?: number }) : null;
        if (data?.event === 'resize' && data.height) setHeight(Math.min(2000, Math.max(120, data.height)));
      } catch {
        // 다른 메시지는 무시
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
  return (
    // 텔레그램 말풍선은 왼쪽 위가 각지고 꼬리(7px)가 튀어나와 어색해서, 꼬리만큼 왼쪽으로 밀고 둥근 틀로 잘라 낸다
    <div className="relative overflow-hidden rounded-[15px]" onClick={(event) => event.stopPropagation()}>
      <iframe
        ref={ref}
        title="텔레그램 원본 게시글"
        src={`${url}?embed=1&userpic=false${dark ? '&dark=1' : ''}`}
        loading="lazy"
        tabIndex={-1}
        // 스크롤바 절대 금지(사용자 요청): 상자 안에서 스크롤되지 않게 하고, 높이는 텔레그램이 알려 주는 값으로 맞춘다
        scrolling="no"
        // 상자 안(로고·이름·링크)은 눌리지 않게: 텔레그램 웹으로 튀어 나가는 것 방지
        className="pointer-events-none -ml-[7px] block w-[calc(100%+7px)] max-w-none overflow-hidden border-0"
        style={{ height }}
      />
      {/* 투명 덮개: 아이폰은 iframe 에 pointer-events-none 이 안 먹어 상자 어디를 눌러도 텔레그램 글로 이동했다.
          덮개가 터치를 먼저 받아 아무 일도 하지 않는다(로고 자리만 아래 버튼으로 연다) */}
      <div
        aria-hidden
        className="absolute inset-0 z-10 rounded-xl"
        onClick={(event) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onTouchEnd={(event) => event.stopPropagation()}
      />
      {/* 상자 오른쪽 위 텔레그램 로고 자리: 누르면 이 방을 텔레그램 앱으로 연다 */}
      <button
        type="button"
        aria-label={`${title} 텔레그램에서 열기`}
        onClick={(event) => {
          event.stopPropagation();
          onOpenRoom();
        }}
        className="absolute top-0 right-0 z-20 h-12 w-14 rounded-tr-xl"
      />
    </div>
  );
}

