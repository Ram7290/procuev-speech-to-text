import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: browser talks to Vite (:5173); /api and /ws are proxied to Express (:8080).
// Prod: `vite build` output is served by Express itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
