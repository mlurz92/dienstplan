import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_STAFF } from '../js/defaults.js';
import { runAutoPlan } from '../js/auto-plan-runner.js';

function monthWithTwoSlots() {
  return {
    schemaVersion: 1,
    year: 2026,
    month: 7,
    revision: 0,
    updatedAt: null,
    days: {
      '2026-07-13': { bd: '', hg: '', rbn1: '', rbn2: '', notes: '' }
    },
    absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: []
  };
}

function resultFor(runId) {
  return {
    success: true,
    complete: true,
    objectiveKey: [0, 0, 0, 0, runId],
    metrics: { red: 0, unfilled: 0 },
    changes: [{ dateIso: '2026-07-13', role: 'bd', staffId: 'lurz' }]
  };
}

class FakeWorker {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  postMessage(message) {
    queueMicrotask(() => {
      const emit = data => this.listeners.get('message')?.({ data });
      if (message.type === 'construct') {
        emit({ type: 'progress', runId: message.runId, update: { phase: 'search', stage: 'aufbau', processed: 1, total: 2, progress: .2 } });
        emit({ type: 'constructed', runId: message.runId, result: resultFor(message.runId) });
      } else {
        emit({ type: 'progress', runId: message.runId, update: { phase: 'perfect', stage: 'perfektion', progress: .8, improvements: 1 } });
        emit({ type: 'progress', runId: message.runId, update: { phase: 'complete', stage: 'abschluss', progress: 1, message: 'Worker fertig' } });
        emit({ type: 'done', runId: message.runId, result: resultFor(message.runId) });
      }
    });
  }

  terminate() {}
}

class AbortReplyWorker extends FakeWorker {
  postMessage(message) {
    queueMicrotask(() => {
      this.listeners.get('message')?.({
        data: { type: 'error', runId: message.runId, name: 'AbortError', message: 'Arbeitsstrang brach intern ab' }
      });
    });
  }
}

class ThrowingPostWorker extends FakeWorker {
  postMessage() {
    throw new DOMException('nicht klonbar', 'DataCloneError');
  }
}

class UnknownReplyWorker extends FakeWorker {
  postMessage(message) {
    queueMicrotask(() => {
      this.listeners.get('message')?.({ data: { type: 'mystery', runId: message.runId } });
    });
  }
}

function plannerFixture() {
  const monthData = monthWithTwoSlots();
  const key = '2026-07';
  return {
    monthData,
    plannerState: {
      months: new Map([[key, monthData]]),
      staff: structuredClone(DEFAULT_STAFF),
      currentYear: 2026,
      currentMonth: 7,
      monthSources: new Map([[key, 'server']])
    }
  };
}

test('Runner meldet abgeschlossene Aufbau- und Perfektionsportfolios', async () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = FakeWorker;
  const { monthData, plannerState } = plannerFixture();
  const progress = [];

  try {
    await runAutoPlan({
      state: plannerState,
      monthData,
      year: 2026,
      month: 7,
      runConfig: { allowRedFallback: false, searchIntensity: 'standard', performanceProfile: 'responsive' },
      onProgress: update => progress.push(update)
    });
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }

  const portfolio = progress.filter(update => update.portfolioEvent);
  assert.ok(portfolio.some(update => update.stage === 'aufbau'
    && update.portfolioCompleted + update.portfolioCancelled === update.portfolioTotal));
  assert.ok(portfolio.some(update => update.stage === 'perfektion'
    && update.portfolioCompleted + update.portfolioCancelled === update.portfolioTotal));
  const terminals = progress.filter(update => update.phase === 'complete' || update.phase === 'blocked');
  assert.equal(terminals.length, 1);
  const perfectionSettled = progress.findLastIndex(update => update.stage === 'perfektion'
    && update.portfolioCompleted + update.portfolioCancelled === update.portfolioTotal);
  assert.ok(progress.indexOf(terminals[0]) > perfectionSettled);
});

test('interner AbortError eines Workers beendet das Portfolio statt es aufzuhängen', async () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = AbortReplyWorker;
  const { monthData, plannerState } = plannerFixture();
  const progress = [];

  try {
    const outcome = await Promise.race([
      runAutoPlan({
        state: plannerState,
        monthData,
        year: 2026,
        month: 7,
        runConfig: { allowRedFallback: false, searchIntensity: 'standard', performanceProfile: 'responsive' },
        onProgress: update => progress.push(update)
      }).then(() => 'resolved', error => error?.message || 'rejected'),
      new Promise(resolve => setTimeout(() => resolve('hung'), 80))
    ]);
    assert.notEqual(outcome, 'hung');
    assert.ok(progress.some(update => update.portfolioFailed > 0));
    assert.ok(progress.filter(update => update.portfolioEvent).every(update =>
      update.portfolioCompleted + update.portfolioFailed + update.portfolioCancelled <= update.portfolioTotal));
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }
});

test('fehlgeschlagenes Worker-Posting entfernt den äußeren Abbruchlistener', async () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = ThrowingPostWorker;
  const { monthData, plannerState } = plannerFixture();
  let handler;
  let removed = 0;
  const signal = {
    aborted: false,
    addEventListener: (_type, value) => { handler = value; },
    removeEventListener: (_type, value) => { if (value === handler) removed += 1; }
  };

  try {
    await assert.rejects(runAutoPlan({
      state: plannerState,
      monthData,
      year: 2026,
      month: 7,
      runConfig: { allowRedFallback: false, searchIntensity: 'standard', performanceProfile: 'responsive' },
      signal
    }), error => error?.name === 'DataCloneError');
    assert.equal(removed, 1);
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }
});

test('unbekannte Workerantwort beendet den Auftrag kontrolliert', async () => {
  const originalWorker = globalThis.Worker;
  globalThis.Worker = UnknownReplyWorker;
  const { monthData, plannerState } = plannerFixture();
  const progress = [];

  try {
    const outcome = await Promise.race([
      runAutoPlan({
        state: plannerState,
        monthData,
        year: 2026,
        month: 7,
        runConfig: { allowRedFallback: false, searchIntensity: 'standard', performanceProfile: 'responsive' },
        onProgress: update => progress.push(update)
      }).then(() => 'resolved', error => error?.message || 'rejected'),
      new Promise(resolve => setTimeout(() => resolve('hung'), 100))
    ]);

    assert.notEqual(outcome, 'hung');
    assert.ok(progress.some(update => update.portfolioFailed > 0));
  } finally {
    if (originalWorker === undefined) delete globalThis.Worker;
    else globalThis.Worker = originalWorker;
  }
});
