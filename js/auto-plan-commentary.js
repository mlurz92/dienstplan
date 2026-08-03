/**
 * Algorithmuskommentierung – was der Lauf gerade tut, in Klartext.
 *
 * Ein Fortschrittsbalken beantwortet nur, wie weit es ist. Diese Kommentierung
 * beantwortet, *was* geschieht und *warum* es hilft: welcher Ausschnitt gerade
 * neu aufgebaut wird, welcher Tausch übernommen wurde, wie viele Züge der
 * Optimalitätsnachweis bereits geprüft hat.
 *
 * Sie erfindet dabei nichts. Jede Zeile entsteht aus einem tatsächlichen
 * Fortschrittsereignis des Algorithmus; die Übersetzung ordnet nur zu und
 * formuliert aus. Ereignisse ohne Erkenntniswert werden bewusst verschluckt –
 * eine Kommentierung, die im Sekundentakt dasselbe wiederholt, liest niemand.
 */

const OPERATOR_TEXT = Object.freeze({
  'zufallsfelder': 'zufällig gewählte Dienstfelder',
  'schwaechste-zellen': 'die am schlechtesten bewerteten Zellen',
  'tagesfenster': 'einen zusammenhängenden Kalenderabschnitt',
  'wochenende': 'ein vollständiges Wochenendpaket',
  'personenlast': 'alle Dienste einer Person',
  'verwandte-felder': 'Felder ähnlicher Lage und Besetzung',
  'rollenblock': 'eine Dienstart innerhalb eines Zeitfensters',
  'sollabweichung': 'die Dienste der Person mit dem größten Überhang'
});

const NEIGHBOURHOOD_TEXT = Object.freeze({
  einzelumsetzung: 'Einzelumsetzung',
  paartausch: 'Paartausch',
  rollentausch: 'Rollentausch am selben Tag',
  dreierkette: 'Dreierkette',
  tagespaket: 'Tagespaket',
  wochenendpaket: 'Wochenendpaket',
  zertifizierung: 'Vollprüfung'
});

/**
 * Meilensteine des Laufs, in ihrer sachlichen Reihenfolge.
 *
 * Nur diese fünf Schritte werden als Stufe angekündigt, und jeder genau einmal.
 * Alles andere sind Ereignisse innerhalb einer Stufe und werden als solche
 * gemeldet.
 *
 * Der Grund für die Trennung: Mehrere Suchläufe arbeiten gleichzeitig und melden
 * jeder seine eigene Stufe. Der Minimal-Rot-Rückfall etwa meldet sich schon in
 * der ersten Sekunde, weil er von Beginn an mitläuft. Ohne feste Ordnung stünde
 * seine Meldung vor der Constraint-Suche, und derselbe Meilenstein erschiene
 * dreimal – einmal je Lauf.
 */
const MILESTONES = Object.freeze([
  ['analysis', 'Fixpunkte werden gesichert', 'Bestehende Einteilungen sind ab jetzt unveränderlich.'],
  ['suche', 'Constraint-Suche läuft', 'Dienstfelder werden nach dem geringsten Spielraum belegt.'],
  ['polish', 'Tauschreparatur läuft', 'Grobe Ausreißer werden vor der Perfektion geglättet.'],
  ['perfect', 'Perfektionsphase läuft', 'Ausschnitte werden zerstört und besser wieder aufgebaut.'],
  ['certify', 'Optimalitätsnachweis läuft', 'Jede Einzelumsetzung und jeder Paartausch wird vollständig geprüft.']
]);

const MILESTONE_OF_PHASE = Object.freeze({
  analysis: 'analysis',
  search: 'suche',
  propagate: 'suche',
  polish: 'polish',
  perfect: 'perfect',
  certify: 'certify'
});

const milestoneRank = key => MILESTONES.findIndex(([id]) => id === key);

const pad = value => String(value).padStart(2, '0');

function clockLabel(date = new Date()) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function germanDay(dateIso) {
  return typeof dateIso === 'string' && dateIso.length >= 10
    ? `${dateIso.slice(8, 10)}.${dateIso.slice(5, 7)}.`
    : '';
}

/**
 * Fasst die veränderten Zellen eines Zuges lesbar zusammen: bis zu drei Tage
 * ausgeschrieben, darüber gezählt.
 */
function describeCells(cells) {
  const days = [...new Set((cells || []).map(cell => germanDay(cell.dateIso)).filter(Boolean))];
  if (!days.length) return '';
  if (days.length <= 3) return days.join(', ');
  return `${days.slice(0, 3).join(', ')} und ${days.length - 3} weitere`;
}

export class AlgorithmCommentary {
  /**
   * @param {object} options
   * @param {(entry: {kind: string, text: string, time: string}) => void} options.onEntry
   * @param {number} [options.minimumGapMs] kleinster Abstand gleichartiger Meldungen
   */
  constructor({ onEntry, minimumGapMs = 900 }) {
    this.onEntry = onEntry;
    this.minimumGapMs = minimumGapMs;
    this.reset();
  }

  reset() {
    this.lastPhase = null;
    this.phaseRank = -1;
    this.lastKindAt = new Map();
    this.announced = new Set();
    this.lastText = '';
    this.count = 0;
    this.improvements = 0;
    this.finished = false;
    this.startedAt = Date.now();
  }

  /** Meldung, die im gesamten Lauf höchstens einmal erscheint. */
  once(kind, text) {
    if (!text || this.announced.has(text)) return;
    this.announced.add(text);
    this.emit(kind, text, { force: true });
  }

  emit(kind, text, { force = false } = {}) {
    if (!text || text === this.lastText) return;
    const now = Date.now();
    if (!force && now - (this.lastKindAt.get(kind) || 0) < this.minimumGapMs) return;
    this.lastKindAt.set(kind, now);
    this.lastText = text;
    this.count += 1;
    this.onEntry?.({ kind, text, time: clockLabel(new Date(now)) });
  }

  /** Eröffnungszeile beim Start eines Laufs. */
  begin({ open, fixed, searches }) {
    this.reset();
    const parallel = searches > 1 ? ` · ${searches} Suchläufe auf eigenen Kernen` : '';
    this.emit('phase', `<b>Lauf gestartet</b> · ${open} offene Felder, ${fixed} geschützte Fixpunkte${parallel}`, { force: true });
  }

  /**
   * Übersetzt ein Fortschrittsereignis. Rückgabe ist nichts – die Zeilen gehen
   * über den Rückruf hinaus, damit die Oberfläche sie einreihen kann.
   */
  observe(update) {
    if (!update) return;
    const phase = update.phase;

    const milestone = MILESTONE_OF_PHASE[phase];
    if (milestone && milestoneRank(milestone) > this.phaseRank) {
      this.phaseRank = milestoneRank(milestone);
      this.lastPhase = phase;
      const [, title, detail] = MILESTONES[this.phaseRank];
      this.emit('phase', `<b>${title}</b> · ${detail}`, { force: true });
    }

    // Der Minimal-Rot-Rückfall und die Verbreiterung des Suchraums sind
    // Ereignisse, keine Stufen – sie tragen ihre eigene Begründung.
    if ((phase === 'repair' || phase === 'propagate') && update.message) {
      this.once('warn', update.message);
      return;
    }

    // Jeder Perfektionslauf meldet am Ende sein eigenes Ergebnis, und die
    // Ergebnisse unterscheiden sich – eine Entdopplung über den Text greift
    // hier also nicht. Angezeigt gehört nur der erste Eingang; das maßgebliche
    // Schlusswort spricht ohnehin `finish()` über den gewonnenen Vorschlag.
    if (phase === 'complete') {
      if (this.finished) return;
      this.finished = true;
      this.emit('final', `<b>Fertig</b> · ${update.message || ''}`, { force: true });
      return;
    }
    if (phase === 'blocked') {
      this.emit('blocked', `<b>Blockiert</b> · ${update.message || ''}`, { force: true });
      return;
    }

    // Übernommene Verbesserungen sind die wichtigste Meldung überhaupt – aber
    // im Nachweis fallen sie im Sekundenbruchteil an. Ohne Mindestabstand
    // stünde eine Wand gleichlautender Zeilen da, die niemand mehr liest.
    if (Number.isFinite(update.improvements) && update.improvements > this.improvements) {
      const first = this.improvements === 0;
      this.improvements = update.improvements;
      const where = describeCells(update.changedCells);
      const how = NEIGHBOURHOOD_TEXT[update.neighbourhood] || OPERATOR_TEXT[update.neighbourhood];
      const detail = [how, where && `am ${where}`].filter(Boolean).join(' ');
      this.emit('gain', `<b>Verbesserung übernommen</b>${detail ? ` · ${detail}` : ''}`, { force: first });
      return;
    }

    if (phase === 'perfect' && update.neighbourhood && OPERATOR_TEXT[update.neighbourhood]) {
      this.emit('work', `Neu aufgebaut: ${OPERATOR_TEXT[update.neighbourhood]}`);
      return;
    }

    // Lebenszeichen einer laufenden Absuche: sie sagen, woran gerade gerechnet
    // wird, ohne ein Ergebnis zu behaupten.
    if (phase === 'perfect' && update.scanning) {
      this.emit('work', `Nachbarschaft wird abgesucht: ${NEIGHBOURHOOD_TEXT[update.scanning] || update.scanning}`);
      return;
    }

    if (phase === 'certify') {
      const moves = Number(update.moves) || 0;
      const what = update.scanning ? `${update.scanning}` : 'alle Einzelumsetzungen und Paartausche';
      this.emit('work', moves
        ? `Nachweis läuft: ${what} · ${moves.toLocaleString('de-DE')} Züge vollständig geprüft`
        : `Nachweis gestartet: ${what}`);
      return;
    }

    if ((phase === 'search' || phase === 'propagate') && update.dateIso && Number.isFinite(update.candidateCount)) {
      const role = String(update.role || '').toUpperCase();
      this.emit('work', update.candidateCount <= 2
        ? `Engpass: ${role} am ${germanDay(update.dateIso)} lässt nur noch ${update.candidateCount} Person${update.candidateCount === 1 ? '' : 'en'} zu`
        : `${role} am ${germanDay(update.dateIso)} belegt · ${update.candidateCount} Personen wären möglich gewesen`);
      return;
    }

    if (phase === 'polish' && update.message) {
      if (update.message.startsWith('Aufbau abgeschlossen')) this.once('phase', update.message);
      else this.emit('work', update.message);
    }
  }

  /** Abschlusszeile mit dem, was das Ergebnis wert ist. */
  finish(result) {
    if (!result) return;
    const metrics = result.metrics || {};
    if (!result.complete) {
      this.emit('blocked', `<b>Kein vollständiger Vorschlag</b> · ${metrics.unfilled || 0} Felder blieben offen`, { force: true });
      return;
    }
    const parts = [
      `${result.changes?.length || 0} Felder belegt`,
      `${metrics.red || 0} rot`,
      `${metrics.yellow || 0} gelb`,
      `Fairness ${metrics.fairnessIndex ?? '—'} %`
    ];
    if (result.certified) parts.push('als nicht weiter verbesserbar zertifiziert');
    this.emit('final', `<b>Ergebnis steht</b> · ${parts.join(' · ')}`, { force: true });
  }
}
