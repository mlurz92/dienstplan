import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

export default defineConfig({
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
        inlineDynamicImports: true,
        entryFileNames: 'floating-ui-dom.js'
      }
    }
  }
});
