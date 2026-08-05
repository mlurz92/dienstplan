/**
 * Kleine, reine Budgetentscheidung der v7.5-Visualisierung.
 *
 * Die Animation konkurriert nie ungebremst mit dem Solver. Sie startet bei
 * höchstens rund 30 Bildern pro Sekunde und reduziert Takt sowie Partikeldichte,
 * sobald ihre gemessenen Frames teurer werden.
 */
export function renderPolicyFor({
  active = true,
  visible = true,
  reduced = false,
  finished = false,
  averageFrameMs = 0
} = {}) {
  if (!active) return { continuous: false, frameIntervalMs: null, detail: 0, sparkLimit: 0, mode: 'stopped' };
  if (!visible) return { continuous: false, frameIntervalMs: null, detail: .25, sparkLimit: 0, mode: 'hidden' };
  if (reduced) return { continuous: false, frameIntervalMs: null, detail: .4, sparkLimit: 0, mode: 'reduced' };
  if (finished) return { continuous: false, frameIntervalMs: null, detail: .7, sparkLimit: 0, mode: 'finished' };

  const cost = Math.max(0, Number(averageFrameMs) || 0);
  if (cost > 12) return { continuous: true, frameIntervalMs: 67, detail: .45, sparkLimit: 24, mode: 'constrained' };
  if (cost > 8) return { continuous: true, frameIntervalMs: 50, detail: .72, sparkLimit: 80, mode: 'balanced' };
  return { continuous: true, frameIntervalMs: 33, detail: 1, sparkLimit: 160, mode: 'full' };
}
