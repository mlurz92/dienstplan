import test from 'node:test';
import assert from 'node:assert/strict';

import { RUN_VIEWS, DEFAULT_RUN_VIEW, createRunView, resolveRunView } from '../js/auto-plan-run-views.js';

/**
 * Die Laufansichten zeichnen auf eine Leinwand, die es in Node nicht gibt. Sie
 * sind trotzdem prüfbar: Was hier zählt, ist nicht das Bild, sondern dass jede
 * Ansicht denselben Lebenszyklus und dieselben Meldungen der Engine verträgt —
 * auch die Randfälle, die im Browser nur selten auftreten und dort dann eine
 * schwarze Fläche hinterlassen: eine winzige Leinwand, ein leerer Monat, eine
 * Zwischenlösung vor dem Stufenplan, ein Beweis ohne Zielfunktion.
 *
 * Geprüft wird gegen die Registratur, nicht gegen eine Liste im Test: Eine neue
 * Ansicht ist damit ab ihrem Eintrag geprüft und nicht erst, wenn jemand daran
 * denkt, sie hier nachzutragen.
 */

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
    restore() {},
    // Verläufe sind Objekte, keine Rückgabewerte: Wer einen anfordert, ruft
    // anschließend addColorStop darauf.
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createConicGradient: () => ({ addColorStop() {} }),
    createPattern: () => null
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
    ['document', 'ResizeObserver', 'IntersectionObserver', 'matchMedia',
      'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle']
      .map(key => [key, globalThis[key]])
  );
  const frames = [];
  const listeners = new Map();
  const observers = { resize: 0, intersection: 0 };
  globalThis.document = {
    documentElement: { dataset: {} },
    visibilityState: 'visible',
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); }
  };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() { observers.resize += 1; }
  };
  globalThis.IntersectionObserver = class {
    observe() {}
    disconnect() { observers.intersection += 1; }
  };
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
    listeners,
    observers,
    /** Wie viele Bilder gerade angefordert sind. */
    get pending() { return frames.length; },
    /** Führt die nächste angeforderte Bildschleife aus. */
    tick(now) {
      const callback = frames.shift();
      callback?.(now);
    },
    /** Versetzt das Fenster in den verdeckten Zustand und meldet es. */
    hide() {
      globalThis.document.visibilityState = 'hidden';
      listeners.get('visibilitychange')?.();
    },
    show() {
      globalThis.document.visibilityState = 'visible';
      listeners.get('visibilitychange')?.();
    },
    restore() {
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    }
  };
}

/** Ansichten, die keinen Optimalitätsbeweis darstellen. */
const PROOFLESS = new Set(['orbit']);

/**
 * Ansichten, deren `renderMode` den Lebenszyklus trägt.
 *
 * Orbit legt dort die Darstellungsgüte ihrer Animationsrichtlinie ab
 * (`full`, `balanced`, `reduced` …). Das ist gebunden — `auto-plan-studio-v7-5.css`
 * färbt danach ihre Güteplakette —, also wird es hier nicht eingefordert,
 * sondern ausgenommen. Was für alle gilt, prüft die Marke `runView`.
 */
const LIFECYCLE_MODE = new Set(RUN_VIEWS.map(view => view.id).filter(id => id !== 'orbit'));

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

test('Registratur: Voreinstellung vorhanden, unbekannte Marke fällt zurück', () => {
  assert.ok(RUN_VIEWS.length >= 2, 'es gibt eine Wahl');
  assert.equal(new Set(RUN_VIEWS.map(view => view.id)).size, RUN_VIEWS.length, 'Marken sind eindeutig');
  assert.equal(resolveRunView(DEFAULT_RUN_VIEW).id, DEFAULT_RUN_VIEW);
  // Eine Marke aus einer Fassung mit anderem Angebot darf die Laufanzeige nicht
  // ausfallen lassen — sie fällt auf die Voreinstellung zurück.
  assert.equal(resolveRunView('marke-aus-alter-fassung').id, DEFAULT_RUN_VIEW);
  assert.equal(resolveRunView(undefined).id, DEFAULT_RUN_VIEW);
  for (const view of RUN_VIEWS) {
    assert.equal(typeof view.label, 'string');
    assert.ok(view.hint, `${view.id} erklärt sich`);
    assert.equal(typeof view.create, 'function');
  }
});

for (const { id: name } of RUN_VIEWS) {
  test(`${name}: vollständiger Lauf zeichnet ohne Fehler`, () => {
    const world = environment();
    try {
      const view = createRunView(name, world.canvas, monthFixture(), {
        staff: [{ id: 'a', short: 'Ah' }, { id: 'b', short: 'Be' }, { id: 'c', short: 'Ce' }]
      }).instance;
      assert.equal(world.canvas.dataset.runView, name, 'die Leinwand nennt ihre Ansicht');
      if (LIFECYCLE_MODE.has(name)) assert.equal(world.canvas.dataset.renderMode, 'running');

      let now = 0;
      for (const update of RUN) {
        view.update(update);
        now += 120;
        world.tick(now);
      }
      view.finish();
      if (LIFECYCLE_MODE.has(name)) assert.equal(world.canvas.dataset.renderMode, 'complete');
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
      const view = createRunView(name, world.canvas, { days: {} }, {}).instance;
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

  // Nicht jede Ansicht kennt einen Beweismoment; Orbit zeigt Bewegung, keinen
  // Nachweis. Ein Test, der bei ihr trivial „null gleich null" prüft, sagt
  // nichts — deshalb läuft dieser nur, wo es etwas zu widerlegen gibt.
  const proofMarker = view => view.crystallizedAt ?? view.seamAt ?? view.provenAt ?? null;
  test(`${name}: Zwischenlösung ohne Zielfunktion beweist nichts`, { skip: PROOFLESS.has(name) }, () => {
    // Die Zulässigkeitssuche läuft ohne Ziel und meldet Zielwert wie Schranke
    // als null. Wer daraus einen Beweis ableitet, steht den Rest des Laufs
    // still — der Defekt, der bis v10.4 die Kristallisation lähmte.
    const world = environment();
    try {
      const view = createRunView(name, world.canvas, monthFixture(), {}).instance;
      view.update(RUN[1]);
      view.update({
        phase: 'exact',
        stage: 'cp-sat',
        incumbent: { objectiveValue: 0, bestBound: 0, hasObjective: false, stage: 'Zulässigkeit', assignments: [] }
      });
      world.tick(16);
      assert.equal(proofMarker(view), null, 'kein Beweis ohne Zielfunktion');
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
        const view = createRunView(name, canvas, monthFixture(), {}).instance;
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

/**
 * Die Sparsamkeit der Ansichten ist eine Zusage, keine Absicht — also wird sie
 * geprüft. Alle drei Bremsen sind im Unterbau verankert und gelten damit für
 * jede Ansicht, die ihn benutzt; geprüft wird an der Voreinstellung.
 */
test('verdeckte Leinwand: die Schleife ruht und läuft danach wieder an', () => {
  const world = environment();
  try {
    const view = createRunView(DEFAULT_RUN_VIEW, world.canvas, monthFixture(), {}).instance;
    world.tick(16);
    assert.ok(world.pending > 0, 'im sichtbaren Zustand wird weitergezeichnet');

    world.hide();
    // Der Zustandswechsel weckt einmal; dieses Bild erkennt die Verdeckung und
    // fordert kein weiteres an.
    while (world.pending) world.tick(200);
    assert.equal(world.pending, 0, 'verdeckt wird kein Bild mehr angefordert');

    world.show();
    assert.ok(world.pending > 0, 'sichtbar läuft die Schleife wieder an');
    view.stop();
  } finally {
    world.restore();
  }
});

test('eine Meldung weckt die ruhende Schleife', () => {
  // Ohne diesen Weg fröre die Ansicht in jeder ruhenden Betriebsart ein: Der
  // Zustand änderte sich, aber niemand zeichnete ihn.
  const world = environment();
  try {
    const view = createRunView(DEFAULT_RUN_VIEW, world.canvas, monthFixture(), {}).instance;
    world.hide();
    while (world.pending) world.tick(200);
    assert.equal(world.pending, 0);

    view.update({ phase: 'exact', progress: 0.5, message: 'weiter' });
    assert.ok(world.pending > 0, 'die Meldung fordert ein Bild an');
    view.stop();
  } finally {
    world.restore();
  }
});

test('stop meldet Beobachter und Zuhörer vollständig ab', () => {
  // Ein hängender Beobachter hielte die Ansicht nach dem Schließen des Dialogs
  // am Leben — und mit ihr die Leinwand und ihre Vorräte.
  const world = environment();
  try {
    const view = createRunView(DEFAULT_RUN_VIEW, world.canvas, monthFixture(), {}).instance;
    assert.ok(world.listeners.has('visibilitychange'), 'die Sichtbarkeit wird beobachtet');
    view.stop();
    assert.equal(world.observers.resize, 1);
    assert.equal(world.observers.intersection, 1);
    assert.equal(world.listeners.has('visibilitychange'), false);
    // Mehrfaches Anhalten ist Teil des Vertrags und darf nichts auslösen.
    assert.doesNotThrow(() => view.stop());
  } finally {
    world.restore();
  }
});

test('teure Bilder senken den Detailgrad, günstige heben ihn wieder', () => {
  const world = environment();
  try {
    const view = createRunView(DEFAULT_RUN_VIEW, world.canvas, monthFixture(), {}).instance;
    world.tick(16);
    assert.equal(world.canvas.dataset.renderDetail, 'full');

    // Eine anhaltend teure Bilddauer wird nicht behauptet, sondern gesetzt:
    // Geprüft wird die Entscheidung, nicht die Messung.
    view.averageFrameMs = 20;
    world.tick(200);
    assert.equal(world.canvas.dataset.renderDetail, 'constrained');
    assert.ok(view.detail < 0.6, 'der Detailgrad ist zurückgenommen');
    assert.ok(view.sparkLimit < 40, 'auch die Partikelzahl');

    view.averageFrameMs = 1;
    world.tick(400);
    assert.equal(world.canvas.dataset.renderDetail, 'full');
    view.stop();
  } finally {
    world.restore();
  }
});
