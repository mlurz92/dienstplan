/**
 * Auto-Plan v6 – strikt vor bestätigungspflichtigem Fallback.
 *
 * Die bestehende Regelengine bleibt die einzige fachliche Wahrheitsquelle.
 * Diese Schicht verändert keine Regel, sondern orchestriert die Suchprofile:
 *
 * 1. reguläre Null-Rot-Profile,
 * 2. verbreiterte Null-Rot-Rescue mit größerem Beam, Kandidatenfächer und
 *    Backtracking-Budget,
 * 3. erst danach – sofern ausdrücklich erlaubt – der Minimal-Rot-Fallback.
 *
 * Gleichzeitig werden abgeleitete personengebundene Standardgrenzen vollständig
 * in den Lauf eingespeist. Dadurch bleibt insbesondere die HG-Grenze 0 für
 * Personen ohne datumsabhängige HG-Qualifikation auch bei partiellen API-
 * Konfigurationen erhalten.
 */

import * as V5 from './auto-planner-v5.js?v=20260803.5';

export * from './auto-planner-v5.js?v=20260803.5';

const STRICT_PROFILES = Object.freeze(['strict-balanced', 'strict-coverage']);
const CONFIRMABLE_PROFILE = 'confirmable-balanced';
const RESCUE_PRESETS = Object.freeze({
  standard: { beamWidth: 26, branchLimit: 14, exactBudget: 32000 },
  deep: { beamWidth: 40, branchLimit: 18, exactBudget: 72000 },
  maximum: { beamWidth: 56, branchLimit: 24, exactBudget: 150000 }
});

const clone = value => typeof structuredClone === 'function'
  ? structuredClone(value)
  : JSON.parse(JSON.stringify(value));

function explicitProfileFilter(runConfig) {
  return Array.isArray(runConfig?.profileFilter)
    ? runConfig.profileFilter.filter(Boolean)
    : [];
}

function isClean(result) {
  return Boolean(result?.complete)
    && Number(result?.metrics?.unfilled || 0) === 0
    && Number(result?.metrics?.gray || 0) === 0
    && Number(result?.metrics?.red || 0) === 0;
}

function isBetter(candidate, incumbent) {
  if (!incumbent) return Boolean(candidate);
  if (!candidate) return false;
  if (candidate.complete !== incumbent.complete) return Boolean(candidate.complete);
  const left = Array.isArray(candidate.objectiveKey) ? candidate.objectiveKey : [];
  const right = Array.isArray(incumbent.objectiveKey) ? incumbent.objectiveKey : [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = Number(left[index] || 0);
    const b = Number(right[index] || 0);
    if (Math.abs(a - b) > 1e-9) return a < b;
  }
  return false;
}

/**
 * Ergänzt eine partielle Laufkonfiguration um die abgeleiteten Standardgrenzen.
 *
 * Ein ausdrücklich gesetztes `null` bleibt unbegrenzt. Nur `undefined` bedeutet:
 * den fachlich abgeleiteten Standard verwenden.
 */
export function mergeAutoPlanRunConfig(state, monthData, input = null) {
  const source = input && typeof input === 'object' ? clone(input) : {};
  const defaults = V5.createDefaultAutoPlanConfig(state, monthData);
  const staffLimits = {};

  for (const [staffId, fallback] of Object.entries(defaults.staffLimits || {})) {
    const supplied = source.staffLimits?.[staffId] || {};
    staffLimits[staffId] = {
      maxBd: supplied.maxBd === undefined ? fallback.maxBd ?? null : supplied.maxBd,
      maxHg: supplied.maxHg === undefined ? fallback.maxHg ?? null : supplied.maxHg,
      maxTotal: supplied.maxTotal === undefined ? fallback.maxTotal ?? null : supplied.maxTotal
    };
  }

  return {
    ...source,
    searchIntensity: source.searchIntensity ?? defaults.searchIntensity,
    optimizationFocus: source.optimizationFocus ?? defaults.optimizationFocus,
    allowRedFallback: source.allowRedFallback ?? defaults.allowRedFallback,
    maxRedViolations: source.maxRedViolations === undefined
      ? defaults.maxRedViolations
      : source.maxRedViolations,
    staffLimits
  };
}

/** Öffentliche Normalisierung einschließlich aller abgeleiteten Grenzen. */
export function normalizeAutoPlanConfig(state, monthData, input = null) {
  return V5.normalizeAutoPlanConfig(state, monthData, mergeAutoPlanRunConfig(state, monthData, input));
}

/** Öffentliche Validierung einschließlich aller abgeleiteten Grenzen. */
export function validateAutoPlanConfig(state, monthData, input = null) {
  return V5.validateAutoPlanConfig(state, monthData, mergeAutoPlanRunConfig(state, monthData, input));
}

export function zeroRedRescueProfiles() {
  return [...STRICT_PROFILES];
}

export function shouldRunZeroRedRescue(result, runConfig = null) {
  if (runConfig?.zeroRedRescue === false) return false;
  return !isClean(result);
}

function rescuePreset(runConfig) {
  return RESCUE_PRESETS[runConfig?.searchIntensity] || RESCUE_PRESETS.deep;
}

function annotateRescue(result, { attempted, succeeded, elapsedMs = 0, base = null } = {}) {
  if (!result) return result;
  result.algorithmRevision = 6;
  result.metrics ||= {};
  result.metrics.zeroRedRescue = {
    attempted: Boolean(attempted),
    succeeded: Boolean(succeeded),
    elapsedMs: Math.max(0, Math.round(Number(elapsedMs) || 0)),
    avoidedRed: Boolean(succeeded && Number(base?.metrics?.red || 0) > 0),
    priorRed: Number(base?.metrics?.red || 0),
    priorUnfilled: Number(base?.metrics?.unfilled || 0)
  };
  if (attempted) {
    const suffix = succeeded ? ' · Null-Rot-Rescue erfolgreich' : ' · Null-Rot-Rescue geprüft';
    if (!String(result.searchProfile || '').includes('Null-Rot-Rescue')) {
      result.searchProfile = `${result.searchProfile || 'Auto-Plan'}${suffix}`;
    }
  }
  return result;
}

async function runConstruction(parameters, runConfig, profileFilter, overrides = null, progressPrefix = '') {
  const onProgress = typeof parameters?.onProgress === 'function'
    ? async update => parameters.onProgress({
      ...update,
      message: progressPrefix && update?.message
        ? `${progressPrefix} · ${update.message}`
        : update?.message
    })
    : undefined;

  return V5.constructAutoPlan({
    ...parameters,
    ...(overrides || {}),
    runConfig: { ...runConfig, profileFilter },
    onProgress
  });
}

/**
 * Konstruktion mit strikter Eskalationsreihenfolge.
 *
 * Bei paralleler Ausführung wird das bisherige Fallback-Profil als
 * Koordinationsstrang verwendet: Es versucht zuerst die verbreiterte strikte
 * Rescue und darf erst bei deren Scheitern rot bestätigen. Die beiden regulären
 * strikten Profile laufen zeitgleich in den übrigen Arbeitssträngen.
 */
export async function constructAutoPlan(parameters) {
  const fullConfig = mergeAutoPlanRunConfig(parameters.state, parameters.monthData, parameters.runConfig);
  const requested = explicitProfileFilter(fullConfig);
  if (fullConfig.zeroRedRescue === false) {
    return annotateRescue(
      await runConstruction(parameters, fullConfig, requested.length ? requested : undefined),
      { attempted: false, succeeded: false }
    );
  }
  const confirmableOnly = requested.length === 1 && requested[0] === CONFIRMABLE_PROFILE;
  const unrestricted = requested.length === 0;

  if (!confirmableOnly && !unrestricted) {
    return annotateRescue(
      await runConstruction(parameters, fullConfig, requested),
      { attempted: false, succeeded: false }
    );
  }

  let incumbent = null;

  if (unrestricted) {
    incumbent = await runConstruction(parameters, fullConfig, STRICT_PROFILES);
    if (isClean(incumbent)) return annotateRescue(incumbent, { attempted: false, succeeded: false });
  }

  const rescueStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const preset = rescuePreset(fullConfig);
  await parameters.onProgress?.({
    phase: 'propagate',
    progress: .36,
    stage: 'null-rot-rescue',
    message: 'Null-Rot-Rescue startet · Suchstrahl, Kandidatenfächer und Backtracking werden adaptiv verbreitert',
    zeroRedRescue: true
  });

  const beforeRescue = incumbent;
  const rescue = await runConstruction(
    parameters,
    fullConfig,
    ['strict-coverage'],
    preset,
    'Null-Rot-Rescue'
  );
  const rescueElapsed = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - rescueStarted;
  if (isBetter(rescue, incumbent)) incumbent = rescue;
  if (isClean(rescue)) {
    return annotateRescue(rescue, {
      attempted: true,
      succeeded: true,
      elapsedMs: rescueElapsed,
      base: beforeRescue
    });
  }

  if (fullConfig.allowRedFallback !== true) {
    return annotateRescue(incumbent || rescue, {
      attempted: true,
      succeeded: false,
      elapsedMs: rescueElapsed,
      base: incumbent
    });
  }

  await parameters.onProgress?.({
    phase: 'repair',
    progress: .48,
    stage: 'minimal-red-fallback',
    message: 'Alle strikten Null-Rot-Stufen ausgeschöpft · Minimal-Rot-Fallback wird als letzte Eskalation geprüft',
    zeroRedRescue: true
  });

  const fallback = await runConstruction(
    parameters,
    fullConfig,
    [CONFIRMABLE_PROFILE],
    null,
    'Minimal-Rot-Fallback'
  );
  if (isBetter(fallback, incumbent)) incumbent = fallback;
  return annotateRescue(incumbent || fallback, {
    attempted: true,
    succeeded: false,
    elapsedMs: rescueElapsed,
    base: rescue
  });
}

export async function buildAutoPlan(parameters) {
  const constructed = await constructAutoPlan(parameters);
  return V5.perfectAutoPlan({ ...parameters, constructed });
}
