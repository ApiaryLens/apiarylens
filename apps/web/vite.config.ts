import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative shell assets allow the same immutable build to launch at `/` or
  // beneath a deployment prefix such as `/app/`.
  base: './',
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://127.0.0.1:3000', '/health': 'http://127.0.0.1:3000' },
  },
  build: { sourcemap: true },
});
