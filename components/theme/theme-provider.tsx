'use client';
import { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

const ThemeContext = createContext<{
  theme: Theme;
  toggleTheme: () => void;
}>({ theme: 'light', toggleTheme: () => {} });

const THEME_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#020617' };

function applyThemeColor(theme: Theme) {
  // Update the existing theme-color meta(s) in place. Next.js renders these as
  // React 19 "hoistable" head resources; removing/re-appending the node here
  // desyncs React's internal bookkeeping and makes its commit phase throw
  // `removeChild` on null on the next navigation (which drops the first click).
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
    el.setAttribute('content', THEME_COLORS[theme]);
  });
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    const stored = localStorage.getItem('theme') as Theme | null;
    const initial: Theme =
      stored ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initial);
    document.documentElement.classList.toggle('dark', initial === 'dark');
    applyThemeColor(initial);
  }, []);

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