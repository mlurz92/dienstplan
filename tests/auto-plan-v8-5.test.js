import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const planner = await import('../js/auto-planner-v8-5.js');
const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

test('v8.5-Kompatibilitätsfacade exportiert Revision 8.5 und alle Pflichtphasen', () => {
  assert.equal(planner.AUTO_PLAN_REVISION, 8.5);
  assert.equal(planner.AUTO_PLAN_ENGINE_ID, 'v8.5-exhaustive-clean-escalation');
  assert.deepEqual(planner.AUTO_PLAN_STAGES.map(stage => stage.id), [
    'analysis', 'construct', 'rescue', 'repair', 'perfect', 'certify'
  ]);
  assert.ok(planner.AUTO_PLAN_STAGES.every(stage => stage.title && stage.detail));
});

test('sichtbare Suchprofile leiten echte v8.5-Solverwerte ab', () => {
  assert.deepEqual(planner.deriveV85Tuning({ repairIterations: 4, localRebuildBudget: 4000 }), {
    strictEscalationRounds: 2,
    rescueStrength: 148,
    repairAggressiveness: 'balanced'
  });
  assert.deepEqual(planner.deriveV85Tuning({ repairIterations: 6, localRebuildBudget: 6500 }), {
    strictEscalationRounds: 3,
    rescueStrength: 180,
    repairAggressiveness: 'intensive'
  });
  assert.deepEqual(planner.deriveV85Tuning({ repairIterations: 8, localRebuildBudget: 10000 }), {
    strictEscalationRounds: 4,
    rescueStrength: 225,
    repairAggressiveness: 'exhaustive'
  });
});

test('explizite Integrationswerte überschreiben die Profilableitung kontrolliert', () => {
  assert.deepEqual(planner.deriveV85Tuning({
    repairIterations: 4,
    localRebuildBudget: 4000,
    strictEscalationRounds: 4,
    rescueStrength: 210,
    repairAggressiveness: 'exhaustive'
  }), {
    strictEscalationRounds: 4,
    rescueStrength: 210,
    repairAggressiveness: 'exhaustive'
  });
});

test('v8.5 erzwingt strikte Eskalation vor dem optionalen Rot-Fallback', async () => {
  const text = await source('../js/auto-planner-v8-5.js');
  assert.match(text, /perfectionEnabled:\s*source\.perfectionEnabled\s*!==\s*false/);
  assert.match(text, /allowRedFallback:\s*false/);
  assert.match(text, /maxRedViolations:\s*0/);
  assert.match(text, /strictWaveCount/);
  assert.match(text, /certificationRounds:\s*Math\.max\(2/);
  const strict = text.indexOf('const presets =');
  const fallback = text.indexOf('let fallbackAttempted');
  const confirmable = text.indexOf('profileFilter: [CONFIRMABLE_PROFILE]');
  assert.ok(strict >= 0 && fallback > strict && confirmable > fallback,
    'der bestätigungspflichtige Fallback steht nach allen strikten Wellen');
});

test('Studio-Profile steuern echte Worker-Felder statt reine Dekoration', async () => {
  const text = await source('../js/auto-plan-studio-v8-5.js');
  assert.match(text, /autoPlanRepairIterations/);
  assert.match(text, /autoPlanLocalBudget/);
  assert.match(text, /autoPlanLateAcceptance/);
  assert.match(text, /autoPlanV85Parallel/);
  assert.match(text, /portfolioDiversity/);
  assert.match(text, /autoPlanPerfection/);
  assert.match(text, /perfection\.checked\s*=\s*true/);
});

test('manueller Modus für reduzierte Bewegung ist in v8.5 entfernt', async () => {
  const theme = await source('../js/app-theme-v8-5.js');
  const shell = await source('../js/ui-v8-5.js');
  assert.doesNotMatch(theme, /prefers-reduced-motion/);
  assert.match(shell, /settingsMotion/);
  assert.match(shell, /field\.hidden\s*=\s*true/);
  assert.match(shell, /delete state\.settings\.appearance\.motion/);
  assert.match(shell, /classList\.remove\('reduce-motion'\)/);
  assert.match(shell, /delete html\.dataset\.motion/);
});

test('Command Bar enthält Theme-Schalter, Rich Tooltips und passive Scrollpolitik', async () => {
  const shell = await source('../js/ui-v8-5.js');
  assert.match(shell, /createThemeToggle/);
  assert.match(shell, /setRichTooltip/);
  assert.match(shell, /passive:\s*true/);
  assert.match(shell, /requestAnimationFrame/);
  assert.match(shell, /commandBarRevision\s*=\s*'8\.5'/);
});
