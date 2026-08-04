/** Proof-aware, deduplicated commentary for Auto-Plan v9 events. */
const STATUS_LABEL = Object.freeze({
  OPTIMAL: 'Optimum im kompilierten v9-Modell bewiesen',
  FEASIBLE: 'zulässige Modelllösung gefunden',
  INFEASIBLE: 'Unlösbarkeit im kompilierten v9-Modell bewiesen',
  MODEL_INVALID: 'Solvermodell ungültig',
  UNKNOWN: 'Status innerhalb des Budgets offen',
  HEURISTIC: 'lokaler heuristischer Fallback'
});

const STAGE_LABEL = Object.freeze({
  snapshot: 'Regel-Snapshot',
  compile: 'Constraint-Kompilierung',
  presolve: 'Propagation und Presolve',
  'strict-feasibility': 'Null-Rot-Machbarkeit',
  'minimal-relaxation': 'minimale Relaxierung',
  quality: 'Regelqualität',
  preferences: 'Wunscherfüllung',
  fairness: 'Fairness',
  stability: 'Planstabilität',
  robustness: 'Ausfallrobustheit',
  'exact-lns': 'Adaptive Exact-LNS',
  alternatives: 'Vorschlagsvarianten',
  explain: 'Konflikt- und Nachweisanalyse',
  audit: 'unabhängiger Browseraudit'
});

const number = value => Number(value).toLocaleString('de-DE');
const percent = value => `${(Math.max(0, Number(value) || 0) * 100).toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

export function v9CommentaryKey(update = {}) {
  return [
    update.stage || update.phase || '',
    update.eventType || '',
    update.solverStatus || update.status || '',
    update.objectiveLevel ?? '',
    update.sequence ?? '',
    update.improvements ?? '',
    update.relativeGap ?? ''
  ].join('|');
}

export function formatV9Commentary(update = {}) {
  const stage = String(update.stage || update.phase || '').toLowerCase();
  const status = String(update.solverStatus || update.status || '').toUpperCase();
  const facts = [];
  if (Number.isFinite(Number(update.objectiveValue))) facts.push(`Zielfunktionswert ${number(update.objectiveValue)}`);
  if (Number.isFinite(Number(update.bestBound))) facts.push(`Schranke ${number(update.bestBound)}`);
  if (Number.isFinite(Number(update.relativeGap))) facts.push(`Gap ${percent(update.relativeGap)}`);
  if (Number.isFinite(Number(update.branches))) facts.push(`${number(update.branches)} Branches`);
  if (Number.isFinite(Number(update.conflicts))) facts.push(`${number(update.conflicts)} Konflikte`);
  if (Number.isFinite(Number(update.deterministicTime))) facts.push(`deterministische Zeit ${Number(update.deterministicTime).toLocaleString('de-DE', { maximumFractionDigits: 2 })}`);

  if (update.remoteFallback) {
    return { kind: 'warn', text: `<b>CP-SAT-Pfad nicht verfügbar</b> · der vollständig regelgeprüfte lokale Warmstart übernimmt${update.message ? ` · ${update.message}` : ''}` };
  }
  if (stage === 'snapshot') {
    return { kind: 'phase', text: `<b>Regel-Snapshot eingefroren</b>${update.message ? ` · ${update.message}` : ''}` };
  }
  if (stage === 'strict-feasibility' && status === 'INFEASIBLE') {
    return { kind: 'blocked', text: '<b>Null-Rot-Belegung im kompilierten v9-Modell nicht möglich</b> · Konflikt- und Relaxierungsanalyse startet.' };
  }
  if (status === 'OPTIMAL') {
    return { kind: 'gain', text: `<b>${STAGE_LABEL[stage] || 'Zielstufe'} im kompilierten v9-Modell optimal bewiesen</b>${facts.length ? ` · ${facts.join(' · ')}` : ''}` };
  }
  if (status === 'FEASIBLE' && Number.isFinite(Number(update.relativeGap))) {
    return { kind: 'work', text: `<b>${STAGE_LABEL[stage] || 'Solver'} verbessert</b> · ${facts.join(' · ')}` };
  }
  if (stage === 'exact-lns' && Number(update.improvements) > 0) {
    return { kind: 'gain', text: `<b>Exact-LNS-Verbesserung ${number(update.improvements)}</b>${update.neighbourhood ? ` · ${update.neighbourhood}` : ''}${facts.length ? ` · ${facts.join(' · ')}` : ''}` };
  }
  if (stage === 'alternatives' && Number(update.alternativeCount) > 0) {
    return { kind: 'work', text: `<b>${number(update.alternativeCount)} qualitätsgebundene Varianten</b> · Mindestabstand ${number(update.minimumDistance || 0)} Zellen.` };
  }
  if (stage === 'audit') {
    return { kind: status === 'MODEL_INVALID' ? 'blocked' : 'final', text: `<b>Unabhängiger Browseraudit</b>${update.message ? ` · ${update.message}` : ''}` };
  }
  if (status && STATUS_LABEL[status]) {
    return { kind: status === 'INFEASIBLE' || status === 'MODEL_INVALID' ? 'blocked' : 'work', text: `<b>${STATUS_LABEL[status]}</b>${facts.length ? ` · ${facts.join(' · ')}` : ''}` };
  }
  if (update.message && (update.lane === 'remote-cpsat' || update.engineRevision === 9)) {
    return { kind: 'work', text: `<b>${STAGE_LABEL[stage] || 'Auto-Plan v9'}</b> · ${update.message}` };
  }
  return null;
}
