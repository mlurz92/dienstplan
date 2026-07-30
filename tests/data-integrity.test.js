import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMonthData } from '../js/defaults.js';
import { ensureMonthShape } from '../functions/_utils.js';
import { onRequestPost as importBackup } from '../functions/api/import.js';

test('Monatsnormalisierung ergänzt jeden Tag tief und verwirft monatsfremde Daten', () => {
  const normalized = normalizeMonthData(2026, 7, {
    revision: '4',
    days: {
      '2026-07-01': { bd: 'lurz' },
      '2026-08-01': { bd: 'martin' }
    },
    absences: {
      lurz: {
        '2026-07-02': 'urlaub',
        '2026-08-02': 'urlaub'
      }
    },
    overrideLog: ['ungültig', { dateIso: '2026-07-01' }]
  });

  assert.deepEqual(normalized.days['2026-07-01'], {
    bd: 'lurz',
    hg: '',
    rbn1: '',
    rbn2: '',
    notes: ''
  });
  assert.equal(Object.hasOwn(normalized.days, '2026-08-01'), false);
  assert.deepEqual(normalized.absences, { lurz: { '2026-07-02': 'urlaub' } });
  assert.deepEqual(normalized.overrideLog, [{ dateIso: '2026-07-01' }]);
  assert.equal(normalized.revision, 4);
  assert.equal(normalized.year, 2026);
  assert.equal(normalized.month, 7);
});

test('Backend und Frontend verwenden dieselbe tiefe Monatsnormalisierung', () => {
  const normalized = ensureMonthShape(2026, 7, { days: { '2026-07-03': { hg: 'dalitz' } } });
  assert.deepEqual(normalized.days['2026-07-03'], {
    bd: '',
    hg: 'dalitz',
    rbn1: '',
    rbn2: '',
    notes: ''
  });
});

function importContext(payload) {
  const writes = new Map();
  return {
    writes,
    context: {
      request: new Request('https://example.test/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }),
      env: {
        DIENSTPLAN_KV: {
          get: async key => writes.get(key) ?? null,
          put: async (key, value) => writes.set(key, value),
          delete: async key => writes.delete(key)
        }
      }
    }
  };
}

test('JSON-Import lehnt einen fehlerhaften Monat vor jedem KV-Schreibzugriff ab', async () => {
  const { context, writes } = importContext({
    settings: { appName: 'Nicht schreiben' },
    months: [['2026-13', {}]]
  });
  const response = await importBackup(context);
  assert.equal(response.status, 400);
  assert.equal(writes.size, 0);
});

test('JSON-Import speichert gültige Teilmonate normalisiert', async () => {
  const { context, writes } = importContext({
    months: [['2026-07', { days: { '2026-07-01': { bd: 'lurz' } } }]]
  });
  const response = await importBackup(context);
  assert.equal(response.status, 200);
  const stored = JSON.parse(writes.get('year:2026:month:07'));
  assert.deepEqual(stored.days['2026-07-01'], {
    bd: 'lurz',
    hg: '',
    rbn1: '',
    rbn2: '',
    notes: ''
  });
});
