import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = '/whats-for-dinner/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*'],
      manifest: {
        name: "What's for Dinner?",
        short_name: 'WFD',
        description: 'Plan the week, keep your recipes and share the shopping list.',
        lang: 'en-AU',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        share_target: { action: base, method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        background_color: '#fbf7f0',
        theme_color: '#fbf7f0',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: `${base}index.html`,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Text recognition files are large; cache them the first time a photo is read instead.
        globIgnores: ['ocr/**'],
        runtimeCaching: [
          {
            urlPattern: /\/whats-for-dinner\/ocr\//,
            handler: 'CacheFirst',
            options: { cacheName: 'ocr', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } }
          }
        ]
      }
    })
  ]
});
