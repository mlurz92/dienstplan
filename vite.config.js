import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
};

function libraryBuild({ entry, outDir, fileName, inlineDynamicImports = false }) {
  return {
    optimizeDeps: {
      include: ['protobufjs'],
      exclude: ['or-tools-wasm']
    },
    worker: {
      format: 'es'
    },
    server: {
      headers: isolationHeaders
    },
    preview: {
      headers: isolationHeaders
    },
    build: {
      target: 'es2022',
      outDir: resolve(root, outDir),
      emptyOutDir: false,
      sourcemap: false,
      minify: true,
      assetsDir: 'assets',
      lib: {
        entry: resolve(root, entry),
        formats: ['es'],
        fileName: () => fileName
      },
      rolldownOptions: {
        output: {
          ...(inlineDynamicImports ? { inlineDynamicImports: true } : {}),
          entryFileNames: fileName,
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      }
    }
  };
}

export default defineConfig(({ mode }) => mode === 'solver'
  ? libraryBuild({
      entry: 'js/or-tools-vendor-entry.ts',
      outDir: 'vendor/or-tools-wasm',
      fileName: 'cp-sat.js'
    })
  : libraryBuild({
      entry: 'js/floating-ui-vendor-entry.ts',
      outDir: 'vendor/floating-ui',
      fileName: 'floating-ui-dom.js',
      inlineDynamicImports: true
    }));
