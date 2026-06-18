import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// `@preact/preset-vite` aliases react/react-dom → preact/compat so Cascivo's
// React-typed components run under Preact (plan §0).
export default defineConfig({
  plugins: [preact()],
});
