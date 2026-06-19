import { render } from 'preact';
import { Root } from './root.js';
import './theme.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root element not found');

render(<Root />, root);
