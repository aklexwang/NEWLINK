import { useEffect, useRef } from 'react';
import type { TelegramLoginUser } from './TelegramLoginButton';

interface Props {
  botUsername: string;
  onAuth: (user: TelegramLoginUser) => Promise<void> | void;
  onError?: (message: string) => void;
}

/**
 * BotFather Domain용 공식 Login Widget 버튼
 * (OIDC 대신 레거시 위젯 — Domain 설정과 직접 호환)
 */
export function TelegramOfficialLoginButton({ botUsername, onAuth, onError }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    const container = containerRef.current;
    const name = botUsername.replace(/^@/, '').trim();
    if (!container || !name) {
      onError?.('봇 사용자명이 없습니다.');
      return;
    }

    window.onNewLinkTelegramAuth = (user) => {
      void Promise.resolve(onAuthRef.current(user)).catch((error) => {
        onError?.(error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.');
      });
    };

    container.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', name);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', '12');
    script.setAttribute('data-onauth', 'onNewLinkTelegramAuth(user)');
    script.setAttribute('data-request-access', 'write');
    script.setAttribute('data-lang', 'ko');
    container.appendChild(script);

    return () => {
      delete window.onNewLinkTelegramAuth;
      container.innerHTML = '';
    };
  }, [botUsername, onError]);

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="mb-4 text-center text-sm font-semibold text-tg-text">Telegram 계정으로 로그인</p>
      <div ref={containerRef} className="flex min-h-[44px] items-center justify-center" />
    </div>
  );
}
