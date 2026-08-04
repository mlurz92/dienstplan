import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const planner = await import('../js/auto-planner.js');

const source = async path => readFile(new URL(path, import.meta.url), 'utf8');

test('produktiver Auto-Plan exportiert Revision 8.5 und alle Pflichtphasen', () => {
  assert.equal(planner.AUTO_PLAN_REVISION, 8.5);
  assert.equal(planner.AUTO_PLAN_ENGINE_ID, 'v8.5-exhaustive-clean-escalation');
  assert.deepEqual(planner.AUTO_PLAN_STAGES.map(stage => stage.id), [
    'analysis', 'construct', 'rescue', 'repair', 'perfect', 'certify'
  ]);
  assert.ok(planner.AUTO_PLAN_STAGES.every(stage => stage.title && stage.detail));
});

test('v8.5 erzwingt Perfektion und mehrstufige Null-Rot-Eskalation', async () => {
  const text = await source('../js/auto-planner-v8-5.js');
  assert.match(text, /perfectionEnabled:\s*true/);
  assert.match(text, /allowRedFallback:\s*false/);
  assert.match(text, /maxRedViolations:\s*0/);
  assert.match(text, /strictWaveCount/);
  assert.match(text, /profileFilter:\s*strictProfileFilter/);
  assert.match(text, /certificationRounds:\s*Math\.max\(2/);
});

test('Studio-Profile steuern echte Worker-Felder statt reine Dekoration', async () => {
  const text = await source('../js/auto-plan-studio-v8-5.js');
  assert.match(text, /autoPlanRepairIterations/);
  assert.match(text, /autoPlanLocalBudget/);
  assert.match(text, /autoPlanLateAcceptance/);
  assert.match(text, /autoPlanV85Parallel/);
  assert.match(text, /portfolioDiversity/);
  assert.match(text, /autoPlanPerfection/);
});

test('manueller Modus für reduzierte Bewegung ist in v8.5 entfernt', async () => {
  const theme = await source('../js/app-theme-v8-5.js');
  const shell = await source('../js/ui-v8-5.js');
  assert.doesNotMatch(theme, /prefers-reduced-motion/);
  assert.match(shell, /settingsMotion/);
  assert.match(shell, /field\.hidden\s*=\s*true/);
  assert.match(shell, /classList\.remove\('reduce-motion'\)/);
});

test('Command Bar enthält Theme-Schalter, Rich Tooltips und passive Scrollpolitik', async () => {
  const shell = await source('../js/ui-v8-5.js');
  assert.match(shell, /createThemeToggle/);
  assert.match(shell, /setRichTooltip/);
  assert.match(shell, /passive:\s*true/);
  assert.match(shell, /requestAnimationFrame/);
  assert.match(shell, /commandBarRevision\s*=\s*'8\.5'/);
});
