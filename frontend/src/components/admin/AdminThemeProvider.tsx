import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { cn } from '@/components/admin/lib/utils';

export type AdminThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'newlink-admin-theme';

/** 2026-11: 어드민은 밝은 테마만 쓴다 (어두운 테마 버튼 없앰) */
function readStoredTheme(): AdminThemeMode {
  return 'light';
}

interface AdminThemeContextValue {
  theme: AdminThemeMode;
  toggleTheme: () => void;
}

const AdminThemeContext = createContext<AdminThemeContextValue | null>(null);

export function AdminThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<AdminThemeMode>(() =>
    typeof window === 'undefined' ? 'light' : readStoredTheme(),
  );

  useEffect(() => {
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

  return (
    <AdminThemeContext.Provider value={value}>
      <div
        className={cn('admin-root min-h-screen', theme === 'dark' && 'dark')}
        data-admin-theme={theme}
      >
        {children}
      </div>
    </AdminThemeContext.Provider>
  );
}

export function useAdminTheme() {
  const ctx = useContext(AdminThemeContext);
  if (!ctx) throw new Error('useAdminTheme must be used within AdminThemeProvider');
  return ctx;
}
