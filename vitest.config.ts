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
          include: ['packages/*/src/**/*.test.ts'],
          exclude: [...exclude, '**/*.browser.test.ts'],
          environment: 'node',
        },
      },
      {
        plugins: [preact()],
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.tsx'],
          exclude,
          environment: 'happy-dom',
        },
      },
      {
        test: {
          name: 'opfs',
          include: ['packages/sdk/src/**/*.browser.test.ts'],
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
