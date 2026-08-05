import test from 'node:test';
import assert from 'node:assert/strict';

import { AutoPlanVisualizer } from '../js/auto-plan-visualizer.js';

test('fehlender Canvas-Kontext beeinträchtigt den Solver-Lebenszyklus nicht', () => {
  const canvas = {
    dataset: {},
    getContext: () => null,
    getBoundingClientRect: () => ({ width: 400, height: 300 })
  };
  let visualizer;

  assert.doesNotThrow(() => {
    visualizer = new AutoPlanVisualizer(canvas, { days: {} });
    visualizer.update({ phase: 'search', progress: .4 });
    visualizer.finish();
    visualizer.stop();
  });
  assert.equal(canvas.dataset.renderMode, 'stopped');
});

test('stop entfernt Observer, Medien- und Sichtbarkeitslistener vollständig', () => {
  const originals = Object.fromEntries([
    'document', 'window', 'ResizeObserver', 'IntersectionObserver', 'matchMedia',
    'requestAnimationFrame', 'cancelAnimationFrame'
  ].map(key => [key, globalThis[key]]));
  const calls = { resize: 0, intersection: 0, documentRemove: 0, windowRemove: 0, mediaRemove: 0, cancel: 0 };
  const media = {
    matches: false,
    addEventListener() {},
    removeEventListener(type) { if (type === 'change') calls.mediaRemove += 1; }
  };

  globalThis.document = {
    visibilityState: 'visible',
    documentElement: { dataset: {} },
    addEventListener() {},
    removeEventListener(type) { if (type === 'visibilitychange') calls.documentRemove += 1; }
  };
  globalThis.window = {
    addEventListener() {},
    removeEventListener(type) { if (type === 'appsettingschange') calls.windowRemove += 1; }
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() { calls.resize += 1; }
  };
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() { calls.intersection += 1; }
  };
  globalThis.matchMedia = () => media;
  globalThis.requestAnimationFrame = () => 23;
  globalThis.cancelAnimationFrame = () => { calls.cancel += 1; };

  try {
    const canvas = {
      dataset: {},
      getContext: () => ({ setTransform() {} }),
      getBoundingClientRect: () => ({ width: 400, height: 300 })
    };
    const visualizer = new AutoPlanVisualizer(canvas, { days: {} });
    visualizer.stop();

    assert.deepEqual(calls, {
      resize: 1,
      intersection: 1,
      documentRemove: 1,
      windowRemove: 1,
      mediaRemove: 1,
      cancel: 1
    });
    assert.equal(canvas.dataset.renderMode, 'stopped');
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  }
});
