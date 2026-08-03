import test from 'node:test';
import assert from 'node:assert/strict';

import { AlgorithmCommentary } from '../js/auto-plan-commentary.js';

function collector() {
  const entries = [];
  const commentary = new AlgorithmCommentary({ onEntry: entry => entries.push(entry), minimumGapMs: 0 });
  return { entries, commentary, texts: () => entries.map(entry => entry.text.replace(/<[^>]+>/g, '')) };
}

/**
 * Mehrere Suchläufe melden gleichzeitig, und der Minimal-Rot-Rückfall meldet
 * sich schon in der ersten Sekunde. Ohne feste Ordnung stand seine Meldung vor
 * der Constraint-Suche.
 */
test('Meilensteine erscheinen in ihrer sachlichen Reihenfolge, unabhängig vom Eingang', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 2, searches: 3 });
  commentary.observe({ phase: 'analysis' });
  commentary.observe({ phase: 'perfect' });
  commentary.observe({ phase: 'search' });   // späterer Eingang, frühere Stufe
  commentary.observe({ phase: 'polish' });   // ebenso
  commentary.observe({ phase: 'certify' });

  const milestones = texts().filter(text => text.includes('·')).map(text => text.split(' ·')[0]);
  assert.deepEqual(milestones, [
    'Lauf gestartet',
    'Fixpunkte werden gesichert',
    'Perfektionsphase läuft',
    'Optimalitätsnachweis läuft'
  ]);
});

test('jeder Meilenstein erscheint höchstens einmal, auch bei drei parallelen Läufen', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 0, searches: 3 });
  for (let run = 0; run < 3; run += 1) {
    commentary.observe({ phase: 'analysis' });
    commentary.observe({ phase: 'search' });
    commentary.observe({ phase: 'perfect' });
  }
  const announcements = texts().filter(text => text.startsWith('Constraint-Suche läuft'));
  assert.equal(announcements.length, 1);
});

test('die Schlussmeldung eines Perfektionslaufs erscheint nur einmal', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 0, searches: 3 });
  commentary.observe({ phase: 'complete', message: '10 Vorschläge · 0 rote Konflikte · Fairness 93%' });
  commentary.observe({ phase: 'complete', message: '10 Vorschläge · 0 rote Konflikte · Fairness 94%' });
  commentary.observe({ phase: 'complete', message: '10 Vorschläge · 0 rote Konflikte · Fairness 93%' });
  assert.equal(texts().filter(text => text.startsWith('Fertig')).length, 1);
});

test('Ereignisse melden ihren eigenen Grund und blockieren keinen Meilenstein', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 0, searches: 3 });
  commentary.observe({ phase: 'repair', message: 'Keine vollständige Null-Rot-Variante gefunden · Minimal-Rot-Fallback startet' });
  commentary.observe({ phase: 'search' });
  const lines = texts();
  assert.ok(lines.some(text => text.startsWith('Keine vollständige Null-Rot-Variante')));
  assert.ok(lines.some(text => text.startsWith('Constraint-Suche läuft')));
});

test('die Abschlusszeile nennt Belegung, Regelstand und Fairness', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 4, fixed: 0, searches: 1 });
  commentary.finish({
    complete: true,
    certified: true,
    changes: [1, 2, 3, 4],
    metrics: { red: 0, yellow: 5, fairnessIndex: 91 }
  });
  const final = texts().at(-1);
  assert.match(final, /Ergebnis steht/);
  assert.match(final, /4 Felder belegt/);
  assert.match(final, /0 rot/);
  assert.match(final, /Fairness 91 %/);
  assert.match(final, /zertifiziert/);
});

test('ein unvollständiger Vorschlag wird als solcher benannt', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 4, fixed: 0, searches: 1 });
  commentary.finish({ complete: false, metrics: { unfilled: 3 } });
  assert.match(texts().at(-1), /Kein vollständiger Vorschlag · 3 Felder blieben offen/);
});
