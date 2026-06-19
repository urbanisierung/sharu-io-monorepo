import preact from '@preact/preset-vite';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

const exclude = ['**/dist/**', '**/node_modules/**', '**/wasm/**', '**/target/**'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          // App integration tests that drive the real crypto WASM run here (plain
          // Node, file:// URLs) rather than in the vite-based `web` project.
          include: ['packages/*/src/**/*.test.ts', 'apps/web/src/**/*.integration.test.ts'],
          exclude: [...exclude, '**/*.browser.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [preact()],
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.{ts,tsx}'],
          exclude: [...exclude, '**/*.integration.test.ts', '**/*.browser.test.ts'],
          environment: 'happy-dom',
        },
      },
      {
        // Inject the opt-in flag for the gated relay e2e. Evaluated in Node at
        // config time, so a shell `SAFU_E2E=1` reaches the browser test bundle.
        // (Project Vite configs do not inherit root-level options.)
        define: { __SAFU_E2E__: JSON.stringify(process.env.SAFU_E2E === '1') },
        test: {
          name: 'opfs',
          include: ['packages/sdk/src/**/*.browser.test.ts', 'apps/web/src/**/*.browser.test.ts'],
          exclude,
          browser: {
            enabled: true,
            provider: playwright(),
            headless: true,
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
