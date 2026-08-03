import test from 'node:test';
import assert from 'node:assert/strict';

import { AutoPlanProgressModel } from '../js/auto-plan-progress.js';
import { renderPolicyFor } from '../js/auto-plan-animation-policy.js';

test('Portfoliofortschritt berücksichtigt noch nicht gestartete Aufbaupfade', () => {
  const model = new AutoPlanProgressModel();
  const first = model.observe({
    phase: 'search', stage: 'aufbau', searchIndex: 0, searchCount: 2,
    processed: 5, total: 10, progress: .45
  });

  assert.equal(first.progress, .16);
  assert.equal(first.percent, 16);
  assert.deepEqual(first.portfolio, { completed: 0, active: 1, total: 2, cancelled: 0, failed: 0 });
});

test('Portfoliofortschritt steigt mit einem zweiten Aufbaupfad', () => {
  const model = new AutoPlanProgressModel();
  model.observe({ phase: 'search', stage: 'aufbau', searchIndex: 0, searchCount: 2, processed: 5, total: 10 });
  const second = model.observe({ phase: 'search', stage: 'aufbau', searchIndex: 1, searchCount: 2, processed: 2, total: 10 });

  assert.equal(second.progress, .212);
  assert.equal(second.percent, 21);
  assert.equal(second.workload.processed, 5);
  assert.equal(second.workload.total, 10);
});

test('Phasenwechsel hält den Gesamtfortschritt monoton', () => {
  const model = new AutoPlanProgressModel();
  const construction = model.observe({ phase: 'polish', stage: 'aufbau', progress: .54 });
  const perfection = model.observe({ phase: 'perfect', stage: 'perfektion', searchIndex: 0, searchCount: 2, progress: .56 });

  assert.ok(perfection.progress >= construction.progress);
  assert.ok(perfection.progress >= .55);
});

test('Perfektionsphase übernimmt keine erledigten Aufbauläufe', () => {
  const model = new AutoPlanProgressModel();
  model.observe({
    phase: 'search', stage: 'aufbau', portfolioEvent: true,
    portfolioCompleted: 1, portfolioTotal: 1, portfolioActive: 0, progress: .54
  });
  const perfection = model.observe({
    phase: 'perfect', stage: 'perfektion', searchIndex: 0, searchCount: 2, progress: .56
  });

  assert.equal(perfection.portfolio.completed, 0);
  assert.equal(perfection.portfolio.cancelled, 0);
  assert.equal(perfection.portfolio.total, 2);
});

test('aggregierter Perfektionsstart bleibt am Phasenanfang statt auf 96 Prozent zu springen', () => {
  const model = new AutoPlanProgressModel();
  model.observe({
    phase: 'search', stage: 'aufbau', portfolioEvent: true,
    portfolioCompleted: 1, portfolioTotal: 1, portfolioActive: 0, progress: .54
  });
  const perfection = model.observe({
    phase: 'perfect', stage: 'perfektion', portfolioEvent: true,
    portfolioCompleted: 0, portfolioFailed: 0, portfolioTotal: 1, portfolioActive: 1, progress: .96
  });

  assert.equal(perfection.progress, .55);
  assert.equal(perfection.percent, 55);
  assert.equal(model.runs.perfection.size, 0);
});

test('Portfoliofortschritt unterscheidet Erfolg, Abbruch und Fehllauf', () => {
  const model = new AutoPlanProgressModel();
  const state = model.observe({
    phase: 'search', stage: 'aufbau', portfolioEvent: true,
    portfolioCompleted: 1, portfolioFailed: 1, portfolioCancelled: 1,
    portfolioTotal: 4, portfolioActive: 1
  });

  assert.deepEqual(state.portfolio, { completed: 1, active: 1, total: 4, cancelled: 1, failed: 1 });
});

test('Nichtterminaler Fortschritt bleibt unter hundert Prozent', () => {
  const model = new AutoPlanProgressModel();
  const state = model.observe({ phase: 'certify', stage: 'perfektion', progress: 1, searchIndex: 0, searchCount: 1 });

  assert.equal(state.progress, .99);
  assert.equal(state.percent, 99);
  assert.equal(state.terminal, false);
});

test('Terminaler Fortschritt erreicht exakt hundert Prozent', () => {
  const model = new AutoPlanProgressModel();
  model.observe({ phase: 'search', stage: 'aufbau', progress: .3, processed: 1, total: 2 });
  const state = model.observe({ phase: 'complete', stage: 'abschluss', progress: 1 });

  assert.equal(state.progress, 1);
  assert.equal(state.percent, 100);
  assert.equal(state.terminal, true);
});

test('Generierte Ereignisfolgen liefern begrenzten Fortschritt', () => {
  let seed = 73;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };

  for (let scenario = 0; scenario < 80; scenario += 1) {
    const model = new AutoPlanProgressModel();
    let previous = 0;
    for (let event = 0; event < 60; event += 1) {
      const total = 1 + Math.floor(random() * 62);
      const state = model.observe({
        phase: event > 42 ? 'perfect' : 'search',
        stage: event > 42 ? 'perfektion' : 'aufbau',
        searchIndex: Math.floor(random() * 4),
        searchCount: 1 + Math.floor(random() * 4),
        processed: Math.floor(random() * (total + 1)),
        total,
        progress: random() * 1.4 - .2
      });
      assert.ok(Number.isFinite(state.progress));
      assert.ok(state.progress >= 0);
      assert.ok(state.progress <= .99);
      assert.ok(state.progress >= previous);
      previous = state.progress;
    }
  }
});

test('Reduced Motion zeichnet ausschließlich auf Zustandsänderung', () => {
  assert.deepEqual(renderPolicyFor({ active: true, visible: true, reduced: true, finished: false, averageFrameMs: 2 }), {
    continuous: false,
    frameIntervalMs: null,
    detail: .4,
    sparkLimit: 0,
    mode: 'reduced'
  });
});

test('Abschluss beendet die dauerhafte Bildfolge', () => {
  assert.equal(renderPolicyFor({ active: true, visible: true, reduced: false, finished: true, averageFrameMs: 2 }).continuous, false);
});

test('Langsame Frames senken den Zeichentakt', () => {
  const normal = renderPolicyFor({ active: true, visible: true, reduced: false, finished: false, averageFrameMs: 4 });
  const constrained = renderPolicyFor({ active: true, visible: true, reduced: false, finished: false, averageFrameMs: 14 });

  assert.equal(normal.frameIntervalMs, 33);
  assert.equal(normal.sparkLimit, 160);
  assert.equal(constrained.frameIntervalMs, 67);
  assert.equal(constrained.sparkLimit, 24);
  assert.ok(constrained.detail < normal.detail);
});

test('mittlere Renderlast nutzt den ausbalancierten 50-ms-Modus', () => {
  const balanced = renderPolicyFor({ active: true, visible: true, reduced: false, finished: false, averageFrameMs: 9 });

  assert.equal(balanced.mode, 'balanced');
  assert.equal(balanced.frameIntervalMs, 50);
  assert.equal(balanced.sparkLimit, 80);
});

test('Unsichtbare Animation plant keine dauerhafte Bildfolge', () => {
  const policy = renderPolicyFor({ active: true, visible: false, reduced: false, finished: false, averageFrameMs: 2 });
  assert.equal(policy.continuous, false);
  assert.equal(policy.mode, 'hidden');
});
