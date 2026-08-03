import { useEffect, useRef } from 'react';

interface TelegramOfficialLoginButtonProps {
  clientId: number | string;
  onIdToken: (idToken: string) => Promise<void> | void;
  onError?: (message: string) => void;
  label?: string;
}

type TelegramLoginSdk = {
  init: (
    options: { client_id: number; scope?: string[]; lang?: string; request_access?: string },
    callback: (data: { id_token?: string; error?: string }) => void,
  ) => void;
  open: (callback?: (data: { id_token?: string; error?: string }) => void) => void;
  auth: (
    options: { client_id: number; scope?: string[]; lang?: string; request_access?: string },
    callback: (data: { id_token?: string; error?: string }) => void,
  ) => void;
};

declare global {
  interface Window {
    Telegram?: { Login?: TelegramLoginSdk };
  }
}

/**
 * 공식 Telegram Login 라이브러리 버튼
 * @see https://core.telegram.org/widgets/login
 * script: https://oauth.telegram.org/js/telegram-login.js
 */
export function TelegramOfficialLoginButton({
  clientId,
  onIdToken,
  onError,
  label = '텔레그램으로 로그인하기',
}: TelegramOfficialLoginButtonProps) {
  const onIdTokenRef = useRef(onIdToken);
  const onErrorRef = useRef(onError);
  onIdTokenRef.current = onIdToken;
  onErrorRef.current = onError;

  useEffect(() => {
    const numericId = Number(clientId);
    if (!Number.isFinite(numericId) || numericId <= 0) {
      onErrorRef.current?.('Client ID가 없습니다. BotFather Web Login을 확인하세요.');
      return;
    }

    const handleResult = (data: { id_token?: string; error?: string }) => {
      if (data.error) {
        onErrorRef.current?.(data.error);
        return;
      }
      if (!data.id_token) {
        onErrorRef.current?.('id_token이 없습니다.');
        return;
      }
      void Promise.resolve(onIdTokenRef.current(data.id_token)).catch((error) => {
        onErrorRef.current?.(
          error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.',
        );
      });
    };

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-newlink-oidc-login="1"]',
    );

    const ensureInit = () => {
      const login = window.Telegram?.Login;
      if (!login) {
        onErrorRef.current?.('Telegram Login SDK를 불러오지 못했습니다.');
        return;
      }
      login.init(
        {
          client_id: numericId,
          lang: 'ko',
          request_access: 'write',
          scope: ['profile', 'write'],
        },
        handleResult,
      );
    };

    if (window.Telegram?.Login?.init) {
      ensureInit();
      return;
    }

    if (existing) {
      existing.addEventListener('load', ensureInit);
      return () => existing.removeEventListener('load', ensureInit);
    }

    const script = document.createElement('script');
    script.src = 'https://oauth.telegram.org/js/telegram-login.js?5';
    script.async = true;
    script.dataset.newlinkOidcLogin = '1';
    script.dataset.clientId = String(numericId);
    script.dataset.requestAccess = 'write';
    script.dataset.lang = 'ko';
    script.onload = ensureInit;
    script.onerror = () => onErrorRef.current?.('Telegram Login SDK 네트워크 오류');
    document.head.appendChild(script);
  }, [clientId]);

  const onClick = () => {
    const login = window.Telegram?.Login;
    if (!login) {
      onError?.('Telegram Login 준비 중입니다. 잠시 후 다시 눌러 주세요.');
      return;
    }
    if (typeof login.open === 'function') {
      login.open();
      return;
    }
    if (typeof login.auth === 'function') {
      login.auth(
        {
          client_id: Number(clientId),
          lang: 'ko',
          request_access: 'write',
          scope: ['profile', 'write'],
        },
        (data) => {
          if (data.error) {
            onError?.(data.error);
            return;
          }
          if (!data.id_token) {
            onError?.('id_token이 없습니다.');
            return;
          }
          void Promise.resolve(onIdToken(data.id_token)).catch((error) => {
            onError?.(error instanceof Error ? error.message : 'Telegram 로그인에 실패했습니다.');
          });
        },
      );
    }
  };

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <p className="mb-4 text-center text-sm font-semibold text-tg-text">Telegram 계정으로 로그인</p>
      <div className="flex justify-center">
        <button type="button" className="tg-auth-button" onClick={onClick}>
          {label}
        </button>
      </div>
    </div>
  );
}
