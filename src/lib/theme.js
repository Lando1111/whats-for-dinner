const KEY = 'wfd-theme';

export function getTheme() {
  try { return localStorage.getItem(KEY) || 'phone'; } catch { return 'phone'; }
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'phone' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1f1a16' : '#fbf7f0');
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: theme just won't persist */ }
  applyTheme(theme);
}
