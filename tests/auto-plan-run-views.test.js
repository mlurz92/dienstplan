import test from 'node:test';
import assert from 'node:assert/strict';

import { AutoPlanCrystallizer } from '../js/auto-plan-crystallize.js';
import { AutoPlanWeaver } from '../js/auto-plan-weave.js';
import { AutoPlanCascade } from '../js/auto-plan-cascade.js';

/**
 * Die Laufansichten zeichnen auf eine Leinwand, die es in Node nicht gibt. Sie
 * sind trotzdem prüfbar: Was hier zählt, ist nicht das Bild, sondern dass jede
 * Ansicht denselben Lebenszyklus und dieselben Meldungen der Engine verträgt —
 * auch die Randfälle, die im Browser nur selten auftreten und dort dann eine
 * schwarze Fläche hinterlassen: eine winzige Leinwand, ein leerer Monat, eine
 * Zwischenlösung vor dem Stufenplan, ein Beweis ohne Zielfunktion.
 */

const VIEWS = [
  ['Kristallisation', AutoPlanCrystallizer],
  ['Weberei', AutoPlanWeaver],
  ['Kaskade', AutoPlanCascade]
];

function monthFixture() {
  const days = {};
  for (let day = 1; day <= 31; day += 1) {
    const dateIso = `2026-03-${String(day).padStart(2, '0')}`;
    days[dateIso] = day === 1 ? { bd: 'a', hg: 'b' } : {};
  }
  return { year: 2026, month: 3, days };
}

/** Aufzeichnender 2D-Kontext: Jede unbekannte Methode ist ein stiller No-Op. */
function stubContext() {
  const state = {
    calls: 0,
    measureText: text => ({ width: String(text).length * 6 }),
    setTransform() {},
    save() {},
    restore() {}
  };
  return new Proxy(state, {
    get(target, property) {
      if (property in target) return target[property];
      // Farb- und Maßeigenschaften werden gesetzt, nicht gerufen.
      if (typeof property === 'string' && /Style$|Width$|Blur$|Color$|font|textAlign|textBaseline/.test(property)) {
        return target[property];
      }
      return (...args) => { target.calls += 1; return args; };
    },
    set(target, property, value) {
      target[property] = value;
      return true;
    }
  });
}

function environment({ width = 900, height = 420 } = {}) {
  const originals = Object.fromEntries(
    ['document', 'ResizeObserver', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle']
      .map(key => [key, globalThis[key]])
  );
  const frames = [];
  globalThis.document = { documentElement: { dataset: {} } };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  globalThis.cancelAnimationFrame = () => {};
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#4f8fbd' });

  const context = stubContext();
  const canvas = {
    dataset: {},
    getContext: () => context,
    getBoundingClientRect: () => ({ width, height })
  };
  return {
    canvas,
    context,
    /** Führt die nächste angeforderte Bildschleife aus. */
    tick(now) {
      const callback = frames.shift();
      callback?.(now);
    },
    restore() {
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    }
  };
}

const RUN = [
  { phase: 'analysis', progress: 0.05, message: 'Monatszustand wird gelesen' },
  {
    phase: 'exact',
    stage: 'cp-sat',
    progress: 0.27,
    message: 'Kaskade: 3 Zielstufen',
    stages: [
      { id: 'unfilled', label: 'Offene Felder', status: 'pending', value: null, bound: null },
      { id: 'fairness', label: 'Gleichmäßige Gesamtlast (Leximin)', status: 'pending', value: null, bound: null },
      { id: 'wishes', label: 'Wünsche', status: 'pending', value: null, bound: null }
    ]
  },
  { phase: 'exact', stage: 'cp-sat', cpSatPhase: 'fairness', progress: 0.4, message: 'Leximin 1' },
  {
    phase: 'exact',
    stage: 'cp-sat',
    incumbent: {
      objectiveValue: 12,
      bestBound: 4,
      hasObjective: true,
      stage: 'fairness',
      assignments: [
        { dateIso: '2026-03-02', role: 'bd', staffId: 'c' },
        { dateIso: '2026-03-02', role: 'hg', staffId: 'd' },
        { dateIso: '2026-03-03', role: 'bd', staffId: 'e' }
      ]
    }
  },
  { phase: 'repair', level: 'red', progress: 0.6, message: 'Rote Bewertung geprüft' },
  {
    phase: 'exact',
    stage: 'cp-sat',
    incumbent: {
      objectiveValue: 7,
      bestBound: 7,
      hasObjective: true,
      stage: 'fairness',
      assignments: [{ dateIso: '2026-03-02', role: 'bd', staffId: 'f' }]
    }
  },
  {
    phase: 'complete',
    progress: 0.94,
    message: 'v10: exakte Suche gewinnt',
    loads: [{ staffId: 'c', value: 3 }, { staffId: 'd', value: 1.8 }, { staffId: 'f', value: 2 }]
  }
];

for (const [name, View] of VIEWS) {
  test(`${name}: vollständiger Lauf zeichnet ohne Fehler`, () => {
    const world = environment();
    try {
      const view = new View(world.canvas, monthFixture(), {
        staff: [{ id: 'a', short: 'Ah' }, { id: 'b', short: 'Be' }, { id: 'c', short: 'Ce' }]
      });
      assert.equal(world.canvas.dataset.renderMode, 'running');

      let now = 0;
      for (const update of RUN) {
        view.update(update);
        now += 120;
        world.tick(now);
      }
      view.finish();
      assert.equal(world.canvas.dataset.renderMode, 'complete');
      world.tick(now + 120);
      assert.ok(world.context.calls > 0, 'es wurde tatsächlich gezeichnet');

      view.stop();
      assert.equal(world.canvas.dataset.renderMode, 'stopped');
    } finally {
      world.restore();
    }
  });

  test(`${name}: leerer Monat und winzige Leinwand bleiben zeichenbar`, () => {
    // Die Zonenaufteilung rechnet mit Mindesthöhen. Fällt eine Zone unter null,
    // zeichnen Ansichten entweder gar nicht mehr oder über ihren Rand hinaus —
    // beides sah in früheren Fassungen wie ein abgeschnittener Rand aus.
    const world = environment({ width: 120, height: 90 });
    try {
      const view = new View(world.canvas, { days: {} });
      view.update({ phase: 'search', progress: 0.4, message: 'Suche' });
      view.update(RUN[1]);
      view.update(RUN[3]);
      world.tick(16);
      world.tick(140);
      view.stop();
      assert.equal(world.canvas.dataset.renderMode, 'stopped');
    } finally {
      world.restore();
    }
  });

  test(`${name}: Zwischenlösung ohne Zielfunktion beweist nichts`, () => {
    // Die Zulässigkeitssuche läuft ohne Ziel und meldet Zielwert wie Schranke
    // als null. Wer daraus einen Beweis ableitet, steht den Rest des Laufs
    // still — der Defekt, der bis v10.4 die Kristallisation lähmte.
    const world = environment();
    try {
      const view = new View(world.canvas, monthFixture());
      view.update(RUN[1]);
      view.update({
        phase: 'exact',
        stage: 'cp-sat',
        incumbent: { objectiveValue: 0, bestBound: 0, hasObjective: false, stage: 'Zulässigkeit', assignments: [] }
      });
      world.tick(16);
      const proven = view.crystallizedAt ?? view.seamAt ?? view.provenAt ?? null;
      assert.equal(proven, null, 'kein Beweis ohne Zielfunktion');
      view.stop();
    } finally {
      world.restore();
    }
  });

  test(`${name}: fehlender Leinwandkontext bricht den Lebenszyklus nicht`, () => {
    const world = environment();
    try {
      const canvas = { dataset: {}, getContext: () => null, getBoundingClientRect: () => ({ width: 400, height: 300 }) };
      assert.doesNotThrow(() => {
        const view = new View(canvas, monthFixture());
        view.update({ phase: 'search', progress: 0.4 });
        view.finish();
        view.stop();
      });
      assert.equal(canvas.dataset.renderMode, 'stopped');
    } finally {
      world.restore();
    }
  });
}
