import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const {
  collectIssues,
  evaluateCandidate,
  setAssignment
} = await import('../js/rules.js');

function month(dates) {
  return {
    schemaVersion: 1,
    year: Number(dates[0].slice(0, 4)),
    month: Number(dates[0].slice(5, 7)),
    revision: 0,
    updatedAt: null,
    days: Object.fromEntries(dates.map(dateIso => [dateIso, {
      bd: '', hg: '', rbn1: '', rbn2: '', notes: ''
    }])),
    absences: {},
    absenceSources: {},
    preferences: {},
    options: {},
    overrideLog: [],
    importLog: []
  };
}

function stateWith(monthData) {
  const key = `${monthData.year}-${String(monthData.month).padStart(2, '0')}`;
  return {
    months: new Map([[key, monthData]]),
    staff: structuredClone(DEFAULT_STAFF),
    currentYear: monthData.year,
    currentMonth: monthData.month
  };
}

test('Montags-HG vor eigenem Dienstags-BD ist rot', () => {
  const monthData = month(['2026-07-06', '2026-07-07']);
  setAssignment(monthData, '2026-07-07', 'bd', 'lurz');
  const state = stateWith(monthData);
  const evaluation = evaluateCandidate({
    state,
    monthData,
    dateIso: '2026-07-06',
    role: 'hg',
    staffId: 'lurz'
  });

  assert.equal(evaluation.level, 'red');
  assert.equal(evaluation.canSelect, true);
  assert.equal(evaluation.meta.confirmationType, 'standard');
  assert.ok(evaluation.reasons.some(reason => reason.includes('HG am Werktag vor eigenem BD')));
});

test('Dienstags-BD nach eigenem Montags-HG ist unabhängig von der Eingabereihenfolge rot', () => {
  const monthData = month(['2026-07-06', '2026-07-07']);
  setAssignment(monthData, '2026-07-06', 'hg', 'lurz');
  const state = stateWith(monthData);
  const evaluation = evaluateCandidate({
    state,
    monthData,
    dateIso: '2026-07-07',
    role: 'bd',
    staffId: 'lurz'
  });

  assert.equal(evaluation.level, 'red');
  assert.ok(evaluation.reasons.some(reason => reason.includes('HG am Werktag vor eigenem BD')));
});

test('Freitags-HG vor Samstags-BD wird nicht durch die Werktagsregel rot', () => {
  const monthData = month(['2026-07-03', '2026-07-04']);
  setAssignment(monthData, '2026-07-04', 'bd', 'lurz');
  const state = stateWith(monthData);
  const evaluation = evaluateCandidate({
    state,
    monthData,
    dateIso: '2026-07-03',
    role: 'hg',
    staffId: 'lurz'
  });

  assert.equal(evaluation.reasons.some(reason => reason.includes('HG am Werktag vor eigenem BD')), false);
});

test('eine bereits nicht wählbare Person wird durch die Zusatzpolicy niemals freigeschaltet', () => {
  const monthData = month(['2026-07-06', '2026-07-07']);
  setAssignment(monthData, '2026-07-07', 'bd', 'licenji');
  const state = stateWith(monthData);
  const evaluation = evaluateCandidate({
    state,
    monthData,
    dateIso: '2026-07-06',
    role: 'hg',
    staffId: 'licenji'
  });

  assert.equal(evaluation.level, 'red');
  assert.equal(evaluation.canSelect, false);
  assert.ok(evaluation.reasons.some(reason => reason.includes('HG nur für Fachärzte')));
  assert.equal(evaluation.reasons.some(reason => reason.includes('HG am Werktag vor eigenem BD')), false);
});

test('offene Punkte verwenden dieselbe rote Werktagsregel', () => {
  const monthData = month(['2026-07-06', '2026-07-07']);
  setAssignment(monthData, '2026-07-06', 'hg', 'lurz');
  setAssignment(monthData, '2026-07-07', 'bd', 'lurz');
  const state = stateWith(monthData);
  const issues = collectIssues(state, monthData);

  assert.ok(issues.some(issue =>
    issue.level === 'red'
    && issue.details.includes('HG am Werktag vor eigenem BD')));
});
