export type Theme = 'light' | 'dark' | 'ascii';

const STORAGE_KEY = 'multi-agent-theme';

export function loadTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'dark' || stored === 'ascii' ? stored : 'light';
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
}
