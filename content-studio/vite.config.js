import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({ plugins: [react()], resolve: { alias: { '@veylo-motion': fileURLToPath(new URL('../client/src/utils/motionPolicy.js', import.meta.url)) } }, server: { host: '127.0.0.1', port: 5057, strictPort: true, proxy: { '/api': 'http://127.0.0.1:5056' }, fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } }, build: { sourcemap: false } });
