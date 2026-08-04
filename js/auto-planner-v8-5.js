import * as V8 from './auto-planner-v8.js?v=20260803.4';

export * from './auto-planner-v8.js?v=20260803.4';

export const AUTO_PLAN_REVISION = 8.5;
export const AUTO_PLAN_ENGINE_ID = 'v8.5-exhaustive-clean-escalation';
export const AUTO_PLAN_STAGES = Object.freeze([
  Object.freeze({ id: 'analysis', title: 'Fixpunkte und Domänen', detail: 'Fixpunkte, Laufgrenzen, Qualifikationen und erfüllbare Wünsche werden vollständig katalogisiert.' }),
  Object.freeze({ id: 'construct', title: 'Constraint-Konstruktion', detail: 'Das vollständige Profilportfolio baut unabhängige Startlösungen mit Vorwärts-Checking.' }),
  Object.freeze({ id: 'rescue', title: 'Null-Rot-Intensivierung', detail: 'Strikte Eskalationswellen verbreitern Suchstrahl, Kandidatenfächer und exaktes Restbacktracking.' }),
  Object.freeze({ id: 'repair', title: 'Iterative Tauschreparatur', detail: 'Einzelzüge, Paare, Dreierketten, Tagespakete und lokale Neuplanung glätten den besten Aufbau.' }),
  Object.freeze({ id: 'perfect', title: 'Adaptive ALNS-Perfektion', detail: 'Diversifizierte Ruin-and-Recreate-Stränge lernen Zerstörungs- und Wiederaufbauoperatoren online.' }),
  Object.freeze({ id: 'certify', title: 'Vollständiger Nachweis', detail: 'Einzelumsetzungen, Paartausche und Tagespakete werden ohne Abkürzung bis zum stabilen Endzustand geprüft.' })
]);

const STRICT_PROFILES = Object.freeze(['strict-balanced', 'strict-coverage']);
const CONFIRMABLE_PROFILE = 'confirmable-balanced';
const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
};

export function deriveV85Tuning(source = {}) {
  const repair = clamp(source.repairIterations, 0, 30, 6);
  const local = clamp(source.localRebuildBudget, 200, 12000, 6500);
  const rounds = Math.ceil(Math.max(2, repair) / 2);
  const strength = Math.round(100 + (local - 200) / 11800 * 150);
  const aggressiveness = repair >= 8 || local >= 8500
    ? 'exhaustive'
    : repair >= 6 || local >= 5200 ? 'intensive' : 'balanced';
  return {
    strictEscalationRounds: source.strictEscalationRounds === undefined
      ? clamp(rounds, 1, 4, 3)
      : clamp(source.strictEscalationRounds, 1, 4, 3),
    rescueStrength: source.rescueStrength === undefined
      ? clamp(strength, 100, 250, 160)
      : clamp(source.rescueStrength, 100, 250, 160),
    repairAggressiveness: ['balanced', 'intensive', 'exhaustive'].includes(source.repairAggressiveness)
      ? source.repairAggressiveness
      : aggressiveness
  };
}

function settingsOf(parameters) {
  return {
    ...(parameters?.state?.settings?.autoPlan || {}),
    ...(parameters?.runConfig || {})
  };
}

function enrichedRunConfig(parameters) {
  const source = { ...(parameters?.runConfig || {}) };
  const tuning = deriveV85Tuning(settingsOf(parameters));
  const repairFloor = tuning.repairAggressiveness === 'exhaustive' ? 8 : tuning.repairAggressiveness === 'intensive' ? 6 : 4;
  const localFloor = tuning.repairAggressiveness === 'exhaustive' ? 9000 : tuning.repairAggressiveness === 'intensive' ? 6000 : 3200;
  return {
    ...source,
    // Das Studio hält diesen Wert unveränderlich auf true. Explizite verkürzte
    // Test-/API-Verträge dürfen ihre bewusste Abschaltung weiter verwenden.
    perfectionEnabled: source.perfectionEnabled !== false,
    certificationRounds: Math.max(2, clamp(source.certificationRounds, 1, 8, 4)),
    repairIterations: Math.max(repairFloor, clamp(source.repairIterations, 0, 30, repairFloor)),
    localRebuildBudget: Math.max(localFloor, clamp(source.localRebuildBudget, 200, 12000, localFloor)),
    ...tuning
  };
}

const clean = result => Boolean(result?.complete)
  && Number(result?.metrics?.unfilled || 0) === 0
  && Number(result?.metrics?.gray || 0) === 0
  && Number(result?.metrics?.red || 0) === 0;

function better(candidate, incumbent) {
  if (!incumbent) return candidate;
  if (!candidate) return incumbent;
  if (candidate.complete !== incumbent.complete) return candidate.complete ? candidate : incumbent;
  const left = Array.isArray(candidate.objectiveKey) ? candidate.objectiveKey : [];
  const right = Array.isArray(incumbent.objectiveKey) ? incumbent.objectiveKey : [];
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = Number(left[index] || 0) - Number(right[index] || 0);
    if (Math.abs(difference) > 1e-9) return difference < 0 ? candidate : incumbent;
  }
  return incumbent;
}

function wavePresets(intensity, strength, count) {
  const base = intensity === 'maximum'
    ? { beamWidth: 68, branchLimit: 27, exactBudget: 230000 }
    : intensity === 'standard'
      ? { beamWidth: 34, branchLimit: 15, exactBudget: 52000 }
      : { beamWidth: 50, branchLimit: 21, exactBudget: 110000 };
  const multiplier = strength / 100;
  return Array.from({ length: count }, (_, index) => {
    const growth = 1 + index * .34;
    return {
      beamWidth: Math.min(128, Math.round(base.beamWidth * multiplier * growth)),
      branchLimit: Math.min(40, Math.round(base.branchLimit * Math.sqrt(multiplier * growth))),
      exactBudget: Math.min(800000, Math.round(base.exactBudget * multiplier * growth * growth))
    };
  });
}

function requestedProfiles(config) {
  return Array.isArray(config?.profileFilter) ? config.profileFilter.filter(Boolean) : [];
}

function strictProfiles(config) {
  const requested = requestedProfiles(config).filter(id => id !== CONFIRMABLE_PROFILE);
  return requested.length ? requested : [...STRICT_PROFILES];
}

function fallbackRequested(config) {
  const requested = requestedProfiles(config);
  return config.allowRedFallback === true
    && (!requested.length || requested.includes(CONFIRMABLE_PROFILE));
}

function annotate(result, telemetry) {
  if (!result) return result;
  result.algorithmRevision = AUTO_PLAN_REVISION;
  result.metrics ||= {};
  result.metrics.engine = AUTO_PLAN_ENGINE_ID;
  const perfectionEnabled = result.optimizerConfig?.perfectionEnabled !== false;
  result.metrics.phaseContract = {
    mandatory: AUTO_PLAN_STAGES.map(stage => stage.id),
    perfectionEnabled,
    certificationEnabled: perfectionEnabled
  };
  if (telemetry) result.metrics.strictEscalation = telemetry;
  return result;
}

function strictConstruction(parameters, config, profiles, overrides = {}) {
  return V8.constructAutoPlan({
    ...parameters,
    ...overrides,
    runConfig: {
      ...config,
      allowRedFallback: false,
      maxRedViolations: 0,
      zeroRedRescue: false,
      profileFilter: profiles
    }
  });
}

export async function constructAutoPlan(parameters) {
  const config = enrichedRunConfig(parameters);
  const profiles = strictProfiles(config);
  let incumbent = await strictConstruction(parameters, config, profiles);
  const presets = clean(incumbent) ? [] : wavePresets(config.searchIntensity, config.rescueStrength, config.strictEscalationRounds);
  const waves = [];

  for (let index = 0; index < presets.length; index += 1) {
    const preset = presets[index];
    await parameters.onProgress?.({
      phase: 'propagate', stage: 'null-rot-intensification',
      progress: Math.min(.51, .36 + index * .045),
      message: `Null-Rot-Intensivierung ${index + 1}/${presets.length} · Beam ${preset.beamWidth} · Branch ${preset.branchLimit} · exakt ${preset.exactBudget.toLocaleString('de-DE')}`,
      strictWave: index + 1, strictWaveCount: presets.length, ...preset
    });
    const candidate = await strictConstruction(parameters, config, profiles, preset);
    waves.push({
      index: index + 1, ...preset,
      complete: Boolean(candidate?.complete),
      unfilled: Number(candidate?.metrics?.unfilled || 0),
      red: Number(candidate?.metrics?.red || 0),
      exploredNodes: Number(candidate?.metrics?.exploredNodes || 0)
    });
    incumbent = better(candidate, incumbent);
    if (clean(candidate)) {
      incumbent = candidate;
      break;
    }
  }

  let fallbackAttempted = false;
  if (!clean(incumbent) && fallbackRequested(config)) {
    fallbackAttempted = true;
    await parameters.onProgress?.({
      phase: 'repair', stage: 'minimal-red-fallback', progress: .52,
      message: 'Alle strikten v8.5-Stufen ausgeschöpft · Minimal-Rot-Fallback wird als letzte Eskalation geprüft'
    });
    incumbent = better(await V8.constructAutoPlan({
      ...parameters,
      runConfig: { ...config, profileFilter: [CONFIRMABLE_PROFILE], zeroRedRescue: false }
    }), incumbent);
  }

  return annotate(incumbent, {
    attempted: presets.length,
    completed: waves.length,
    cleanFound: clean(incumbent),
    strength: config.rescueStrength,
    repairAggressiveness: config.repairAggressiveness,
    fallbackAttempted,
    waves
  });
}

export async function perfectAutoPlan(parameters) {
  const runConfig = enrichedRunConfig(parameters);
  const result = await V8.perfectAutoPlan({ ...parameters, runConfig });
  return annotate(result, result?.metrics?.strictEscalation || parameters?.constructed?.metrics?.strictEscalation || null);
}

export async function buildAutoPlan(parameters) {
  const runConfig = enrichedRunConfig(parameters);
  const constructed = await constructAutoPlan({ ...parameters, runConfig });
  return perfectAutoPlan({ ...parameters, runConfig, constructed });
}
