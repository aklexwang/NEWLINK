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

const STORAGE_KEY = 'newlink-theme-v2';
const LEGACY_STORAGE_KEY = 'newlink-theme';

const THEME_COLORS = {
  light: '#eef0f4',
  dark: '#101218',
} as const;

function readStoredTheme(): ThemeMode {
  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return localStorage.getItem(STORAGE_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
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
    typeof window === 'undefined' ? 'light' : readStoredTheme(),
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
