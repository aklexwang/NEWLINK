import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

/** 이만큼 내려가면 버튼이 보인다(px) */
const SHOW_AFTER_PX = 600;

/**
 * "맨 위로" 버튼: 아래로 내려가면 오른쪽 아래(하단 메뉴 바로 위)에 나타나고, 누르면 맨 위로 부드럽게 올라간다.
 * 채널 상세는 하단에 [텔레그램에서 열기] 줄이 있어서 그 위로 올린다.
 */
export function ScrollTopButton() {
  const [show, setShow] = useState(false);
  const { pathname } = useLocation();
  const onDetail = pathname.startsWith('/c/');

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShow(window.scrollY > SHOW_AFTER_PX));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
    };
  }, [pathname]);

  return (
    <button
      type="button"
      aria-label="맨 위로"
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className={`fixed right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/85 bg-gradient-to-b from-[#5ccbf7] to-[#1d8fd6] text-white shadow-[0_6px_16px_rgba(0,0,0,0.45),0_2px_0_#16609a,inset_0_1px_0_rgba(255,255,255,0.55)] transition-all duration-150 active:translate-y-[2px] active:scale-95 active:shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.4)] ${
        show ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
      }`}
      style={{
        bottom: onDetail
          ? 'calc(57px + 70px + 12px + var(--nl-sab))'
          : 'calc(57px + 16px + var(--nl-sab))',
      }}
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 19V5" />
        <path d="M5 12l7-7 7 7" />
      </svg>
    </button>
  );
}
