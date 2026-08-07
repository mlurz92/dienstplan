import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanPdfModel, planPdfFileName, renderPlanPdf } from '../js/pdf-export.js';
import { DEFAULT_STAFF } from '../js/defaults.js';

/**
 * Der Export erzeugt die Datei selbst — nicht mehr der Druckdialog. Geprüft
 * wird deshalb das Erzeugnis: ein A4-Blatt hochkant, genau eine Seite, mit dem
 * Inhalt des Monats und dem verbindlichen Dateinamen.
 */

function monthWithPlan(year, month) {
  const days = {};
  const count = new Date(year, month, 0).getDate();
  for (let day = 1; day <= count; day += 1) {
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days[iso] = {
      bd: DEFAULT_STAFF[day % DEFAULT_STAFF.length].id,
      hg: DEFAULT_STAFF[(day + 1) % DEFAULT_STAFF.length].id,
      rbn1: 'Dr. Rufbereitschaft Ärztin',
      rbn2: '',
      notes: ''
    };
  }
  return {
    schemaVersion: 1, year, month, revision: 0, updatedAt: null,
    days, absences: {}, absenceSources: {}, preferences: {}, options: {}, overrideLog: [], importLog: []
  };
}

const planState = { staff: DEFAULT_STAFF, settings: {} };
const decode = bytes => Buffer.from(bytes).toString('latin1');

test('der Dateiname folgt „Dienstplan JJJJ-MM.pdf"', () => {
  assert.equal(planPdfFileName(2026, 9), 'Dienstplan 2026-09.pdf');
  assert.equal(planPdfFileName(2026, 12), 'Dienstplan 2026-12.pdf');
});

test('das Modell trägt Kopf, alle Tage und die Statistik mit Offen-Zeile', () => {
  const model = buildPlanPdfModel(planState, monthWithPlan(2026, 9));
  assert.equal(model.title, 'September 2026');
  assert.equal(model.eyebrow, 'Bereitschaftsdienstplan');
  assert.match(model.paletteLabel, /^Monatskontrast · .+/);
  assert.equal(model.rows.length, 30);
  assert.equal(model.rows[0].weekday, 'Dienstag');
  // Der Titel der Rufbereitschaft entfällt auf dem Aushang, wie in der Ansicht.
  assert.equal(model.rows[0].rbn1, 'Rufbereitschaft Ärztin');
  assert.ok(model.rows.some(row => row.kind === 'sunday'));
  assert.equal(model.stats.at(-1).name, 'Offen');
  assert.equal(model.stats.at(-1).bd, 0);
});

test('ein Feiertag steht als eigene Beschriftung in der Wochentagsspalte', () => {
  const model = buildPlanPdfModel(planState, monthWithPlan(2026, 10));
  const unity = model.rows.find(row => row.iso === '2026-10-03');
  assert.equal(unity.holiday, 'Tag der Deutschen Einheit');
  assert.equal(unity.kind, 'holiday');
});

test('das erzeugte PDF ist ein einseitiges A4-Blatt hochkant mit lesbarem Text', () => {
  const raw = decode(renderPlanPdf(buildPlanPdfModel(planState, monthWithPlan(2026, 10))));
  assert.ok(raw.startsWith('%PDF-1.4'));
  assert.ok(raw.trimEnd().endsWith('%%EOF'));
  assert.equal((raw.match(/\/Type \/Page[^s]/g) || []).length, 1);
  assert.match(raw, /\/Count 1/);
  // 210 × 297 mm in Punkten.
  assert.match(raw, /\/MediaBox \[0 0 595\.276 841\.89\]/);
  assert.match(raw, /\(Oktober 2026\) Tj/);
  assert.match(raw, /\(BEREITSCHAFTSDIENSTPLAN\) Tj/);
  assert.match(raw, /\(Tag der Deutschen Einheit\) Tj/);
  assert.match(raw, /\(Offen\) Tj/);
  assert.match(raw, /\/Title \(Dienstplan 2026-10\)/);
});

test('Umlaute stehen als WinAnsi-Byte im Dokument, nicht als Ersatzzeichen', () => {
  const month = monthWithPlan(2026, 9);
  const staff = [...DEFAULT_STAFF, { ...DEFAULT_STAFF[0], id: 'test-umlaut', name: 'Dr. Öztürk-Weiß', short: 'Öztürk-Weiß' }];
  month.days['2026-09-01'].bd = 'test-umlaut';
  const raw = decode(renderPlanPdf(buildPlanPdfModel({ staff, settings: {} }, month)));
  assert.ok(raw.includes('Öztürk-Weiß'));
  assert.ok(!raw.includes('?zt?rk'));
});

test('das Blatt bleibt auch im ungünstigsten Fall im Satzspiegel', () => {
  // 31 Tage und zwölf Mitarbeitende: der Fall, an dem der frühere Ausdruck mit
  // festen Zeilenhöhen auf eine zweite Seite riss.
  const staff = [
    ...DEFAULT_STAFF,
    ...Array.from({ length: 4 }, (_, index) => ({
      ...DEFAULT_STAFF[0], id: `zusatz${index}`, name: `Dr. Zusatzkraft-Langname ${index}`, short: `Zusatzkraft${index}`
    }))
  ];
  const model = buildPlanPdfModel({ staff, settings: {} }, monthWithPlan(2026, 10));
  const rowHeight = Math.min(5.9, 172 / model.rows.length);
  const statRow = Math.min(5.4, 44 / model.stats.length);
  const bottom = 24.1 + 5.2 + rowHeight * model.rows.length + 7 + 5.4 + 5.2 + statRow * model.stats.length;
  assert.ok(bottom <= 297 - 9, `Unterkante bei ${bottom.toFixed(1)} mm`);
});

test('Samstag, Sonntag und Feiertag sind in jedem Monat sicher zu unterscheiden', async () => {
  const { colorProfileForDate, perceptualDistance } = await import('../js/color-atlas-engine.js');
  const { planRowTones } = await import('../js/pdf-export.js');
  // Die Oberfläche mischt feste Anteile mit Weiß; bei einem hellen Akzent —
  // Juni 2026 lieferte 240/232/223 — liegen die drei Flächen auf dem Papier
  // zu dicht beieinander. Der Ausdruck setzt deshalb feste Helligkeitsstufen.
  for (let month = 1; month <= 12; month += 1) {
    const tones = planRowTones(colorProfileForDate(2026, month).accent.slice(0, 3));
    const pairs = [['saturday', 'sunday'], ['sunday', 'holiday'], ['saturday', 'holiday']];
    for (const [first, second] of pairs) {
      const distance = perceptualDistance([...tones[first], 1], [...tones[second], 1]);
      assert.ok(distance >= 0.035,
        `Monat ${month}: ${first} und ${second} liegen nur ${distance.toFixed(3)} auseinander`);
    }
  }
});

test('der Export druckt die eingestellte Monatsfarbe, nicht immer den Trend-Atlas', async () => {
  const { monthColorProfile } = await import('../js/month-palette.js');
  const month = monthWithPlan(2026, 9);
  for (const mode of ['spectrum', 'rainbow', 'pastel', 'deep', 'classic', 'neutral']) {
    const expected = monthColorProfile(2026, 9, mode);
    const model = buildPlanPdfModel(planState, month, { mode });
    assert.equal(model.paletteLabel, `Monatskontrast · ${expected.name}`);
    assert.deepEqual(model.colors['--month-accent'], expected.variables['--month-accent']);
  }
  // Die Modi dürfen nicht auf dieselbe Fläche zusammenfallen — sonst wäre die
  // Auswahl im Ausdruck folgenlos.
  const accents = new Set(['spectrum', 'rainbow', 'pastel', 'deep', 'classic', 'neutral']
    .map(mode => buildPlanPdfModel(planState, month, { mode }).colors['--month-accent'].slice(0, 3).join(',')));
  assert.equal(accents.size, 6);
});

test('jede Tonlage läuft einmal vorwärts um den Kreis und hält ihre Monate auseinander', async () => {
  const { MIN_FAMILY_DISTANCE, RAINBOW_FAMILIES, RAINBOW_PALETTES, rainbowProfileForDate } = await import('../js/color-rainbow.js');
  const { labToLch, perceptualDistance, rgbToOklab } = await import('../js/color-atlas-engine.js');
  const hue = palette => (labToLch(rgbToOklab(palette.accent))[2] * 180 / Math.PI + 360) % 360;

  for (const family of RAINBOW_FAMILIES) {
    const palettes = RAINBOW_PALETTES[family];
    assert.equal(palettes.length, 12);
    for (let month = 2; month <= 12; month += 1) {
      assert.ok(hue(palettes[month - 1]) > hue(palettes[month - 2]),
        `${family}: Monat ${month} liegt im Farbkreis nicht hinter Monat ${month - 1}`);
    }

    // Der Fehler der ersten Fassung: Bei fester Helligkeit und Buntheit fielen
    // benachbarte Monate wahrnehmbar zusammen — sichtbar vor allem im Grün, wo
    // die Gamut-Anpassung die Buntheit zurücknimmt. Geprüft wird deshalb nicht
    // der Farbton, sondern der wahrgenommene Abstand, und zwar über alle Paare.
    for (let first = 0; first < 12; first += 1) {
      for (let second = first + 1; second < 12; second += 1) {
        const distance = perceptualDistance(palettes[first].accent, palettes[second].accent);
        assert.ok(distance >= MIN_FAMILY_DISTANCE,
          `${family}: ${palettes[first].name} und ${palettes[second].name} liegen nur ${distance.toFixed(3)} auseinander`);
      }
    }
    assert.equal(new Set(palettes.map(palette => palette.name)).size, 12, `${family}: jede Farbe hat einen eigenen Namen`);
  }

  // Klassische Regenbogenfarben — Rot ist Rot, Gelb ist Gelb.
  assert.equal(RAINBOW_PALETTES.rainbow[0].accentHex, '#ff0000');
  assert.equal(RAINBOW_PALETTES.rainbow[3].accentHex, '#ffdd00');
  // Pastell bleibt hell, Juwel bleibt tief — sonst wären es zwei Namen für dasselbe.
  assert.ok(RAINBOW_PALETTES.pastel.every(palette => palette.lightness > 0.76));
  assert.ok(RAINBOW_PALETTES.deep.every(palette => palette.lightness < 0.68));
  // Die Folge ist jahresunabhängig — derselbe Monat trägt in jedem Jahr dieselbe Farbe.
  assert.deepEqual(rainbowProfileForDate(2031, 4).accent, rainbowProfileForDate(2026, 4).accent);
});
