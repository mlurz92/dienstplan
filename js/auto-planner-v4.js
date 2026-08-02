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
 * Direkte API-Aufrufe aus Tests oder Integrationen erhalten eine kurze, aber
 * echte iterative Prüfung, sofern sie die Rundenzahl nicht ausdrücklich
 * festlegen. Das sichtbare Studio übergibt seine gewählten Parameter immer.
 */
export async function buildAutoPlan(parameters) {
  const supplied = parameters?.runConfig && typeof parameters.runConfig === 'object'
    ? parameters.runConfig
    : {};
  const normalized = {
    ...parameters,
    runConfig: {
      ...supplied,
      repairIterations: supplied.repairIterations ?? 2,
      localRebuildBudget: supplied.localRebuildBudget ?? 600
    }
  };
  return refreshFairnessIndex(await buildV3Plan(normalized));
}

export function applyAutoPlanProposal(parameters) {
  try {
    return applyV3Proposal(parameters);
  } catch (error) {
    if (/nach der Optimierung verändert/.test(error?.message || '')) {
      throw new Error(`${error.message} erneute Regelprüfung erforderlich.`);
    }
    throw error;
  }
}
