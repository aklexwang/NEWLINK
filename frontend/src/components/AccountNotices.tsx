import { useEffect, useState } from 'react';
import { ACCOUNT_BLOCKED_EVENT, DETAIL_LIMIT_EVENT } from '../api/client';
import { toastMessage } from '../providers/ToastProvider';

/**
 * 계정 제한 안내
 * - 어드민이 차단한 계정: 전체 화면 안내
 * - 채널 상세 하루 상한(100개)을 넘음: 짧은 알림
 */
export function AccountNotices() {
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  useEffect(() => {
    const onBlocked = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail;
      setBlockedMessage(detail || '이용이 제한된 계정이에요.');
    };
    const onLimit = (event: Event) => {
      const detail = (event as CustomEvent<string | undefined>).detail;
      toastMessage(detail || '오늘 볼 수 있는 채널 상세를 모두 봤어요. 내일 다시 이용해 주세요.', 'error');
    };
    window.addEventListener(ACCOUNT_BLOCKED_EVENT, onBlocked);
    window.addEventListener(DETAIL_LIMIT_EVENT, onLimit);
    return () => {
      window.removeEventListener(ACCOUNT_BLOCKED_EVENT, onBlocked);
      window.removeEventListener(DETAIL_LIMIT_EVENT, onLimit);
    };
  }, []);
  if (!blockedMessage) return null;
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-3 bg-nl-bg px-6 text-center">
      <p className="text-xl font-bold text-nl-text">이용이 제한되었어요</p>
      <p className="max-w-sm text-[15px] leading-relaxed text-nl-muted">{blockedMessage}</p>
    </div>
  );
}
