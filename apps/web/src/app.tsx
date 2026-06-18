import { signal } from '@preact/signals';
import { syncStatus } from '@safu/sdk';
import { Button } from './ui/button.js';

// View state via `@preact/signals`; domain state (`syncStatus`) flows from the
// SDK as a framework-agnostic signal (plan §0). Reading `.value` in the
// component body auto-subscribes — no useState/useEffect.
const blocks = signal(0);

export function App() {
  return (
    <main>
      <h1>Safu</h1>
      <p>sync: {syncStatus.value}</p>
      <Button intent="primary" onClick={() => blocks.value++}>
        Encrypted blocks: {blocks.value}
      </Button>
    </main>
  );
}
