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

    if (!initData) {
      clearAccessToken();
      clearStoredAccessToken();
      setUser(null);
      setIsNewUser(false);
      setError('Telegram initData를 찾을 수 없습니다.');
      setStatus('guest');
      return;
    }

    setInitDataHeader(initData);

    const storedToken = getStoredAccessToken();
    if (storedToken) {
      setAccessToken(storedToken);
    }

    try {
      const result = await loginWithTelegram(initData);
      applyAuthSuccess(result);
    } catch {
      clearAccessToken();
      clearStoredAccessToken();
      setUser(null);
      setIsNewUser(false);
      setError('Telegram 자동 로그인에 실패했습니다.');
      setStatus('guest');
    }
  }, [applyAuthSuccess, initData, isLocalBrowser]);

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
    }),
    [status, user, isNewUser, error, refreshAuth, logout, loginLocalDemo, loginWithWidget],
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
