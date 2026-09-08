'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: 'light', toggleTheme: () => {} });

const THEME_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#020617' };

function applyThemeColor(theme: Theme) {
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => el.remove());
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = THEME_COLORS[theme];
  document.head.appendChild(meta);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    applyThemeColor(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      document.documentElement.classList.toggle('dark', next === 'dark');
      applyThemeColor(next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}