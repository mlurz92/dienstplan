/**
 * Der Tag nach einem Bereitschaftsdienst ist dienstfrei.
 *
 * Wer nachts Bereitschaft getragen hat, steht am Folgetag für keinen weiteren
 * Dienst zur Verfügung. Für den Bereitschaftsdienst war das bereits gesperrt
 * („BD bereits am Vortag"); für den Hintergrunddienst fehlte die Entsprechung.
 *
 * AUSNAHME WOCHENENDE: Samstag und Sonntag ist der Hintergrunddienst unmittelbar
 * nach einem Bereitschaftsdienst zulässig — auf dieser Kopplung beruht die
 * Wochenendbündelung (Fr-BD · Sa-HG und Sa-BD · So-HG). Der Freitag zählt dabei
 * nicht als Wochenende: Ein Donnerstags-BD lässt den Freitag genauso dienstfrei
 * wie jeden anderen Werktag.
 *
 * Geprüft wird an beiden Orten, an denen die Regel gelten muss: in der
 * Regelengine, die verbindlich entscheidet, und im Booleschen Modell, aus dem
 * die exakte Suche ihre Vorschläge zieht. Fehlte sie im Modell, schlüge das
 * Schlussaudit jeden Vorschlag zurück, ohne dass die Suche wüsste, warum.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.TZ = 'Europe/Berlin';

const { DEFAULT_STAFF } = await import('../js/defaults.js');
const { evaluateCandidate, setAssignment } = await import('../js/rules.js');
const model = await import('../js/auto-plan-model.js?v=20260806.1');

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

/** Juli 2026: 06. Mo, 07. Di, 08. Mi, 09. Do, 10. Fr, 11. Sa, 12. So */
const JULY = ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-11', '2026-07-12'];

function hgAfterBd(bdIso, hgIso) {
  const monthData = month(JULY);
  setAssignment(monthData, bdIso, 'bd', 'lurz');
  const state = stateWith(monthData);
  return evaluateCandidate({ state, monthData, dateIso: hgIso, role: 'hg', staffId: 'lurz' });
}

test('HG am Werktag nach eigenem BD ist gesperrt', () => {
  // Montags-BD → Dienstags-HG.
  const evaluation = hgAfterBd('2026-07-06', '2026-07-07');
  assert.equal(evaluation.level, 'red');
  assert.equal(evaluation.canSelect, false, 'nicht verfügbar, nicht nur bestätigungspflichtig');
  assert.ok(
    evaluation.reasons.some(reason => reason.includes('BD am Vortag')),
    `Begründung fehlt: ${JSON.stringify(evaluation.reasons)}`
  );
});

test('auch der Freitag nach einem Donnerstags-BD bleibt dienstfrei', () => {
  const evaluation = hgAfterBd('2026-07-09', '2026-07-10');
  assert.equal(evaluation.level, 'red');
  assert.equal(evaluation.canSelect, false);
});

test('am Samstag ist HG unmittelbar nach einem Freitags-BD zulässig', () => {
  const evaluation = hgAfterBd('2026-07-10', '2026-07-11');
  assert.notEqual(evaluation.level, 'red');
  assert.equal(evaluation.canSelect, true);
  assert.ok(!evaluation.reasons.some(reason => reason.includes('BD am Vortag')));
});

test('am Sonntag ist HG unmittelbar nach einem Samstags-BD zulässig', () => {
  const evaluation = hgAfterBd('2026-07-11', '2026-07-12');
  assert.notEqual(evaluation.level, 'red');
  assert.equal(evaluation.canSelect, true);
});

test('ein fremder BD am Vortag sperrt den HG nicht', () => {
  const monthData = month(JULY);
  setAssignment(monthData, '2026-07-06', 'bd', 'dalitz');
  const state = stateWith(monthData);
  const evaluation = evaluateCandidate({
    state, monthData, dateIso: '2026-07-07', role: 'hg', staffId: 'lurz'
  });
  assert.equal(evaluation.canSelect, true);
  assert.ok(!evaluation.reasons.some(reason => reason.includes('BD am Vortag')));
});

test('das Modell verbietet HG am Folgetag eines BD und lässt das Wochenende frei', () => {
  const monthData = month(JULY);
  const built = model.buildPlanModel({ state: stateWith(monthData), monthData });
  const restIds = built.constraints
    .filter(constraint => constraint.id.startsWith('bdhg_'))
    .map(constraint => constraint.id.replace(/^bdhg_/, '').replace(/_.*$/, ''));
  const covered = new Set(restIds);

  // Für jeden Tag, dessen Folgetag ein Werktag ist, muss es die Bedingung geben.
  for (const [index, dateIso] of JULY.slice(0, -1).entries()) {
    const nextWeekday = new Date(`${JULY[index + 1]}T12:00:00`).getDay();
    const weekend = nextWeekday === 6 || nextWeekday === 0;
    assert.equal(
      covered.has(dateIso),
      !weekend,
      `${dateIso} → ${JULY[index + 1]}: ${weekend ? 'Wochenende, keine Sperre erwartet' : 'Sperre erwartet'}`
    );
  }

  // Jede solche Bedingung ist eine Paarsperre BD + HG ≤ 1. Ist eine der beiden
  // Seiten bereits fest — die Person ist an dem Tag gar nicht wählbar oder das
  // Feld ist belegt —, bleibt nur die freie Seite übrig; die Sperre gilt dann
  // gegen eine Konstante und trägt entsprechend einen Term.
  const pairs = built.constraints.filter(item => item.id.startsWith('bdhg_'));
  assert.ok(pairs.length > 0);
  let fullPairs = 0;
  for (const constraint of pairs) {
    assert.equal(constraint.group, 'rest');
    assert.equal(constraint.ub, 1);
    assert.ok(constraint.terms.length >= 1 && constraint.terms.length <= 2);
    if (constraint.terms.length !== 2) continue;
    fullPairs += 1;
    const [bdIndex, hgIndex] = constraint.terms.map(([index]) => index);
    assert.equal(built.vars[bdIndex].meta.role, 'bd');
    assert.equal(built.vars[hgIndex].meta.role, 'hg');
    assert.equal(built.vars[bdIndex].meta.staffId, built.vars[hgIndex].meta.staffId);
  }
  assert.ok(fullPairs > 0, 'mindestens eine Sperre verbindet zwei freie Felder');
});
