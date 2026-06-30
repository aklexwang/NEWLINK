import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loginWithTelegram } from '../api/auth';
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

  const loginLocalDemo = useCallback(() => {
    const profile = createLocalDemoUser();
    clearLoggedOut();
    setUser(profile);
    setIsNewUser(true);
    setError(null);
    setStatus('authenticated');
  }, []);

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
      setAccessToken(result.accessToken);
      saveAccessToken(result.accessToken);
      clearLoggedOut();
      setUser(result.user);
      setIsNewUser(result.isNewUser);
      setError(null);
      setStatus('authenticated');
    } catch {
      clearAccessToken();
      clearStoredAccessToken();
      setUser(null);
      setIsNewUser(false);
      setError('Telegram 자동 로그인에 실패했습니다.');
      setStatus('guest');
    }
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
    }),
    [status, user, isNewUser, error, refreshAuth, logout, loginLocalDemo],
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
