import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  fetchAuthMe,
  loginWithTelegram,
  loginWithTelegramOidc,
  loginWithTelegramWidget,
  type TelegramLoginWidgetPayload,
} from '../api/auth';
import {
  clearAccessToken,
  clearInitDataHeader,
  setAccessToken,
  setInitDataHeader,
} from '../api/client';
import type { AppUser } from '../types/user';
import {
  clearLoggedOut,
  clearStoredAccessToken,
  getStoredAccessToken,
  isLoggedOut,
  markLoggedOut,
  saveAccessToken,
} from '../utils/authSession';
import { clearTestProfile, createLocalDemoUser, getTestProfile } from '../utils/testRegistration';
import { useTelegram } from '../hooks/useTelegram';

type AuthStatus = 'loading' | 'authenticated' | 'guest';

interface AuthContextValue {
  status: AuthStatus;
  user: AppUser | null;
  isNewUser: boolean;
  error: string | null;
  refreshAuth: () => Promise<void>;
  logout: () => void;
  loginLocalDemo: () => void;
  loginWithWidget: (payload: TelegramLoginWidgetPayload) => Promise<void>;
  loginWithOidc: (idToken: string) => Promise<void>;
  /** 미니앱: 슬라이드 후 initData로 로그인 */
  loginWithInitData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { initData, isLocalBrowser } = useTelegram();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AppUser | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const logout = useCallback(() => {
    clearAccessToken();
    clearStoredAccessToken();
    clearInitDataHeader();
    clearTestProfile();
    markLoggedOut();
    setUser(null);
    setIsNewUser(false);
    setError(null);
    setStatus('guest');
  }, []);

  const applyAuthSuccess = useCallback((result: {
    accessToken: string;
    isNewUser: boolean;
    user: AppUser;
  }) => {
    setAccessToken(result.accessToken);
    saveAccessToken(result.accessToken);
    clearLoggedOut();
    setUser(result.user);
    setIsNewUser(result.isNewUser);
    setError(null);
    setStatus('authenticated');
  }, []);

  const loginLocalDemo = useCallback(() => {
    const profile = createLocalDemoUser();
    clearLoggedOut();
    setUser(profile);
    setIsNewUser(true);
    setError(null);
    setStatus('authenticated');
  }, []);

  const loginWithWidget = useCallback(
    async (payload: TelegramLoginWidgetPayload) => {
      const result = await loginWithTelegramWidget(payload);
      clearTestProfile();
      applyAuthSuccess(result);
    },
    [applyAuthSuccess],
  );

  const loginWithOidc = useCallback(
    async (idToken: string) => {
      const result = await loginWithTelegramOidc(idToken);
      clearTestProfile();
      applyAuthSuccess(result);
    },
    [applyAuthSuccess],
  );

  const loginWithInitData = useCallback(async () => {
    const fresh =
      (typeof window !== 'undefined'
        ? (window as Window & { Telegram?: { WebApp?: { initData?: string } } }).Telegram?.WebApp
            ?.initData
        : '') ||
      initData ||
      '';
    if (!fresh) {
      throw new Error('미니앱 정보가 없습니다. 봇 메뉴에서 미니앱을 완전히 닫았다가 다시 열어 주세요.');
    }
    setInitDataHeader(fresh);
    const result = await loginWithTelegram(fresh);
    clearTestProfile();
    applyAuthSuccess(result);
  }, [applyAuthSuccess, initData]);

  const refreshAuth = useCallback(async () => {
    if (isLocalBrowser) {
      if (isLoggedOut()) {
        clearAccessToken();
        setUser(null);
        setIsNewUser(false);
        setError(null);
        setStatus('guest');
        return;
      }

      const storedToken = getStoredAccessToken();
      if (storedToken) {
        setAccessToken(storedToken);
        try {
          const me = await fetchAuthMe();
          if (me) {
            clearLoggedOut();
            setUser(me);
            setIsNewUser(false);
            setError(null);
            setStatus('authenticated');
            return;
          }
        } catch {
          clearAccessToken();
          clearStoredAccessToken();
        }
      }

      const testProfile = getTestProfile();
      if (testProfile) {
        clearLoggedOut();
        setUser(testProfile);
        setIsNewUser(false);
        setError(null);
        setStatus('authenticated');
        return;
      }

      clearAccessToken();
      clearStoredAccessToken();
      setUser(null);
      setIsNewUser(false);
      setError(null);
      setStatus('guest');
      return;
    }

    // 미니앱: 저장된 세션만 복구. 신규 로그인은 슬라이드로 진행.
    if (isLoggedOut()) {
      clearAccessToken();
      clearStoredAccessToken();
      setUser(null);
      setIsNewUser(false);
      setError(null);
      setStatus('guest');
      return;
    }

    const storedToken = getStoredAccessToken();
    if (storedToken) {
      setAccessToken(storedToken);
      if (initData) setInitDataHeader(initData);
      try {
        const me = await fetchAuthMe();
        if (me) {
          clearLoggedOut();
          setUser(me);
          setIsNewUser(false);
          setError(null);
          setStatus('authenticated');
          return;
        }
      } catch {
        clearAccessToken();
        clearStoredAccessToken();
      }
    }

    clearAccessToken();
    clearStoredAccessToken();
    setUser(null);
    setIsNewUser(false);
    setError(null);
    setStatus('guest');
  }, [initData, isLocalBrowser]);

  useEffect(() => {
    void refreshAuth();
  }, [refreshAuth]);

  const value = useMemo(
    () => ({
      status,
      user,
      isNewUser,
      error,
      refreshAuth,
      logout,
      loginLocalDemo,
      loginWithWidget,
      loginWithOidc,
      loginWithInitData,
    }),
    [
      status,
      user,
      isNewUser,
      error,
      refreshAuth,
      logout,
      loginLocalDemo,
      loginWithWidget,
      loginWithOidc,
      loginWithInitData,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
