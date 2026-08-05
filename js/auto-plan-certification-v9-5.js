/**
 * Auto-Plan v9.5 – konservatives End-Gate für Modellnachweise.
 *
 * CP-SAT beweist ausschließlich die Lösung, die aus der vollständig optimalen
 * lexikografischen Phasenkette stammt. Ersetzt eine nachgelagerte LNS- oder
 * Heuristikrunde diesen Incumbent, darf der Nachweis nicht auf den neuen Plan
 * übertragen werden. Diese Schicht kann Aussagen deshalb nur herabstufen,
 * niemals nachträglich aufwerten.
 */

export const V95_CERTIFIED_SOURCE = 'cp-sat-v9.5';
export const V95_CERTIFICATION_GUARD_RELEASE = '20260805.2';

function phaseTraceIsProven(result) {
  const trace = result?.metrics?.cpSat?.trace;
  return Array.isArray(trace)
    && trace.length > 0
    && trace.every(phase => phase?.proven === true && String(phase?.status || '').toUpperCase() === 'OPTIMAL');
}

function proofInvalidationReason(result, certification) {
  if (certification?.source !== V95_CERTIFIED_SOURCE) return 'selected-plan-not-original-optimal-incumbent';
  if (result?.metrics?.cpSatUsed !== true) return 'cp-sat-plan-not-selected';
  if (result?.complete !== true) return 'selected-plan-incomplete';
  if (Number(result?.metrics?.red || 0) !== 0) return 'selected-plan-has-red-exceptions';
  if (certification?.auditPassed !== true) return 'rule-engine-audit-not-passed';
  if (certification?.allPhasesOptimal !== true || !phaseTraceIsProven(result)) return 'lexicographic-proof-incomplete';
  return null;
}

/**
 * Normalisiert den Nachweisstatus in-place, damit Worker, Runtime-Adapter und UI
 * exakt dasselbe Ergebnisobjekt sehen. Ein bereits nicht bewiesener Vorschlag
 * bleibt nicht bewiesen. Ein konsistenter Original-CP-SAT-Nachweis bleibt
 * unverändert erhalten.
 */
export function reconcileV95Certification(result) {
  if (!result || typeof result !== 'object') return result;
  const metrics = result.metrics && typeof result.metrics === 'object' ? result.metrics : null;
  const certification = metrics?.certification || result.certification;
  if (!certification || typeof certification !== 'object') {
    result.certified = false;
    return result;
  }

  const claimed = certification.proven === true || result.certified === true;
  const reason = claimed ? proofInvalidationReason(result, certification) : null;
  if (!claimed || reason === null) {
    result.certified = claimed;
    result.certification = certification;
    if (metrics) metrics.certification = certification;
    return result;
  }

  const corrected = {
    ...certification,
    status: 'BEST_FOUND_FEASIBLE',
    proven: false,
    scope: 'none',
    allPhasesOptimal: false,
    upstreamStatus: certification.status || null,
    upstreamAllPhasesOptimal: certification.allPhasesOptimal === true,
    proofInvalidatedBy: reason
  };
  result.certified = false;
  result.certification = corrected;
  if (metrics) metrics.certification = corrected;
  return result;
}
