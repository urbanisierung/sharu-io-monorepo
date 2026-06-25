// The in-app section the navbar's tabs select — Files, Devices, or Settings.
// Lifted out of app.tsx so the global navbar (which renders the tabs) and the
// App shell (which renders each section's content) share one signal.
import { signal } from '@preact/signals';

export type AppView = 'files' | 'devices' | 'settings';

export const activeView = signal<AppView>('files');

/** Reset the section to the default — for deterministic tests. */
export function resetAppView(): void {
  activeView.value = 'files';
}
