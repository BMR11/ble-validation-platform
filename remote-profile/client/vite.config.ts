import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    /** Listen on all interfaces so you can open the admin UI from a phone on the same Wi‑Fi. */
    host: true,
    /**
     * Required when using ngrok / Cloudflare Tunnel / similar: the `Host` header is the public
     * hostname, not `localhost`. Dev-only; do not rely on this for production deploys.
     */
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4050',
        changeOrigin: true,
      },
    },
  },
});
