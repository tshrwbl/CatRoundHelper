import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // GitHub project pages are served below the repository name. Vite applies
  // this base to built JS/CSS assets; db.js uses the same value for SQLite.
  base: '/CatRoundHelper/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'CAP Compass',
        short_name: 'CAP Compass',
        description: 'Offline Maharashtra engineering cutoff explorer.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        // Workbox otherwise precaches only JS, CSS, and HTML. The explicit
        // SQLite/WASM entries are what make an already-opened dashboard work
        // offline after a normal refresh.
        globPatterns: ['**/*.{js,css,html,wasm,sqlite,png,ico}'],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  // The SQLite package uses import.meta.url to find sqlite3.wasm. Excluding it
  // from Vite's dependency prebundle preserves that supported loading path.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
})
