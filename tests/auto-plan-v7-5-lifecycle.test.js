import test from 'node:test';
import assert from 'node:assert/strict';

import { AutoPlanRunEpoch, abortableDelay } from '../js/auto-plan-lifecycle.js';

test('Bereits abgebrochene Überleitung lehnt sofort ab', async () => {
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(abortableDelay(620, controller.signal), error => error?.name === 'AbortError');
});

test('Abbruch räumt den Überleitungszeitgeber auf', async () => {
  const controller = new AbortController();
  let callback;
  let cleared = 0;
  const promise = abortableDelay(620, controller.signal, {
    setTimeoutFn: handler => { callback = handler; return 41; },
    clearTimeoutFn: id => { assert.equal(id, 41); cleared += 1; }
  });

  controller.abort();
  await assert.rejects(promise, error => error?.name === 'AbortError');
  assert.equal(cleared, 1);
  assert.equal(typeof callback, 'function');
});

test('Erfolgreiche Überleitung entfernt den Abbruchlistener', async () => {
  let abortHandler;
  let removed = 0;
  const signal = {
    aborted: false,
    addEventListener: (_type, handler) => { abortHandler = handler; },
    removeEventListener: (_type, handler) => { if (handler === abortHandler) removed += 1; }
  };
  let callback;
  const promise = abortableDelay(620, signal, {
    setTimeoutFn: handler => { callback = handler; return 7; },
    clearTimeoutFn: () => {}
  });

  callback();
  await promise;
  assert.equal(removed, 1);
});

test('Synchroner Testzeitgeber kann ohne Initialisierungsfehler abschließen', async () => {
  const signal = {
    aborted: false,
    addEventListener: () => {},
    removeEventListener: () => {}
  };

  await abortableDelay(0, signal, {
    setTimeoutFn: handler => { handler(); return 0; },
    clearTimeoutFn: () => {}
  });
});

test('Ungültig gemachter Lauf darf kein spätes Ergebnis veröffentlichen', () => {
  const epoch = new AutoPlanRunEpoch();
  const first = epoch.begin();
  epoch.invalidate();

  assert.equal(epoch.isCurrent(first), false);
  assert.throws(() => epoch.assertCurrent(first), error => error?.name === 'AbortError');
});

test('Neuer Lauf ersetzt die Freigabe des vorigen Laufs', () => {
  const epoch = new AutoPlanRunEpoch();
  const first = epoch.begin();
  const second = epoch.begin();

  assert.equal(epoch.isCurrent(first), false);
  assert.equal(epoch.isCurrent(second), true);
});
