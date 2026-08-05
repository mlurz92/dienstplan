import test from 'node:test';
import assert from 'node:assert/strict';

import { AlgorithmCommentary, commentaryParts } from '../js/auto-plan-commentary.js';

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

test('parallele Blockaden erzeugen genau eine Schlussmeldung', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 4, fixed: 0, searches: 3 });
  commentary.observe({ phase: 'blocked', message: 'Profil eins blieb unvollständig' });
  commentary.observe({ phase: 'blocked', message: 'Profil zwei blieb unvollständig' });
  commentary.observe({ phase: 'blocked', message: 'Profil drei blieb unvollständig' });

  assert.equal(texts().filter(text => text.startsWith('Blockiert')).length, 1);
});

test('Engpassmeldung nennt reale Suchkennzahlen', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 2, searches: 2 });
  commentary.observe({
    phase: 'search', role: 'hg', dateIso: '2026-07-14', candidateCount: 2,
    beamSize: 12, exploredNodes: 1840, deadEnds: 37, processed: 7, total: 20
  });

  const line = texts().at(-1);
  assert.match(line, /HG am 14\.07\./);
  assert.match(line, /2 Personen/);
  assert.match(line, /12 Varianten/);
  assert.match(line, /1\.840 Zustände/);
  assert.match(line, /7\/20 Felder/);
});

test('Portfolioabschluss nennt erledigte Arbeitsstränge', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 2, searches: 3 });
  commentary.observe({
    phase: 'search', stage: 'aufbau', portfolioEvent: true,
    portfolioCompleted: 2, portfolioTotal: 3, portfolioActive: 1, portfolioCancelled: 0
  });

  assert.match(texts().at(-1), /2\/3 Aufbauläufe abgeschlossen/);
});

test('normalisierte Perfektionsportfolios werden als Perfektion benannt', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 2, searches: 1 });
  commentary.observe({
    phase: 'perfect', stage: 'perfection', portfolioEvent: true,
    portfolioCompleted: 0, portfolioFailed: 1, portfolioTotal: 1, portfolioActive: 0
  });

  assert.match(texts().at(-1), /Perfektionsläufe abgeschlossen/);
  assert.match(texts().at(-1), /1 fehlgeschlagen/);
});

test('Analysekommentar erklärt Kernverteilung und UI-Reserve', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 24, fixed: 8, searches: 3 });
  commentary.observe({
    phase: 'analysis',
    executionPlan: { constructionWorkers: 3, perfectionWorkers: 2, reserveCores: 1, reason: 'balanced-throughput' }
  });

  assert.match(texts().at(-1), /3 Aufbau/);
  assert.match(texts().at(-1), /2 Perfektion/);
  assert.match(texts().at(-1), /1 Kern.*Oberfläche/);
  assert.match(texts().at(-1), /ausbalanciert/);
});

test('Perfektionskommentar nennt Runde, Nachbarschaft, Prüfmenge und Restbudget', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 2, searches: 3 });
  commentary.observe({
    phase: 'perfect', scanning: 'paartausch', optimizerRound: 7,
    moves: 1260, evaluations: 8420, accepted: 3, remainingMs: 17850
  });

  const line = texts().at(-1);
  assert.match(line, /Runde 7/);
  assert.match(line, /Paartausch/);
  assert.match(line, /8\.420 Bewertungen/);
  assert.match(line, /1\.260 Züge/);
  assert.match(line, /3 übernommen/);
  assert.match(line, /18 s Restbudget/);
});

test('Verbesserungskommentar nennt kumulierten Zugewinn und Rechenaufwand', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 10, fixed: 2, searches: 3 });
  commentary.observe({
    phase: 'perfect', improvements: 4, neighbourhood: 'dreierkette',
    evaluations: 2311, changedCells: [{ dateIso: '2026-07-14' }]
  });

  const line = texts().at(-1);
  assert.match(line, /Verbesserung 4/);
  assert.match(line, /Dreierkette/);
  assert.match(line, /14\.07\./);
  assert.match(line, /2\.311 Bewertungen/);
});

test('Abschlusskommentar weist neben Regelstand auch Wünsche und Sucharbeit aus', () => {
  const { commentary, texts } = collector();
  commentary.begin({ open: 4, fixed: 0, searches: 2 });
  commentary.finish({
    complete: true,
    certified: true,
    changes: [1, 2, 3, 4],
    metrics: {
      red: 0, yellow: 1, orange: 2, fairnessIndex: 96, wishesFulfilled: 7, wishesPossible: 8,
      exploredNodes: 12450, optimizer: { evaluations: 33100 }
    },
    elapsedMs: 9432
  });

  const final = texts().at(-1);
  assert.match(final, /2 orange/);
  assert.match(final, /Wünsche 88 %/);
  assert.match(final, /12\.450 Suchzustände/);
  assert.match(final, /33\.100 Bewertungen/);
  assert.match(final, /9,4 s/);
});

test('Kommentarbestandteile behandeln fremde Markierung als Text', () => {
  const parts = commentaryParts('<b>Blockiert</b> · <img src=x onerror=alert(1)>');

  assert.equal(parts.emphasis, 'Blockiert');
  assert.equal(parts.detail, ' · <img src=x onerror=alert(1)>');
});
