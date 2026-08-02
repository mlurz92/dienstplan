import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PICKER_GROUPS,
  buildPickerModel,
  candidateMatchesQuery,
  filterPickerModel,
  flattenPickerModel,
  groupIdForCandidate,
  loadSummary,
  nextSelectableIndex,
  normalizeSearchText,
  primaryReason
} from '../js/picker-view.js';

const candidate = (name, level, options = {}) => ({
  person: {
    id: options.id || name.toLowerCase().replace(/[^a-z]/g, ''),
    name,
    short: options.short || name,
    roleLabel: options.roleLabel || 'FA',
    bdTarget: options.bdTarget ?? 4
  },
  role: options.role || 'bd',
  evaluation: {
    level,
    canSelect: options.canSelect ?? level !== 'gray',
    reasons: options.reasons || ['Keine relevanten Konflikte'],
    meta: {
      currentBd: options.currentBd ?? 0,
      currentHg: options.currentHg ?? 0,
      combinedLoad: options.combinedLoad,
      aaHgCount: options.aaHgCount ?? 0,
      recommendationScore: options.recommendationScore ?? 0,
      recommendationVector: options.recommendationVector,
      historicalServices: options.historicalServices ?? 0
    }
  }
});

test('every candidate lands in exactly one decision group', () => {
  assert.equal(groupIdForCandidate(candidate('A', 'green', { recommendationScore: 100 })), 'recommended');
  assert.equal(groupIdForCandidate(candidate('B', 'green')), 'available');
  assert.equal(groupIdForCandidate(candidate('C', 'yellow')), 'notice');
  assert.equal(groupIdForCandidate(candidate('D', 'orange')), 'secondary');
  assert.equal(groupIdForCandidate(candidate('E', 'red')), 'confirm');
  assert.equal(groupIdForCandidate(candidate('F', 'gray')), 'blocked');
  assert.equal(groupIdForCandidate(candidate('G', 'green', { canSelect: false })), 'blocked');
});

test('groups appear in decision order and empty groups disappear', () => {
  const model = buildPickerModel([
    candidate('Rot', 'red'),
    candidate('Empfohlen', 'green', { recommendationScore: 45 }),
    candidate('Hinweis', 'yellow')
  ]);
  assert.deepEqual(model.map(group => group.id), ['recommended', 'notice', 'confirm']);
  assert.ok(PICKER_GROUPS.every(group => group.label && group.hint));
});

test('recommendations follow the fixed lexicographic priority cascade', () => {
  const model = buildPickerModel([
    candidate('Viele niedrige Signale', 'green', { recommendationVector: [0, 0, 10, 10, 10, 10] }),
    candidate('Expliziter Wunsch', 'green', { recommendationVector: [0, 1, 0, 0, 0, 0] }),
    candidate('Kopplung', 'green', { recommendationVector: [1, 0, 0, 0, 0, 0] })
  ]);
  assert.deepEqual(model[0].entries.map(entry => entry.person.name), [
    'Kopplung',
    'Expliziter Wunsch',
    'Viele niedrige Signale'
  ]);
});

test('inside a group the lowest role-specific load comes first without annual-history tie-break', () => {
  const model = buildPickerModel([
    candidate('Viel Last', 'green', { currentBd: 3 }),
    candidate('Wenig Last', 'green', { currentBd: 1, historicalServices: 9 }),
    candidate('Gleiche Last', 'green', { currentBd: 1, historicalServices: 0 }),
    candidate('Wunsch', 'green', { recommendationScore: 100, currentBd: 3 })
  ]);
  const [recommended, available] = model;
  assert.deepEqual(recommended.entries.map(entry => entry.person.name), ['Wunsch']);
  assert.deepEqual(available.entries.map(entry => entry.person.name), [
    'Gleiche Last', 'Wenig Last', 'Viel Last'
  ]);
});

test('the BD load summary reports the role count against the target', () => {
  const bd = loadSummary(candidate('A', 'green', { currentBd: 2, bdTarget: 4 }));
  assert.equal(bd.text, '2/4');
  assert.equal(bd.exceeded, false);
  assert.match(bd.title, /^BD im Monat: 2 von 4/);

  const full = loadSummary(candidate('B', 'green', { currentBd: 4, bdTarget: 4 }));
  assert.equal(full.exceeded, true);
});

test('the HG load summary exposes combined load and AA-HG count', () => {
  const hg = loadSummary(candidate('C', 'green', {
    role: 'hg', currentBd: 4, currentHg: 1, combinedLoad: 5, aaHgCount: 2
  }));
  assert.equal(hg.text, '1 · Gesamt 5');
  assert.equal(hg.sortLoad, 5);
  assert.equal(hg.aaHg, 2);
  assert.equal(hg.ratio, null);
  assert.match(hg.title, /HG für AA-BD: 2/);
});

test('HG candidates sort by combined load and then by AA-HG burden', () => {
  const model = buildPickerModel([
    candidate('Mehr Gesamt', 'green', { role: 'hg', currentBd: 4, currentHg: 1, combinedLoad: 5, aaHgCount: 0 }),
    candidate('Mehr AA-HG', 'green', { role: 'hg', currentBd: 2, currentHg: 1, combinedLoad: 3, aaHgCount: 2 }),
    candidate('Weniger AA-HG', 'green', { role: 'hg', currentBd: 2, currentHg: 1, combinedLoad: 3, aaHgCount: 1 })
  ]);
  assert.deepEqual(model[0].entries.map(entry => entry.person.name), [
    'Weniger AA-HG', 'Mehr AA-HG', 'Mehr Gesamt'
  ]);
});

test('the type filter ignores case, punctuation and German umlauts', () => {
  assert.equal(normalizeSearchText('Dr. Schäfer'), 'dr schaefer');
  const person = candidate('Fr. Dalitz', 'green', { short: 'Dalitz', roleLabel: 'FÄ/OÄ' });
  assert.ok(candidateMatchesQuery(person, ''));
  assert.ok(candidateMatchesQuery(person, 'dal'));
  assert.ok(candidateMatchesQuery(person, 'fr dal'));
  assert.ok(candidateMatchesQuery(person, 'fä'));
  assert.ok(!candidateMatchesQuery(person, 'lurz'));
});

test('filtering keeps the grouping and drops groups that lose all entries', () => {
  const model = buildPickerModel([
    candidate('Dr. Lurz', 'green'),
    candidate('Dr. Martin', 'red')
  ]);
  const filtered = filterPickerModel(model, 'lurz');
  assert.deepEqual(filtered.map(group => group.id), ['available']);
  assert.equal(flattenPickerModel(filtered).length, 1);
  assert.equal(flattenPickerModel(filterPickerModel(model, 'niemand')).length, 0);
});

test('arrow keys skip blocked people and wrap around', () => {
  const entries = [
    candidate('Gesperrt', 'gray'),
    candidate('Erste', 'green'),
    candidate('Zweite', 'green'),
    candidate('Auch gesperrt', 'gray')
  ];
  assert.equal(nextSelectableIndex(entries, -1, 1), 1);
  assert.equal(nextSelectableIndex(entries, -1, -1), 2);
  assert.equal(nextSelectableIndex(entries, 1, 1), 2);
  assert.equal(nextSelectableIndex(entries, 2, 1), 1);
  assert.equal(nextSelectableIndex(entries, 1, -1), 2);
  assert.equal(nextSelectableIndex(entries, 0, 1), 1);
  assert.equal(nextSelectableIndex([candidate('Nur gesperrt', 'gray')], -1, 1), -1);
});

test('the row shows the leading reason and counts the rest', () => {
  const withReasons = candidate('A', 'yellow', { reasons: ['Kurzer Abstand zum letzten BD', 'Weiterer Hinweis'] });
  assert.equal(primaryReason(withReasons), 'Kurzer Abstand zum letzten BD');
  assert.equal(primaryReason({ evaluation: { reasons: [] } }), '');
});
