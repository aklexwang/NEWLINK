import { useEffect, useRef } from 'react';

export interface TelegramLoginUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramLoginButtonProps {
  botUsername: string;
  onAuth: (user: TelegramLoginUser) => void;
  cornerRadius?: number;
  requestWrite?: boolean;
}

declare global {
  interface Window {
    onNewLinkTelegramAuth?: (user: TelegramLoginUser) => void;
  }
}

/**
 * Telegram Login Widget
 * @see https://core.telegram.org/widgets/login
 * BotFather /setdomain 에 사이트 도메인이 등록되어 있어야 합니다.
 */
export function TelegramLoginButton({
  botUsername,
  onAuth,
  cornerRadius = 12,
  requestWrite = true,
}: TelegramLoginButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onAuthRef = useRef(onAuth);
  onAuthRef.current = onAuth;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !botUsername) return;

    window.onNewLinkTelegramAuth = (user) => {
      onAuthRef.current(user);
    };

    container.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', botUsername.replace(/^@/, ''));
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-radius', String(cornerRadius));
    script.setAttribute('data-onauth', 'onNewLinkTelegramAuth(user)');
    if (requestWrite) {
      script.setAttribute('data-request-access', 'write');
    }
    container.appendChild(script);

    return () => {
      delete window.onNewLinkTelegramAuth;
      container.innerHTML = '';
    };
  }, [botUsername, cornerRadius, requestWrite]);

  if (!botUsername) {
    return (
      <p className="text-center text-sm text-tg-hint">
        Telegram 봇 사용자명이 설정되지 않았습니다. (VITE_TELEGRAM_BOT_USERNAME)
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-tg-secondary/70 p-4">
      <p className="mb-3 text-center text-sm text-tg-hint">Telegram 계정으로 로그인</p>
      <div ref={containerRef} className="flex min-h-[44px] items-center justify-center" />
    </div>
  );
}
