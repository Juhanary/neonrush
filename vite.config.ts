import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 inlines everything into one HTML file (handy for sharing a playable build).
export default defineConfig({
  base: './',
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
