/**
 * Cloudflare-Pages-compatible local entry for the pinned free CP-SAT runtime.
 *
 * The upstream or-tools-wasm package contains multiple embedded WebAssembly
 * variants whose generated browser assets exceed Cloudflare Pages' 25 MiB
 * per-file limit. This tiny local ESM bridge keeps a stable same-origin entry
 * while the browser resolves the exact immutable package version from
 * jsDelivr. The v9.5 loader validates the resulting API with a binary self-test
 * before any planning model is solved.
 */
export * from 'https://cdn.jsdelivr.net/npm/or-tools-wasm@0.9.1/cp-sat/+esm';
