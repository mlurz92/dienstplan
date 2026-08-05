import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

export default defineConfig({
  server: {
    headers: isolationHeaders
  },
  preview: {
    headers: isolationHeaders
  },
  build: {
    target: 'es2022',
    outDir: resolve(root, 'vendor/floating-ui'),
    emptyOutDir: false,
    sourcemap: false,
    minify: true,
    lib: {
      entry: resolve(root, 'js/floating-ui-vendor-entry.ts'),
      formats: ['es'],
      fileName: () => 'floating-ui-dom.js'
    },
    rolldownOptions: {
      output: {
        codeSplitting: false,
        entryFileNames: 'floating-ui-dom.js'
      }
    }
  }
});
