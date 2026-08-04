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

/**
 * Explizite Re-Export-Liste statt `export *`.
 *
 * `export *` würde bei ES-Modulen von lokal definierten Exporten desselben
 * Namens überschattet werden – lautlos und ohne Warnung. Da dieses Modul weiter
 * unten eigene Implementierungen von `buildAutoPlan`, `constructAutoPlan`
 * und `perfectAutoPlan` definiert, wird die v9-Fassung von `buildAutoPlan`
 * hier bewusst nicht weitergereicht. Wird sie intern benötigt, steht sie über
 * `V9.buildAutoPlan` zur Verfügung, ohne die Integritätsversiegelung
 * (`sealV9ProposalIntegrity`) zu umgehen.
 *
 * Wichtig: Eine explizite Liste schützt zuverlässig vor dem *Entfernen* oder
 * *Umbenennen* von Exporten in auto-planner-v9.js (das führt sofort zu einem
 * Bezugsfehler statt zu stillschweigendem Shadowing) – sie schützt aber NICHT
 * davor, dass ein *neuer* Export in auto-planner-v9.js hinzugefügt wird. In
 * diesem Fall würde `export *` den neuen Export automatisch mitziehen,
 * während die explizite Liste ihn lautlos unterschlägt und er über dieses
 * Modul für sämtliche Konsumenten (auto-plan-runner.js, auto-plan-worker.js,
 * auto-plan-studio-v5.js sowie alle tests/auto-plan*.test.js) unerreichbar
 * bliebe. tests/auto-planner-v9-export-parity.test.js prüft deshalb bei jedem
 * Testlauf, dass jeder Export von auto-planner-v9.js entweder unter seinem
 * Originalnamen re-exportiert oder hier bewusst lokal überschrieben ist, und
 * schlägt fehl, sobald ein neuer v9-Export nicht angebunden wurde.
 */
export {
  AUTO_PLAN_ENGINE_ID,
  AUTO_PLAN_REVISION,
  AUTO_PLAN_STAGES,
  NATIVE_JS_EXACT_MRV_DFS_SOLVER_NAME,
  V9_SOLVER_STATUSES,
  autoPlanConfigFingerprint,
  createDefaultAutoPlanConfig,
  deriveV85Tuning,
  deriveV9Tuning,
  fingerprintMonth,
  mapHeuristicProgress,
  mergeAutoPlanRunConfig,
  normalizeAutoPlanConfig,
  optimizerDefaults,
  optimizerFingerprint,
  planningFingerprint,
  shouldRunZeroRedRescue,
  solveExactly,
  validateAutoPlanConfig,
  zeroRedRescueProfiles,
} from './auto-planner-v9.js?v=20260804.9';

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
