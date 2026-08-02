import {
  applyAutoPlanProposal as applyV3Proposal,
  buildAutoPlan as buildV3Plan
} from './auto-planner-v3.js?v=20260801.11';

export * from './auto-planner-v3.js?v=20260801.11';

function refreshFairnessIndex(result) {
  if (!result?.metrics || result.metrics.gray || result.metrics.unfilled) return result;
  const penalty = Number(result.metrics.bdTargetPenalty || 0) * 1.35
    + Number(result.metrics.combinedLoadVariance || 0) * 8
    + Number(result.metrics.aaHgVariance || 0) * 5
    + Number(result.metrics.weekendVariance || 0) * 7;
  result.metrics.fairnessIndex = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  return result;
}

/**
 * Direkte API-Aufrufe aus Tests oder Integrationen ohne Studio-Konfiguration
 * erhalten eine kurze, aber echte iterative Prüfung. Das sichtbare Studio gibt
 * seine gewählte Rundenzahl immer ausdrücklich vor.
 */
export async function buildAutoPlan(parameters) {
  const normalized = parameters?.runConfig
    ? parameters
    : {
        ...parameters,
        runConfig: {
          repairIterations: 2,
          localRebuildBudget: 600
        }
      };
  return refreshFairnessIndex(await buildV3Plan(normalized));
}

export function applyAutoPlanProposal(parameters) {
  try {
    return applyV3Proposal(parameters);
  } catch (error) {
    if (/nach der Optimierung verändert/.test(error?.message || '')) {
      throw new Error(`${error.message} Erneute Regelprüfung erforderlich.`);
    }
    throw error;
  }
}
