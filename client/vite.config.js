import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { privateSourceMaps, buildRevision, privateMapsEnabled } from './scripts/private-source-maps.mjs';
import { posthogSourceMaps } from './scripts/posthog-source-maps.mjs';

export default defineConfig({
  plugins: [react(), posthogSourceMaps(), privateSourceMaps()],
  define: { 'import.meta.env.VITE_APP_REVISION': JSON.stringify(buildRevision()) },
  build: { sourcemap: privateMapsEnabled() ? 'hidden' : false },
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  optimizeDeps: {
    // Build the React dependency graph together before serving the first page.
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-router-dom',
      'framer-motion',
      'lucide-react',
      'react-toastify',
      'axios'
    ]
  },
  server: {
    port: 5173,
    headers: {
      'Cache-Control': 'no-store'
    }
  }
});
