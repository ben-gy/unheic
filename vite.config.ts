// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Ben Richardson — https://benrichardson.dev
// Additional terms under AGPL-3.0 section 7(b) apply; see ADDITIONAL-TERMS.md.
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon-32.png', 'favicon-16.png', 'apple-touch-icon.png', 'robots.txt'],
      manifest: {
        name: 'unHEIC — HEIC to JPG converter',
        short_name: 'unHEIC',
        description: 'Convert iPhone HEIC & HEIF photos to JPG, PNG or WebP in your browser.',
        id: '/',
        start_url: '/',
        scope: '/',
        theme_color: '#4f46e5',
        background_color: '#faf7f2',
        display: 'standalone',
        orientation: 'any',
        categories: ['photo', 'utilities', 'graphics'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Precache the app shell, icons and the demo sample. The libheif WASM is
        // large and served/HTTP-cached on demand, so it is kept OUT of precache.
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,heic}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
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
