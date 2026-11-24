import { render } from 'preact';
import { App } from './app.jsx';
import { applyTheme, getTheme } from './lib/theme.js';
import './styles.css';

applyTheme(getTheme());

// Opened from Android's Share menu: ?url=…&text=… → import that link as a new recipe.
const q = new URLSearchParams(location.search);
if (q.has('url') || q.has('text')) {
  const shared = `${q.get('url') || ''} ${q.get('text') || ''}`.match(/https?:\/\/\S+/);
  if (shared) { try { sessionStorage.setItem('wfd-share', shared[0]); } catch { /* ignore */ } }
  history.replaceState(null, '', `${location.pathname}${shared ? '#/recipe/new' : location.hash}`);
}
render(<App />, document.getElementById('app'));
