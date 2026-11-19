import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ['.us3.manus.computer'],
  },
  preview: {
    allowedHosts: ['.us3.manus.computer'],
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/three/')) return 'three-vendor';
          if (id.includes('/node_modules/react') || id.includes('/node_modules/scheduler/')) return 'react-vendor';
        },
      },
    },
  },
});
