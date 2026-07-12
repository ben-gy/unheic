import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'unHEIC — HEIC to JPG converter',
        short_name: 'unHEIC',
        description: 'Convert iPhone HEIC & HEIF photos to JPG, PNG or WebP in your browser.',
        theme_color: '#4f46e5',
        background_color: '#faf7f2',
        display: 'standalone',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    exclude: ['libheif-js'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
