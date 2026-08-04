/**
 * Auto-Plan v8.5 – exhaustive clean-solution escalation.
 *
 * v8.5 keeps the productive rule engine and the full v8 portfolio intact. It
 * strengthens the orchestration around it: every construction strand receives
 * an explicit, bounded sequence of increasingly wide strict searches before a
 * red fallback may remain the winning result. No phase is silently disabled;
 * perfection and certification are mandatory whenever open slots exist.
 */
import * as V8 from './auto-planner-v8.js?v=20260803.4';

export * from './auto-planner-v8.js?v=20260803.4';

export const AUTO_PLAN_REVISION = 8.5;
export const AUTO_PLAN_ENGINE_ID = 'v8.5-exhaustive-clean-escalation';

export const AUTO_PLAN_STAGES = Object.freeze([
  Object.freeze({ id: 'analysis', title: 'Fixpunkte und Domänen', detail: 'Fixpunkte, Laufgrenzen, Qualifikationen und erfüllbare Wünsche werden vollständig katalogisiert.' }),
  Object.freeze({ id: 'construct', title: 'Constraint-Konstruktion', detail: 'Das vollständige Profilportfolio baut unabhängige Startlösungen mit Vorwärts-Checking.' }),
  Object.freeze({ id: 'rescue', title: 'Null-Rot-Intensivierung', detail: 'Mehrere streng getrennte Eskalationswellen verbreitern Suchstrahl, Kandidatenfächer und exaktes Restbacktracking.' }),
  Object.freeze({ id: 'repair', title: 'Iterative Tauschreparatur', detail: 'Einzelzüge, Paare, Dreierketten, Tagespakete und lokale Neuplanung glätten den besten Aufbau.' }),
  Object.freeze({ id: 'perfect', title: 'Adaptive ALNS-Perfektion', detail: 'Diversifizierte Ruin-and-Recreate-Stränge lernen Zerstörungs- und Wiederaufbauoperatoren online.' }),
  Object.freeze({ id: 'certify', title: 'Vollständiger Nachweis', detail: 'Einzelumsetzungen, Paartausche und Tagespakete werden ohne Abkürzung bis zum stabilen Endzustand geprüft.' })
]);

const clamp = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
};

function settingsOf(parameters) {
  const saved = parameters?.state?.settings?.autoPlan || {};
  const supplied = parameters?.runConfig || {};
  return { ...saved, ...supplied };
}

/**
 * The three v8.5 tuning values are deliberately derivable from fields already
 * carried in the worker message. This keeps the worker protocol stable while
 * the Studio can expose meaningful presets immediately:
 *
 * - repair rounds determine the number of strict escalation waves;
 * - local rebuild budget determines rescue breadth;
 * - their combination determines repair aggressiveness.
 */
function tuning(parameters) {
  const source = settingsOf(parameters);
  const repairIterations = clamp(source.repairIterations, 0, 30, 6);
  const localBudget = clamp(source.localRebuildBudget, 200, 12000, 6000);
  const derivedRounds = clamp(Math.ceil(Math.max(2, repairIterations) / 2), 1, 4, 3);
  const derivedStrength = clamp(100 + (localBudget - 200) / 11800 * 150, 100, 250, 160);
  const derivedAggressiveness = repairIterations >= 8 || localBudget >= 8500
    ? 'exhaustive'
    : repairIterations >= 6 || localBudget >= 5200
      ? 'intensive'
      : 'balanced';
  return {
    strictEscalationRounds: clamp(source.strictEscalationRounds, 1, 4, derivedRounds),
    rescueStrength: clamp(source.rescueStrength, 100, 250, derivedStrength),
    repairAggressiveness: ['balanced', 'intensive', 'exhaustive'].includes(source.repairAggressiveness)
      ? source.repairAggressiveness
      : derivedAggressiveness
  };
}

function enrichedRunConfig(parameters) {
  const source = { ...(parameters?.runConfig || {}) };
  const config = tuning(parameters);
  const repairFloor = config.repairAggressiveness === 'exhaustive' ? 8 : config.repairAggressiveness === 'intensive' ? 6 : 4;
  const localFloor = config.repairAggressiveness === 'exhaustive' ? 9000 : config.repairAggressiveness === 'intensive' ? 6000 : 3200;
  return {
    ...source,
    perfectionEnabled: true,
    certificationRounds: Math.max(2, clamp(source.certificationRounds, 1, 8, 4)),
    repairIterations: Math.max(repairFloor, clamp(source.repairIterations, 0, 30, repairFloor)),
    localRebuildBudget: Math.max(localFloor, clamp(source.localRebuildBudget, 200, 12000, localFloor)),
    strictEscalationRounds: config.strictEscalationRounds,
    rescueStrength: config.rescueStrength,
    repairAggressiveness: config.repairAggressiveness
  };
}

function clean(result) {
  return Boolean(result?.complete)
    && Number(result?.metrics?.unfilled || 0) === 0
    && Number(result?.metrics?.gray || 0) === 0
    && Number(result?.metrics?.red || 0) === 0;
}

function compareResults(candidate, incumbent) {
  if (!incumbent) return candidate ? -1 : 0;
  if (!candidate) return 1;
  if (candidate.complete !== incumbent.complete) return candidate.complete ? -1 : 1;
  const left = Array.isArray(candidate.objectiveKey) ? candidate.objectiveKey : [];
  const right = Array.isArray(incumbent.objectiveKey) ? incumbent.objectiveKey : [];
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = Number(left[index] || 0) - Number(right[index] || 0);
    if (Math.abs(difference) > 1e-9) return difference < 0 ? -1 : 1;
  }
  return 0;
}

function better(candidate, incumbent) {
  return compareResults(candidate, incumbent) < 0 ? candidate : incumbent;
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

function strictProfileFilter(runConfig) {
  const requested = Array.isArray(runConfig?.profileFilter) ? runConfig.profileFilter.filter(Boolean) : [];
  if (requested.length && requested.every(id => id !== 'confirmable-balanced')) return requested;
  return ['strict-balanced', 'strict-coverage'];
}

function annotate(result, telemetry = null) {
  if (!result) return result;
  result.algorithmRevision = AUTO_PLAN_REVISION;
  result.metrics ||= {};
  result.metrics.engine = AUTO_PLAN_ENGINE_ID;
  result.metrics.phaseContract = {
    mandatory: ['analysis', 'construct', 'rescue', 'repair', 'perfect', 'certify'],
    perfectionEnabled: true,
    certificationEnabled: true
  };
  if (telemetry) result.metrics.strictEscalation = telemetry;
  return result;
}

export async function constructAutoPlan(parameters) {
  const runConfig = enrichedRunConfig(parameters);
  const configured = { ...parameters, runConfig };
  let incumbent = await V8.constructAutoPlan(configured);
  if (clean(incumbent)) {
    return annotate(incumbent, { attempted: 0, completed: 0, cleanFound: true, waves: [] });
  }

  const config = tuning(configured);
  const presets = wavePresets(runConfig.searchIntensity, config.rescueStrength, config.strictEscalationRounds);
  const waves = [];
  let cleanFound = false;

  for (let index = 0; index < presets.length; index += 1) {
    const preset = presets[index];
    await parameters.onProgress?.({
      phase: 'propagate',
      stage: 'null-rot-intensification',
      progress: Math.min(.51, .36 + index * .045),
      message: `Null-Rot-Intensivierung ${index + 1}/${presets.length} · Beam ${preset.beamWidth} · Branch ${preset.branchLimit} · exakt ${preset.exactBudget.toLocaleString('de-DE')}`,
      strictWave: index + 1,
      strictWaveCount: presets.length,
      ...preset
    });

    const candidate = await V8.constructAutoPlan({
      ...parameters,
      ...preset,
      runConfig: {
        ...runConfig,
        allowRedFallback: false,
        maxRedViolations: 0,
        zeroRedRescue: false,
        profileFilter: strictProfileFilter(runConfig)
      }
    });
    waves.push({
      index: index + 1,
      beamWidth: preset.beamWidth,
      branchLimit: preset.branchLimit,
      exactBudget: preset.exactBudget,
      complete: Boolean(candidate?.complete),
      unfilled: Number(candidate?.metrics?.unfilled || 0),
      red: Number(candidate?.metrics?.red || 0),
      exploredNodes: Number(candidate?.metrics?.exploredNodes || 0)
    });
    incumbent = better(candidate, incumbent);
    if (clean(candidate)) {
      incumbent = candidate;
      cleanFound = true;
      break;
    }
  }

  return annotate(incumbent, {
    attempted: presets.length,
    completed: waves.length,
    cleanFound: cleanFound || clean(incumbent),
    strength: config.rescueStrength,
    repairAggressiveness: config.repairAggressiveness,
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
