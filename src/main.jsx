import { render } from 'preact';
import { App } from './app.jsx';
import { applyTheme, getTheme } from './lib/theme.js';
import { applyMotion } from './lib/motion.js';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';

// Install updates as soon as they're published: check when the app opens, whenever it's brought
// back to the front, and hourly. A new version reloads the app once it's installed.
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return;
    const check = () => { if (navigator.onLine) reg.update().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    setInterval(check, 60 * 60 * 1000);
  }
});

applyTheme(getTheme());
applyMotion();

// Opened from Android's Share menu: ?url=…&text=… → import that link as a new recipe.
const q = new URLSearchParams(location.search);
if (q.has('url') || q.has('text')) {
  const shared = `${q.get('url') || ''} ${q.get('text') || ''}`.match(/https?:\/\/\S+/);
  if (shared) { try { sessionStorage.setItem('wfd-share', shared[0]); } catch { /* ignore */ } }
  history.replaceState(null, '', `${location.pathname}${shared ? '#/recipe/new' : location.hash}`);
}
render(<App />, document.getElementById('app'));
