import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * Build fuer die Offline-Fassung.
 *
 * Ziel ist eine einzige HTML-Datei, die sich per Doppelklick oeffnen laesst.
 * Dafuer darf es weder Module noch nachgeladene Dateien geben: Browser
 * verweigern ueber "file://" jeden Modul-Import und jeden fetch-Aufruf.
 * Deshalb wird als IIFE gebaut, jede dynamische Einbindung eingebettet und
 * alles anschliessend von tools/build_offline.mjs in die HTML-Datei gezogen.
 */
export default defineConfig({
  root: '.',
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@data': fileURLToPath(new URL('./data', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist-offline',
    sourcemap: false,
    cssCodeSplit: false,
    // Alles einbetten, damit keine Datei separat geladen werden muss.
    assetsInlineLimit: 1024 * 1024 * 64,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'aetheria.js',
        assetFileNames: 'aetheria.[ext]',
      },
    },
  },
});
