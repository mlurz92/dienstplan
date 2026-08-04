/**
 * Produktiver Auto-Plan-Einstieg mit v9-Ergebnisversiegelung.
 *
 * Die exakte v9-Suche kann einen besseren Plan als den v8.5-Incumbent liefern.
 * Ein solcher Plan besitzt zunächst nur den exakten Ergebnisvertrag. Vor der
 * Vorschau werden deshalb die unveränderten Integritätsmetadaten der heuristischen
 * Pipeline übernommen und sämtliche Fingerabdrücke auf dem tatsächlich
 * ausgewählten Endplan neu gebildet. Die Übernahmeprüfung bleibt dadurch
 * vollständig aktiv; sie wird weder umgangen noch abgeschwächt.
 */
import * as V9 from './auto-planner-v9.js?v=20260804.9';

export * from './auto-planner-v9.js?v=20260804.9';

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
}

const stableFingerprint = value => JSON.stringify(stableValue(value));

/**
 * Versiegelt den final ausgewählten v9-Plan für die bestehende mehrstufige
 * Übernahmeprüfung.
 *
 * Exakte Resultate erben nur Lauf- und Telemetriemetadaten vom vollständig
 * ausgeführten Incumbent. Plan, Audit, Zielfunktion und Solverstatus stammen
 * weiterhin ausschließlich aus dem exakten Resultat. Anschließend werden alle
 * Fingerabdrücke auf dem finalen Zustand neu berechnet.
 */
export function sealV9ProposalIntegrity(result, incumbent, state, requestedRunConfig = null) {
  if (!result?.complete || !result?.baseline) return result;

  if (incumbent && incumbent !== result) {
    result.metrics = {
      ...clone(incumbent.metrics || {}),
      ...clone(result.metrics || {})
    };
    result.elapsedMs = Number(incumbent.elapsedMs || 0) + Number(result.elapsedMs || 0);
  }

  if (!state) return result;
  const runConfig = V9.normalizeAutoPlanConfig(
    state,
    result.baseline,
    requestedRunConfig || result.runConfig
  );
  result.runConfig = clone(runConfig);
  result.runConfigFingerprint = V9.autoPlanConfigFingerprint(runConfig);

  const iterativeConfig = result.iterativeConfig || incumbent?.iterativeConfig;
  if (iterativeConfig) {
    result.iterativeConfig = clone(iterativeConfig);
    result.iterativeConfigFingerprint = stableFingerprint(result.iterativeConfig);
  }

  const optimizerConfig = result.optimizerConfig || incumbent?.optimizerConfig;
  if (optimizerConfig) {
    result.optimizerConfig = clone(optimizerConfig);
    result.optimizerConfigFingerprint = typeof V9.optimizerFingerprint === 'function'
      ? V9.optimizerFingerprint(result.optimizerConfig)
      : stableFingerprint(result.optimizerConfig);
  }

  for (const property of ['optimizerRevision', 'qualityRevision', 'executionConfig']) {
    if (result[property] === undefined && incumbent?.[property] !== undefined) {
      result[property] = clone(incumbent[property]);
    }
  }

  result.proposalFingerprint = stableFingerprint({
    baselineFingerprint: result.baselineFingerprint,
    runConfigFingerprint: result.runConfigFingerprint,
    iterativeConfigFingerprint: result.iterativeConfigFingerprint,
    changes: result.changes
  });
  return result;
}

export async function constructAutoPlan(parameters) {
  return V9.constructAutoPlan(parameters);
}

export async function perfectAutoPlan(parameters) {
  const result = await V9.perfectAutoPlan(parameters);
  return sealV9ProposalIntegrity(
    result,
    parameters?.constructed || null,
    parameters?.state,
    parameters?.runConfig || null
  );
}

export async function buildAutoPlan(parameters) {
  const constructed = await constructAutoPlan(parameters);
  return perfectAutoPlan({ ...parameters, constructed });
}

export function applyAutoPlanProposal(parameters) {
  return V9.applyAutoPlanProposal(parameters);
}
