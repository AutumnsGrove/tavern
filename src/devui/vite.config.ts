import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/devui',
  server: {
    port: 7778,
    proxy: {
      '/ws': {
        target: 'ws://localhost:7777',
        ws: true,
      },
    },
  },
  build: { outDir: '../../dist/devui' },
});
