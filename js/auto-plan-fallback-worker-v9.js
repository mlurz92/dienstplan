/** Auto-Plan v9 – isolierter v8.5-Warmstart und Offlinefallback. */
import { buildAutoPlan } from './auto-planner-v8-5.js?v=20260803.4';

function stripResult(update) {
  if (!update || update.result === undefined) return update;
  const { result: _ignored, ...rest } = update;
  return rest;
}

self.addEventListener('message', async event => {
  const request = event.data;
  if (!request || request.type !== 'run') return;
  try {
    const result = await buildAutoPlan({
      state: request.state,
      monthData: request.monthData,
      year: request.year,
      month: request.month,
      runConfig: {
        ...(request.runConfig || {}),
        // Der lokale Pfad bleibt ein belastbarer Warmstart und Fallback. Das
        // Remotezeitbudget wird nicht zusätzlich vollständig im Browser
        // verbraucht, sofern der Nutzer kein reines Offlineprofil gewählt hat.
        timeBudgetMs: Math.max(10_000, Math.min(
          Number(request.runConfig?.timeBudgetMs || 60_000),
          Number(request.localBudgetMs || 45_000)
        )),
        seedSalt: Number(request.seedSalt || 0)
      },
      onProgress: update => self.postMessage({ type: 'progress', update: stripResult(update) })
    });
    result.algorithmRevision = 9;
    result.engineRevision = 9;
    result.metrics ||= {};
    result.metrics.engine = 'v9-local-v85-fallback';
    result.metrics.solverStatus = 'HEURISTIC';
    result.metrics.remoteSolver = false;
    result.certified = false;
    result.searchProfile = `Auto-Plan v9 · lokaler v8.5-Warmstart${result.searchProfile ? ` · ${result.searchProfile}` : ''}`;
    self.postMessage({ type: 'done', result });
  } catch (error) {
    self.postMessage({
      type: 'error',
      name: error?.name || 'Error',
      message: error?.message || 'Lokaler Auto-Plan-Fallback fehlgeschlagen.'
    });
  }
});
