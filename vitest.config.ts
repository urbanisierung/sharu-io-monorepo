import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

const shared = {
  exclude: ['**/dist/**', '**/node_modules/**', '**/wasm/**', '**/target/**'],
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          include: ['packages/*/src/**/*.test.ts'],
          environment: 'node',
          ...shared,
        },
      },
      {
        plugins: [preact()],
        test: {
          name: 'web',
          include: ['apps/web/src/**/*.test.tsx'],
          environment: 'happy-dom',
          ...shared,
        },
      },
    ],
  },
});
