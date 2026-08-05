/**
 * Self-hosted OR-Tools CP-SAT entry for the browser worker runtime.
 * Vite follows the package's worker and WebAssembly imports and emits all
 * required assets under /vendor/or-tools-wasm.
 */
export {
  CpModel,
  CpSolver
} from 'or-tools-wasm/cp-sat';
