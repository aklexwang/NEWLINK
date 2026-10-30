import { useEffect, useState } from 'react';
import { MINIAPP_ONLY_EVENT } from '../api/client';

const BOT_USERNAME =
  (import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined)?.replace(/^@/, '') || 'telllink_bot';

/** 서버가 "미니앱에서만" 이라고 거절했을 때(일반 브라우저로 직접 연 경우) 전체 화면 안내 */
export function MiniAppOnlyNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => setShow(true);
    window.addEventListener(MINIAPP_ONLY_EVENT, on);
    return () => window.removeEventListener(MINIAPP_ONLY_EVENT, on);
  }, []);
  if (!show) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-nl-bg px-6 text-center">
      <div className="text-5xl" aria-hidden>
        ✈️
      </div>
      <p className="text-xl font-bold text-tg-text">텔레그램에서 열어 주세요</p>
      <p className="max-w-sm text-[15px] leading-relaxed text-nl-muted">
        TellLink 는 텔레그램 미니앱으로만 이용할 수 있어요. 아래 버튼으로 텔레그램에서 봇을 열어 주세요.
      </p>
      <a
        href={`https://t.me/${BOT_USERNAME}`}
        className="rounded-2xl bg-[#2AABEE] px-6 py-3 text-base font-bold text-white shadow"
      >
        텔레그램에서 열기
      </a>
    </div>
  );
}
