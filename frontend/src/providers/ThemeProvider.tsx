import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import WebApp from '@twa-dev/sdk';

export type ThemeMode = 'dark' | 'light';

// 2026-10-31 회원페이지를 어두운 톤으로 개편: 키를 바꿔 모두 어두운 모드로 한 번 시작한다
const STORAGE_KEY = 'newlink-theme-v3';
const LEGACY_STORAGE_KEYS = ['newlink-theme', 'newlink-theme-v2'];

const THEME_COLORS = {
  light: '#eef0f4',
  dark: '#000000',
} as const;

function readStoredTheme(): ThemeMode {
  try {
    for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
    return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

function applyTelegramChrome(mode: ThemeMode) {
  const color = THEME_COLORS[mode];
  try {
    WebApp.setHeaderColor?.(color);
    WebApp.setBackgroundColor?.(color);
    const extra = WebApp as typeof WebApp & {
      setBottomBarColor?: (value: string) => void;
    };
    extra.setBottomBarColor?.(color);
  } catch {
    /* 로컬 브라우저 등 */
  }
}

function applyTheme(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle('dark', mode === 'dark');
  root.classList.toggle('light', mode === 'light');
  root.dataset.theme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLORS[mode]);
  applyTelegramChrome(mode);
}

interface ThemeContextValue {
  theme: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() =>
    typeof window === 'undefined' ? 'dark' : readStoredTheme(),
  );

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
