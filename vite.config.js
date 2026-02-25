import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'data',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'flowers.html',
    },
  },
  server: {
    port: 3000,
    open: '/flowers.html',
  },
});
