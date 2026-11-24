import { render } from 'preact';
import { App } from './app.jsx';
import { applyTheme, getTheme } from './lib/theme.js';
import './styles.css';

applyTheme(getTheme());
render(<App />, document.getElementById('app'));
