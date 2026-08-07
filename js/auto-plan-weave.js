/**
 * Auto-Plan v10.6 — „Weberei".
 *
 * Der Monat als Gewebe. Kristallisation zeigt den Suchraum, Orbit die Bewegung —
 * die Weberei zeigt das **Ergebnis im Entstehen**: genau die Tabelle, die am
 * Ende im Dienstplan steht, Person für Person, Tag für Tag.
 *
 *   Kette (senkrecht)   Ein Faden je Kalendertag. Solange ein Tag noch offene
 *                       Felder hat, steht sein Faden unter Spannung und
 *                       schwingt; ist der Tag vollständig belegt, kommt er zur
 *                       Ruhe. Wochenenden liegen in einer dunkleren Bahn.
 *   Schuss (waagerecht) Eine Zeile je Person, in fester Reihenfolge. Sie
 *                       springt nie um, damit das Auge einer Person folgen kann.
 *   Knoten              Eine getroffene Zuordnung. Bereitschaftsdienst webt
 *                       einen vollen Knoten in die obere Hälfte der Zeile,
 *                       Hintergrunddienst einen offenen in die untere.
 *                       Fixpunkte sind von Beginn an eingewebt und ruhig; was
 *                       die Suche entscheidet, rastet sichtbar ein.
 *   Schiffchen          Nach jeder Entscheidung fährt ein Lichtschiffchen die
 *                       betroffene Zeile bis zum neuen Knoten. Es ist die
 *                       einzige schnelle Bewegung der Ansicht — sie zeigt, wo
 *                       gerade gearbeitet wird.
 *   Waage rechts        Die Last je Person als Balken, in derselben Zeile wie
 *                       ihr Gewebe. Leximin wird damit ablesbar: Die Kante
 *                       rechts wird gerade, während links der Stoff wächst.
 *   Webkante unten      Anteil der gewebten an allen Feldern des Monats.
 *
 * Ist die Optimalität bewiesen — oder der Lauf fertig —, läuft einmal die
 * Abschlusskante durch den Stoff: ein heller Schuss von oben nach unten.
 *
 * Alles Gezeigte stammt aus Meldungen des Laufs; nichts wird interpoliert, um
 * Betrieb vorzutäuschen. Bei reduzierter Bewegung entfallen Schwingung,
 * Schiffchen und Kante — der Stoff bleibt als ruhige Zustandsanzeige stehen.
 */

import {
  CanvasStage, SEVERITY, clamp, hsl, hueForStaff, nowMs
} from './auto-plan-visual-kit.js?v=20260806.1';
import { ease, hashNoise } from './auto-plan-visual-effects.js?v=20260806.1';

/* Lesbarkeitsuntergrenzen. Unter diesen Werten wird ausgedünnt statt gestaucht:
   Eine Zeile, die man nicht lesen kann, ist keine Information, sondern Rauschen. */
const ROW_MIN = 9;
/* Und eine Obergrenze: Bei drei Personen auf 300 Pixeln wären die Knoten sonst
   handtellergroße Blöcke — das Gewebe sähe aus wie ein Balkendiagramm. Statt zu
   dehnen, behalten die Zeilen ihr Maß; der Stoff bleibt oben an den Tagesziffern
   stehen, damit Ziffer und Spalte beieinander liegen. */
const ROW_MAX = 32;
const LIST_FONT = 11;
const HEAD_HEIGHT = 15;
const FOOT_HEIGHT = 16;
const DAY_LABEL_HEIGHT = 11;
/* Ab dieser Spaltenbreite ist eine zweistellige Tagesziffer noch lesbar. */
const DAY_LABEL_MIN_COLUMN = 13;
/* Unter dieser Leinwandbreite fallen Namensspalte und Lastwaage weg — auf einem
   Streifen von 320 Pixeln ist der Stoff selbst die einzige tragende Aussage. */
const NAMES_MIN_WIDTH = 560;
const RAIL_MIN_WIDTH = 420;

export class AutoPlanWeaver extends CanvasStage {
  constructor(canvas, monthData, options = {}) {
    super(canvas, options);

    this.days = this.buildDays(monthData);
    this.dayIndex = new Map(this.days.map((day, index) => [day.dateIso, index]));
    this.cells = this.buildCells(monthData);
    this.rows = new Map();
    this.rowOrder = [];
    this.shuttle = null;
    this.seam = 0;
    this.seamClosed = false;
    this.woven = 0;

    // Die geplante Belegschaft steht von Beginn an im Stoff, auch wenn sie noch
    // keinen Dienst hat: Eine Zeile, die erst mit ihrer ersten Zuteilung
    // auftaucht, verschiebt alle anderen — und das Auge verliert die Person.
    for (const person of options.staff || []) {
      if (person?.id) this.ensureRow(person.id, person.short || person.name || person.id);
    }
    for (const cell of this.cells.values()) {
      if (cell.staffId) this.ensureRow(cell.staffId).knots += 1;
    }

    this.start();
  }

  buildDays(monthData) {
    return Object.keys(monthData?.days || {}).sort().map(dateIso => ({
      dateIso,
      day: Number(dateIso.slice(8, 10)),
      weekday: new Date(`${dateIso}T12:00:00`).getDay()
    }));
  }

  /**
   * Ein Feld je Kalendertag und Rolle. Fixpunkte sind von Beginn an eingewebt:
   * Sie sind nicht Gegenstand der Suche und dürfen nicht so aussehen.
   */
  buildCells(monthData) {
    const cells = new Map();
    for (const day of this.days) {
      for (const role of ['bd', 'hg']) {
        const fixed = monthData?.days?.[day.dateIso]?.[role] || '';
        cells.set(`${day.dateIso}|${role}`, {
          dateIso: day.dateIso,
          role,
          fixed: Boolean(fixed),
          staffId: fixed || '',
          settle: fixed ? 1 : 0,
          spark: 0,
          // Der Faserwurf wird einmal je Entscheidung ausgelöst — beim
          // Zeichnen, weil erst dort feststeht, wo der Knoten sitzt.
          burst: false
        });
      }
    }
    return cells;
  }

  /**
   * Zeilen entstehen einmal und behalten ihren Platz. Sortiert wird nach der
   * Beschriftung, ersatzweise nach der Kennung — beides ist über den Lauf
   * hinweg stabil, also springt keine Zeile.
   */
  ensureRow(staffId, label = '') {
    const existing = this.rows.get(staffId);
    if (existing) {
      if (label && existing.label === staffId) existing.label = label;
      return existing;
    }
    const row = { staffId, label: label || staffId, hue: hueForStaff(staffId), load: 0, knots: 0 };
    this.rows.set(staffId, row);
    this.rowOrder = [...this.rows.values()].sort(
      (left, right) => left.label.localeCompare(right.label, 'de') || left.staffId.localeCompare(right.staffId)
    );
    return row;
  }

  update(update = {}) {
    if (!update || typeof update !== 'object') return;
    super.update(update);
    if (update.incumbent) this.applyIncumbent(update.incumbent);
    if (Array.isArray(update.loads)) {
      for (const entry of update.loads) {
        if (entry?.staffId) this.ensureRow(entry.staffId).load = Number(entry.value) || 0;
      }
    }
    if (Array.isArray(update.changedCells)) {
      for (const change of update.changedCells) this.weave(change.dateIso, change.role, change.staffId);
    }
  }

  applyIncumbent(incumbent) {
    if (Array.isArray(incumbent.assignments)) {
      for (const assignment of incumbent.assignments) {
        this.weave(assignment.dateIso, assignment.role, assignment.staffId);
      }
    }
    // Eine geschlossene Lücke beweist Optimalität nur, wenn überhaupt ein Ziel
    // minimiert wird — die vorgeschaltete Zulässigkeitssuche läuft ohne
    // Zielfunktion und meldet Zielwert wie Schranke als null.
    const gapClosed = incumbent.hasObjective === true
      && Number.isFinite(incumbent.objectiveValue)
      && Number.isFinite(incumbent.bestBound)
      && Math.abs(incumbent.objectiveValue - incumbent.bestBound) < 1e-9;
    if (gapClosed) this.closeSeam();
  }

  /** Eine Entscheidung wird eingewebt. Fixpunkte bleiben unberührt. */
  weave(dateIso, role, staffId) {
    const cell = this.cells.get(`${dateIso}|${role}`);
    if (!cell || cell.fixed) return;
    const changed = cell.staffId !== staffId;
    if (changed && cell.staffId) {
      const previous = this.rows.get(cell.staffId);
      if (previous) previous.knots = Math.max(0, previous.knots - 1);
    }
    cell.staffId = staffId || '';
    if (!staffId) {
      cell.settle = 0;
      return;
    }
    const row = this.ensureRow(staffId);
    if (changed) {
      row.knots += 1;
      cell.spark = 1;
      cell.burst = true;
      cell.settle = Math.max(cell.settle, 0.02);
      this.shuttle = { staffId, dateIso, life: 1 };
    }
  }

  /** Der eine laute Moment: der Stoff ist fertig, die Kante wird geschlagen. */
  closeSeam() {
    if (this.seamClosed) return;
    this.seamClosed = true;
    this.seam = 1;
    this.seamAt = nowMs();
  }

  finish() {
    super.finish();
    for (const cell of this.cells.values()) if (cell.staffId) cell.settle = 1;
    this.closeSeam();
  }

  step(delta) {
    const speed = this.reducedMotion ? 6 : 3.1;
    let woven = 0;
    for (const cell of this.cells.values()) {
      if (cell.staffId) woven += 1;
      if (cell.settle > 0 && cell.settle < 1) cell.settle = clamp(cell.settle + delta * speed, 0, 1);
      if (cell.spark > 0) cell.spark = Math.max(0, cell.spark - delta * 2.1);
    }
    this.woven = woven;
    if (this.shuttle) {
      this.shuttle.life -= delta * 1.6;
      if (this.shuttle.life <= 0) this.shuttle = null;
    }
    if (this.seam > 0) this.seam = Math.max(0, this.seam - delta * 0.5);
  }

  /**
   * Zonenaufteilung. Die Rechtecke werden einmal je Bild berechnet und
   * überschneiden sich per Konstruktion nicht: Jede Ebene bekommt ihren eigenen
   * Streifen, niemand zeichnet in den Streifen eines anderen.
   */
  layout() {
    const padding = 12;
    const gap = 8;
    const nameWidth = this.width >= NAMES_MIN_WIDTH ? clamp(this.width * 0.15, 46, 116) : 0;
    const railWidth = this.width >= RAIL_MIN_WIDTH ? clamp(this.width * 0.09, 26, 64) : 0;
    const top = padding + HEAD_HEIGHT;
    const bodyHeight = Math.max(40, this.height - top - padding - FOOT_HEIGHT);
    const loomX = padding + (nameWidth ? nameWidth + gap : 0);
    const loomWidth = Math.max(60, this.width - padding * 2 - (nameWidth ? nameWidth + gap : 0) - (railWidth ? railWidth + gap : 0));
    const labels = loomWidth / Math.max(1, this.days.length) >= DAY_LABEL_MIN_COLUMN;
    const rowsTop = top + (labels ? DAY_LABEL_HEIGHT : 0);
    const rowsHeight = Math.max(20, bodyHeight - (labels ? DAY_LABEL_HEIGHT : 0));
    return {
      padding,
      gap,
      labels,
      head: { x: padding, y: padding, w: this.width - padding * 2, h: HEAD_HEIGHT },
      names: nameWidth ? { x: padding, y: rowsTop, w: nameWidth, h: rowsHeight } : null,
      loom: { x: loomX, y: rowsTop, w: loomWidth, h: rowsHeight },
      dayLabels: labels ? { x: loomX, y: top, w: loomWidth, h: DAY_LABEL_HEIGHT } : null,
      rail: railWidth ? { x: loomX + loomWidth + gap, y: rowsTop, w: railWidth, h: rowsHeight } : null,
      foot: { x: padding, y: this.height - padding - FOOT_HEIGHT + 2, w: this.width - padding * 2, h: FOOT_HEIGHT - 4 }
    };
  }

  /**
   * Welche Zeilen werden gezeigt?
   *
   * Passen nicht alle, haben Personen mit Diensten Vorrang — eine leere Zeile
   * trägt keine Aussage. Die Auswahl wird anschließend wieder in die feste
   * Reihenfolge gebracht, damit die sichtbaren Zeilen nicht untereinander
   * springen, sobald jemand seinen ersten Dienst bekommt.
   */
  visibleRows(bodyHeight) {
    const total = this.rowOrder.length;
    const capacity = Math.max(1, Math.floor(bodyHeight / ROW_MIN));
    if (total <= capacity) return { rows: this.rowOrder, hidden: 0 };
    const room = Math.max(1, capacity - 1);
    const ranked = [...this.rowOrder].sort((left, right) => (right.knots - left.knots) || (right.load - left.load));
    const chosen = new Set(ranked.slice(0, room).map(row => row.staffId));
    return { rows: this.rowOrder.filter(row => chosen.has(row.staffId)), hidden: total - room };
  }

  draw(now) {
    const ctx = this.context;
    if (!ctx) return;
    const zones = this.layout();
    const color = this.activeColor(now);
    ctx.clearRect(0, 0, this.width, this.height);

    const { rows, hidden } = this.visibleRows(zones.loom.h);
    const lines = Math.max(1, rows.length + (hidden ? 1 : 0));
    const rowHeight = clamp(zones.loom.h / lines, ROW_MIN, ROW_MAX);
    const top = zones.loom.y;
    const positions = new Map(rows.map((row, index) => [row.staffId, top + index * rowHeight]));
    const hiddenY = top + rows.length * rowHeight;

    this.drawHead(zones.head, color);
    if (zones.dayLabels) this.withinZone(zones.dayLabels, () => this.drawDayLabels(zones.dayLabels, color));
    // Kette und Wochenendbahnen laufen nur so weit, wie der Stoff reicht — mit
    // etwas Überstand, damit die Fäden sichtbar über die Webkante hinausgehen.
    const block = {
      x: zones.loom.x,
      w: zones.loom.w,
      y: top,
      h: Math.min(zones.loom.h, rowHeight * lines + 7)
    };
    this.withinZone(zones.loom, () => this.drawLoom(zones.loom, block, color, now, positions, rowHeight));
    if (zones.names) this.withinZone(zones.names, () => this.drawNames(zones.names, color, rows, positions, rowHeight, hidden, hiddenY));
    if (zones.rail) this.withinZone(zones.rail, () => this.drawRail(zones.rail, block, color, rows, positions, rowHeight));
    this.drawSelvedge(zones.foot, color);
    // Über den gewebten Teil wandert ein flacher Lichtschimmer — dieselbe
    // Bewegung, die einen echten Stoff im Streiflicht zeigt. Ein Verlauf je
    // Bild, unabhängig von der Zahl der Knoten.
    if (!this.reducedMotion && this.detail > 0.5) this.drawSheen(block, color, now);
    if (this.seam > 0 && !this.reducedMotion) this.drawSeam(block);
  }

  drawHead(rect, color) {
    const ctx = this.context;
    ctx.font = `600 ${LIST_FONT}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.1, 0.15, 0.6) }, 0.85);
    ctx.fillText(this.fitText('Weberei · Person × Tag', rect.w * 0.6), rect.x, rect.y);
    ctx.textAlign = 'right';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.7);
    ctx.fillText(this.fitText('BD voll · HG offen', rect.w * 0.4), rect.x + rect.w, rect.y);
    ctx.textAlign = 'left';
  }

  drawDayLabels(rect, color) {
    const ctx = this.context;
    const columnWidth = rect.w / Math.max(1, this.days.length);
    ctx.font = `600 9px system-ui, sans-serif`;
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'center';
    this.days.forEach((day, index) => {
      const weekend = [0, 6].includes(day.weekday);
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l - (weekend ? 0.18 : 0.05), 0.12, 0.62) }, weekend ? 0.95 : 0.6);
      ctx.fillText(String(day.day), rect.x + (index + 0.5) * columnWidth, rect.y + rect.h - 1);
    });
    ctx.textAlign = 'left';
  }

  drawLoom(rect, block, color, now, positions, rowHeight) {
    const ctx = this.context;
    const columnWidth = rect.w / Math.max(1, this.days.length);

    // 1. Wochenendbahnen. Sie liegen unter allem und tragen das Raster.
    this.days.forEach((day, index) => {
      if (![0, 6].includes(day.weekday)) return;
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.2, 0, 0.9) }, 0.2);
      ctx.fillRect(rect.x + index * columnWidth, block.y, columnWidth, block.h);
    });

    // 2. Kettfäden. Ihre Helligkeit folgt der Zahl der offenen Felder des Tages:
    //    Was noch zu entscheiden ist, steht unter Spannung und schwingt.
    const swing = this.reducedMotion ? 0 : 1;
    this.days.forEach((day, index) => {
      const open = ['bd', 'hg'].reduce(
        (sum, role) => sum + (this.cells.get(`${day.dateIso}|${role}`)?.staffId ? 0 : 1),
        0
      );
      const x = rect.x + (index + 0.5) * columnWidth;
      const wobble = swing * open * 0.6 * Math.sin(now / 260 + index * 0.7);
      ctx.strokeStyle = hsl({ ...color, l: clamp(color.l + 0.18, 0, 0.9) }, open ? 0.16 + 0.12 * open : 0.08);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, block.y);
      ctx.quadraticCurveTo(x + wobble, block.y + block.h / 2, x, block.y + block.h);
      ctx.stroke();
    });

    // 3. Schussfäden — eine ruhige Linie je sichtbarer Person.
    ctx.strokeStyle = hsl({ ...color, l: clamp(color.l + 0.2, 0, 0.9) }, 0.1);
    for (const y of positions.values()) {
      ctx.beginPath();
      ctx.moveTo(rect.x, y + rowHeight / 2);
      ctx.lineTo(rect.x + rect.w, y + rowHeight / 2);
      ctx.stroke();
    }

    // 3b. Fasern und Funken liegen zwischen Fäden und Knoten: Sie gehören
    //     hinter den Stoff, nicht darüber.
    this.particles.paint(ctx, this.glow, this.sparkLimit, 0.45);

    // 4. Knoten.
    const inset = Math.min(1.6, columnWidth * 0.14);
    const bandHeight = Math.max(2, rowHeight / 2 - 1);
    let bursts = this.burstBudget();
    for (const cell of this.cells.values()) {
      if (!cell.staffId) continue;
      const y = positions.get(cell.staffId);
      if (y === undefined) continue;
      const index = this.dayIndex.get(cell.dateIso);
      if (index === undefined) continue;
      const row = this.rows.get(cell.staffId);
      const hue = row?.hue ?? 0;
      const tone = { h: hue, s: 0.55, l: cell.fixed ? 0.42 : 0.52 };
      // Der Knoten schwingt beim Einweben einmal über: Er zieht sich fest,
      // statt gleichmäßig zu wachsen.
      const grow = cell.fixed ? 1 : ease.outBack(cell.settle);
      const width = Math.max(1.5, (columnWidth - inset * 2) * clamp(0.4 + 0.6 * grow, 0.1, 1.1));
      const x = rect.x + (index + 0.5) * columnWidth - width / 2;
      const bandY = cell.role === 'bd' ? y + 0.5 : y + rowHeight / 2 + 0.5;
      const height = Math.max(1.5, bandHeight * clamp(0.45 + 0.55 * grow, 0.1, 1.1));
      const top = bandY + (bandHeight - height) / 2;

      this.roundRect(x, top, width, height, Math.min(2, width * 0.35));
      if (cell.role === 'bd') {
        ctx.fillStyle = hsl(tone, cell.fixed ? 0.6 : 0.4 + 0.5 * clamp(cell.settle, 0, 1));
        ctx.fill();
      } else {
        // Der Hintergrunddienst bleibt offen: derselbe Ton, nur als Umriss. So
        // sind beide Rollen ohne zweite Farbachse unterscheidbar.
        ctx.strokeStyle = hsl(tone, cell.fixed ? 0.75 : 0.5 + 0.45 * clamp(cell.settle, 0, 1));
        ctx.lineWidth = Math.min(1.6, Math.max(0.8, height * 0.3));
        ctx.stroke();
      }
      // Schein bekommt, was gerade entschieden wurde. Ein Dauerleuchten auf
      // allen sechzig Knoten kostet sechzig Kopien je Bild und sagt nichts —
      // die Fläche des Stoffs trägt ihren Glanz ohnehin über den Schimmer.
      if (cell.spark > 0.01 && this.detail > 0.3) {
        this.glowAt(tone, x + width / 2, top + height / 2, 0.36 + cell.spark * 1.5,
          Math.min(12, columnWidth * 1.5));
      }

      // Ein frisch gesetzter Knoten wirft kurz Fasern ab — die Bewegung, die
      // das Auge zur jüngsten Entscheidung zieht.
      if (cell.burst) {
        cell.burst = false;
        if (bursts <= 0) continue;
        bursts -= 1;
        const fibres = Math.round(3 * this.detail);
        for (let fibre = 0; fibre < fibres; fibre += 1) {
          this.particles.emit({
            x: x + width / 2,
            y: top + height / 2,
            vx: hashNoise(index * 5 + fibre, now / 800, 3) * columnWidth * 2.5,
            vy: hashNoise(index * 11 + fibre, now / 650, 3) * rowHeight * 1.5,
            hue,
            size: Math.max(2, columnWidth * 0.55),
            decay: 2.4,
            drag: 0.9
          });
        }
      }
    }

    // 5. Schiffchen — die einzige schnelle Bewegung der Ansicht.
    if (this.shuttle && !this.reducedMotion) {
      const y = positions.get(this.shuttle.staffId);
      const index = this.dayIndex.get(this.shuttle.dateIso);
      if (y !== undefined && index !== undefined) {
        const target = rect.x + (index + 0.5) * columnWidth;
        const travel = 1 - clamp(this.shuttle.life, 0, 1);
        const head = rect.x + (target - rect.x) * travel;
        const hue = this.rows.get(this.shuttle.staffId)?.hue ?? 0;
        const tone = { h: hue, s: 0.6, l: 0.58 };
        const middle = y + rowHeight / 2;

        // Der Schweif ist ein Verlauf, kein Dutzend Einzelstriche: eine
        // Zeichnung statt vieler, und weicher als jede Aneinanderreihung.
        const tail = Math.max(rect.x, head - rect.w * 0.18);
        if (ctx.createLinearGradient) {
          const gradient = ctx.createLinearGradient(tail, middle, head, middle);
          gradient.addColorStop(0, hsl(tone, 0));
          gradient.addColorStop(1, hsl(tone, 0.75 * this.shuttle.life));
          ctx.strokeStyle = gradient;
        } else {
          ctx.strokeStyle = hsl(tone, 0.55 * this.shuttle.life);
        }
        ctx.lineWidth = Math.max(1, rowHeight * 0.2);
        ctx.beginPath();
        ctx.moveTo(tail, middle);
        ctx.lineTo(head, middle);
        ctx.stroke();

        // Der Kopf des Schiffchens leuchtet und streut Fasern nach hinten.
        this.glowAt(tone, head, middle, 1.2 * this.shuttle.life, 16);
        if (this.detail > 0.5 && this.particles.live < this.sparkLimit) {
          this.particles.emit({
            x: head,
            y: middle,
            vx: -rect.w * 0.12 * (0.4 + Math.abs(hashNoise(index, now / 500, 2))),
            vy: hashNoise(index * 3, now / 400, 4) * rowHeight,
            hue,
            size: Math.max(2, rowHeight * 0.5),
            decay: 2.8,
            drag: 0.94
          });
        }
      }
    }
  }

  drawNames(rect, color, rows, positions, rowHeight, hidden, hiddenY) {
    const ctx = this.context;
    ctx.font = `${Math.min(LIST_FONT, Math.max(8, rowHeight - 2))}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (const row of rows) {
      const y = positions.get(row.staffId);
      ctx.fillStyle = hsl({ h: row.hue, s: 0.42, l: 0.36 }, row.knots ? 0.95 : 0.45);
      ctx.fillText(this.fitText(row.label, rect.w - 6), rect.x + rect.w - 6, y + rowHeight / 2);
    }
    if (hidden) {
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.75);
      ctx.fillText(
        this.fitText(`+ ${hidden} ohne Dienst`, rect.w - 6),
        rect.x + rect.w - 6,
        hiddenY + rowHeight / 2
      );
    }
    ctx.textAlign = 'left';
  }

  /** Lastwaage: derselbe Zeilenraster wie der Stoff, damit beides zusammenliest. */
  drawRail(rect, block, color, rows, positions, rowHeight) {
    const ctx = this.context;
    const max = Math.max(1, ...rows.map(row => row.load), ...rows.map(row => row.knots));
    for (const row of rows) {
      const y = positions.get(row.staffId);
      // Solange die Engine noch keine Lastmeldung geschickt hat, zählt der Stoff
      // selbst: die Zahl der eingewebten Knoten. Beides ist echt gemessen.
      const value = row.load || row.knots;
      const width = (rect.w - 2) * clamp(value / max, 0, 1);
      const tone = { h: row.hue, s: 0.5, l: 0.5 };
      this.applyGlow(tone, 0.3, 6);
      ctx.fillStyle = hsl(tone, 0.6);
      this.roundRect(rect.x + 1, y + 1.5, Math.max(1.5, width), Math.max(1.5, rowHeight - 3), 2);
      ctx.fill();
      this.clearGlow();
    }
    ctx.strokeStyle = hsl({ ...color, l: clamp(color.l + 0.1, 0, 0.85) }, 0.25);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(rect.x + 0.5, block.y);
    ctx.lineTo(rect.x + 0.5, block.y + block.h);
    ctx.stroke();
  }

  /** Webkante: wie viel des Monats steht, und in welcher Phase. */
  drawSelvedge(rect, color) {
    const ctx = this.context;
    const total = this.cells.size || 1;
    const share = clamp(this.woven / total, 0, 1);
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.32, 0, 0.95) }, 0.16);
    this.roundRect(rect.x, rect.y, rect.w, rect.h, rect.h / 2);
    ctx.fill();

    const tone = this.seamClosed ? SEVERITY.proof : color;
    this.applyGlow(tone, 0.7, 10);
    ctx.fillStyle = hsl(tone, 0.7);
    this.roundRect(rect.x, rect.y, Math.max(rect.h, rect.w * share), rect.h, rect.h / 2);
    ctx.fill();
    this.clearGlow();

    ctx.font = `600 9px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.24, 0.1, 0.45) }, 0.95);
    ctx.fillText(
      this.fitText(`${this.woven} von ${total} Feldern gewebt`, rect.w - 10),
      rect.x + 6,
      rect.y + rect.h / 2
    );
  }

  /**
   * Der Schimmer.
   *
   * Er zeigt nichts an, sondern macht den Stoff als Fläche lesbar: Ohne ihn
   * wirken Knoten und Fäden wie eine Tabelle, mit ihm wie Gewebe. Deshalb ist
   * er das Erste, was bei knappem Budget entfällt.
   */
  drawSheen(rect, color, now) {
    const ctx = this.context;
    const span = Math.max(24, Math.round(rect.w * 0.28));
    // Der Streifen wird einmal gezeichnet und danach nur verschoben. Ein
    // Verlauf je Bild wäre eine Allokation und eine großflächige Füllung für
    // eine Bewegung, die sich nie ändert.
    const strip = this.staticLayer(`sheen|${span}|${Math.round(rect.h)}`, target => {
      if (!target.createLinearGradient) return;
      const gradient = target.createLinearGradient(0, 0, span * 2, 0);
      gradient.addColorStop(0, hsl(color, 0));
      gradient.addColorStop(0.5, hsl({ ...color, l: clamp(color.l + 0.4, 0, 0.98) }, 0.12));
      gradient.addColorStop(1, hsl(color, 0));
      target.fillStyle = gradient;
      target.fillRect(0, 0, span * 2, Math.max(1, rect.h));
    });
    if (!strip) return;
    const head = rect.x - span + ((now / 3600) % 1) * (rect.w + span * 2);
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * this.detail;
    ctx.drawImage(strip, 0, 0, span * 2, Math.max(1, rect.h), head - span, rect.y, span * 2, rect.h);
    ctx.globalAlpha = alpha;
  }

  /** Die Abschlusskante: ein heller Schuss, einmal, durch den ganzen Stoff. */
  drawSeam(rect) {
    const ctx = this.context;
    const y = rect.y + rect.h * (1 - this.seam);
    const tone = SEVERITY.proof;
    this.applyGlow(tone, 1.5, 22);
    ctx.strokeStyle = hsl(tone, this.seam * 0.8);
    ctx.lineWidth = 1.5 + 2.5 * this.seam;
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.w, y);
    ctx.stroke();
    this.clearGlow();
  }
}

export const WEAVER_VERSION = '20260806.1';
