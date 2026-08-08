import { defineConfig } from 'vite';

// Production configuration for GitHub Pages / static hosting
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1000
  }
});
