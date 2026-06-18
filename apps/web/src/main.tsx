import { render } from 'preact';
import { App } from './app.js';
import { createRuntime } from './runtime.js';
import './theme.css';

const root = document.getElementById('app');
if (!root) throw new Error('#app root element not found');

const runtime = await createRuntime();

/** Restore a file and hand it to the browser as a download. */
async function download(path: string): Promise<void> {
  const bytes = await runtime.restore(path);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart]));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = path;
  anchor.click();
  URL.revokeObjectURL(url);
}

render(
  <App
    controller={runtime.controller}
    files={runtime.files}
    peers={runtime.peers}
    syncStatus={runtime.syncStatus}
    selfId={runtime.selfAddr.id}
    onRestore={(path) => void download(path)}
    onPair={(peerId, relayUrl) => void runtime.pair({ id: peerId, relayUrl })}
  />,
  root,
);
