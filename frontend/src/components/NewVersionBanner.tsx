import { useEffect, useState } from 'react';
import { isNewerBuild, VERSION_CHECK_MS } from '../utils/appVersion';

/**
 * 배포 뒤 열려 있던 화면에 "새 버전이 올라왔습니다 · 새로고침" 을 띄운다.
 * 5분마다, 그리고 다시 화면으로 돌아올 때 /version.json 을 확인한다.
 */
export function NewVersionBanner() {
  const [available, setAvailable] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (available) return;
    let stopped = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const response = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) return;
        const data: unknown = await response.json().catch(() => null);
        if (!stopped && isNewerBuild(__APP_BUILD_ID__, data)) setAvailable(true);
      } catch {
        /* 확인 실패는 조용히 넘긴다 */
      }
    };
    const timer = window.setInterval(() => void check(), VERSION_CHECK_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [available]);

  if (!available || hidden) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[80] flex justify-center px-4"
    >
      <div className="flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 py-2.5 pr-2 pl-4 text-sm text-white shadow-xl">
        <span>새 버전이 올라왔습니다</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-xl bg-white px-3 py-1.5 text-[13px] font-bold text-slate-900"
        >
          새로고침
        </button>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="닫기"
          className="px-1.5 text-white/60 hover:text-white"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
