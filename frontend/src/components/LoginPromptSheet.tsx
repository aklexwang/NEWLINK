import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';
import { useTelegram } from '../hooks/useTelegram';
import { toastMessage } from '../providers/ToastProvider';
import { LOGIN_PROMPT_EVENT, type LoginPromptDetail } from '../utils/loginPrompt';

/**
 * 비회원 로그인 안내: 미니앱에서는 버튼 한 번으로 로그인하고 하려던 일을 이어서 한다.
 * (미니앱 밖 브라우저는 MY 의 텔레그램 로그인으로 보낸다)
 */
export function LoginPromptSheet() {
  const [prompt, setPrompt] = useState<LoginPromptDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const { loginWithInitData } = useAuth();
  const { isLocalBrowser } = useTelegram();
  const navigate = useNavigate();

  useEffect(() => {
    const on = (event: Event) => setPrompt((event as CustomEvent<LoginPromptDetail>).detail);
    window.addEventListener(LOGIN_PROMPT_EVENT, on);
    return () => window.removeEventListener(LOGIN_PROMPT_EVENT, on);
  }, []);

  if (!prompt) return null;

  const close = () => {
    if (!busy) setPrompt(null);
  };

  const login = async () => {
    if (isLocalBrowser) {
      setPrompt(null);
      navigate('/my');
      return;
    }
    setBusy(true);
    try {
      await loginWithInitData();
      toastMessage('로그인되었어요.', 'success');
      const next = prompt.onSuccess;
      setPrompt(null);
      await next?.();
    } catch {
      toastMessage('로그인하지 못했어요. MY에서 다시 시도해 주세요.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/55" onClick={close}>
      <div
        className="nl-fade-in w-full max-w-lg rounded-t-[24px] bg-nl-card px-5 pt-3 pb-[calc(20px+env(safe-area-inset-bottom))] ring-1 ring-nl-line"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="mx-auto h-1 w-10 rounded-full bg-nl-line" />
        <div className="mt-5 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#2aabee]/15 text-[#2aabee]">
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="currentColor" aria-hidden>
              <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.7.8l-4.8-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.9 8.9-8c.4-.3-.1-.5-.6-.2L6.5 13.2l-4.7-1.5c-1-.3-1-1 .2-1.5L20.5 3c.9-.3 1.6.2 1.4 1.3Z" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="text-[17px] font-bold text-nl-text">텔레그램으로 로그인</p>
            <p className="mt-0.5 text-[13px] text-nl-muted">{prompt.reason}</p>
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-nl-muted">
          가입 절차 없이 지금 쓰는 텔레그램 계정으로 바로 로그인돼요. 전화번호는 받지 않아요.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void login()}
          className="mt-4 h-12 w-full rounded-xl bg-[#229af0] text-[15px] font-bold text-white disabled:opacity-60"
        >
          {busy ? '로그인 중…' : '로그인하고 계속하기'}
        </button>
        <button type="button" onClick={close} className="mt-2 h-11 w-full text-[14px] font-medium text-nl-muted">
          나중에
        </button>
      </div>
    </div>
  );
}
