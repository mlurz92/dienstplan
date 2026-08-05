/**
 * Narrow, tree-shakeable Floating UI surface used by the central tooltip layer.
 * The Vite library build emits a single self-hosted ESM file under /vendor.
 */
export {
  autoUpdate,
  computePosition,
  flip,
  offset,
  shift
} from '@floating-ui/dom';
