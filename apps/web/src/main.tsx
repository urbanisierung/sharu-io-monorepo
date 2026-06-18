import { render } from 'preact';
import { App } from './app.js';
import { createRuntime } from './runtime.js';
import './theme.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root element not found');

const runtime = await createRuntime();
render(
  <App
    controller={runtime.controller}
    files={runtime.files}
    peers={runtime.peers}
    syncStatus={runtime.syncStatus}
  />,
  root,
);
