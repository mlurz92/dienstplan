/**
 * Auto-Plan v10 — „Kristallisation".
 *
 * Die Ansicht zeigt nicht, dass gerechnet wird, sondern **was** gerechnet wird.
 * Vier Ebenen, alle aus echten Daten des Laufs gespeist:
 *
 *   1. Domänenfeld    Ein Raster aus Tagen und Rollen. Jede Zelle trägt anfangs
 *                     ihre Kandidatenmenge als Fächer. Trifft eine Entscheidung
 *                     ein, fallen die nicht gewählten Marken heraus und die
 *                     gewählte rastet ein: der Suchraum fällt sichtbar zusammen.
 *   2. Schranken-     Der Zielwert der besten bekannten Lösung von oben, die
 *      Schere         bewiesene untere Schranke von unten. Die Fläche dazwischen
 *                     ist die verbleibende Ungewissheit. Berühren sich beide,
 *                     ist Optimalität bewiesen — und genau dann, einmal, läuft
 *                     ein heller Puls über das gesamte Feld.
 *   3. Prioritäts-    Die lexikografischen Stufen als Sprossen. Eine gelöste
 *      leiter         Stufe schließt ihr Schloss und graviert ihren Wert ein;
 *                     ein Konflikt bricht die Sprosse heraus.
 *   4. Lastwaage      Balken je Person, aufsteigend sortiert. Leximin wird
 *                     dadurch sichtbar, wie es arbeitet: Der kürzeste Balken
 *                     hebt sich zuerst.
 *
 * Farbwelt, Glanzregel und Lebenszyklus stehen im gemeinsamen Unterbau
 * (`auto-plan-visual-kit.js`); hier steht nur, was diese Ansicht ausmacht.
 *
 * Die Schleife ist rahmenratenunabhängig und respektiert `prefers-reduced-motion`:
 * Dann entfallen Fächern, Puls und Drift — Raster, Kurven und Balken bleiben als
 * ruhige Zustandsanzeige.
 */

import {
  CanvasStage, SEVERITY, TAU, clamp, glowProfile, hsl, hueForStaff, nowMs
} from './auto-plan-visual-kit.js?v=20260806.1';
import { ease, hashNoise } from './auto-plan-visual-effects.js?v=20260806.1';

// Die Strahlkraftfunktion war bis v10.5 hier zu Hause und ist Teil der
// öffentlichen Fläche dieses Moduls geblieben.
export { glowProfile };

/* Lesbarkeitsuntergrenzen der Leinwand. Unter diesen Werten wird nicht mehr
   gezeichnet, sondern ausgedünnt: Eine Zeile, die man nicht lesen kann, ist
   keine Information, sondern Rauschen. */
const LIST_FONT = 11;
const LADDER_MIN_ROW = 18;
const SCALE_MIN_ROW = 9;

export class AutoPlanCrystallizer extends CanvasStage {
  constructor(canvas, monthData, options = {}) {
    super(canvas, options);
    this.crystallizedAt = null;
    this.pulse = 0;

    this.cells = this.buildCells(monthData);
    this.cellByKey = new Map(this.cells.map(cell => [cell.key, cell]));
    this.stages = [];
    this.loads = [];
    this.bounds = [];

    this.start();
  }

  /**
   * Ein Feld je Kalendertag und Rolle. Fixpunkte sind von Beginn an gerastet:
   * Sie sind nicht Gegenstand der Suche und dürfen nicht so aussehen.
   */
  buildCells(monthData) {
    const days = Object.keys(monthData?.days || {}).sort();
    const cells = [];
    for (const dateIso of days) {
      for (const role of ['bd', 'hg']) {
        const fixed = monthData?.days?.[dateIso]?.[role] || '';
        cells.push({
          key: `${dateIso}|${role}`,
          dateIso,
          role,
          weekday: new Date(`${dateIso}T12:00:00`).getDay(),
          fixed: Boolean(fixed),
          staffId: fixed || '',
          settle: fixed ? 1 : 0,
          candidates: fixed ? 0 : 6,
          spark: 0,
          // Die Druckwelle wird genau einmal je Entscheidung ausgelöst — beim
          // Zeichnen, weil erst dort feststeht, wo die Zelle liegt.
          burst: false
        });
      }
    }
    return cells;
  }

  /**
   * Fortschrittsmeldung der Engine. Alles, was hier ankommt, ist ein Ereignis
   * des Laufs — nichts wird interpoliert, um Betrieb vorzutäuschen.
   */
  update(update = {}) {
    if (!update || typeof update !== 'object') return;
    super.update(update);
    if (Array.isArray(update.stages)) this.stages = update.stages;
    if (update.stage && update.cpSatPhase) this.markStage(update.cpSatPhase, 'running');
    if (update.incumbent) this.applyIncumbent(update.incumbent);
    if (Array.isArray(update.loads)) this.loads = update.loads;
    if (update.changedCells) {
      for (const change of update.changedCells) this.settle(`${change.dateIso}|${change.role}`, change.staffId);
    }
  }

  markStage(id, status, value = null, bound = null) {
    const existing = this.stages.find(stage => stage.id === id);
    if (existing) {
      existing.status = status;
      if (value !== null) existing.value = value;
      if (bound !== null) existing.bound = bound;
      return;
    }
    this.stages.push({ id, label: id, status, value, bound });
  }

  /**
   * Eine Zwischenlösung der exakten Suche: Zuordnungen rasten ein, Zielwert und
   * untere Schranke wandern in die Schere.
   */
  applyIncumbent(incumbent) {
    if (Array.isArray(incumbent.assignments)) {
      for (const assignment of incumbent.assignments) {
        this.settle(`${assignment.dateIso}|${assignment.role}`, assignment.staffId);
      }
    }
    if (Number.isFinite(incumbent.objectiveValue)) {
      this.bounds.push({
        t: nowMs() - this.startedAt,
        value: incumbent.objectiveValue,
        bound: Number.isFinite(incumbent.bestBound) ? incumbent.bestBound : null
      });
      if (this.bounds.length > 240) this.bounds.shift();
      // Eine geschlossene Lücke ist nur dann ein Optimalitätsbeweis, wenn
      // überhaupt ein Ziel minimiert wird. Die vorgeschaltete Zulässigkeits-
      // suche läuft ohne Zielfunktion; dort sind Zielwert und Schranke beide
      // null, die Lücke also trivial geschlossen. Bis v10.4 kristallisierte die
      // Darstellung deshalb sofort beim ersten Zwischenergebnis und stand die
      // gesamte restliche Optimierung still.
      const gapClosed = incumbent.hasObjective === true
        && Number.isFinite(incumbent.bestBound)
        && Math.abs(incumbent.objectiveValue - incumbent.bestBound) < 1e-9;
      if (gapClosed && this.crystallizedAt === null) this.crystallize();
    }
    if (incumbent.stage) this.markStage(incumbent.stage, 'done', incumbent.objectiveValue, incumbent.bestBound);
  }

  settle(key, staffId) {
    const cell = this.cellByKey.get(key);
    if (!cell || cell.fixed) return;
    if (cell.staffId !== staffId) {
      cell.spark = 1;
      cell.burst = true;
    }
    cell.staffId = staffId || '';
    cell.settle = Math.max(cell.settle, 0.02);
  }

  /** Der eine laute Moment: bewiesene Optimalität. */
  crystallize() {
    this.crystallizedAt = nowMs();
    this.pulse = 1;
  }

  finish() {
    super.finish();
    for (const cell of this.cells) if (cell.staffId) cell.settle = 1;
  }

  step(delta) {
    const speed = this.reducedMotion ? 6 : 2.4;
    for (const cell of this.cells) {
      if (cell.settle > 0 && cell.settle < 1) cell.settle = clamp(cell.settle + delta * speed, 0, 1);
      if (cell.spark > 0) cell.spark = Math.max(0, cell.spark - delta * 1.8);
    }
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - delta * 0.55);
  }

  /**
   * Zonenaufteilung der Leinwand. Die Rechtecke werden einmal je Bild berechnet
   * und überschneiden sich per Konstruktion nicht: Jede Ebene bekommt ihren
   * eigenen Streifen, niemand zeichnet in den Streifen eines anderen.
   *
   * LESBARKEIT GEHT VOR VOLLSTÄNDIGKEIT. Die Vorgängerfassung verteilte die
   * verfügbare Höhe restlos auf alle Einträge: Bei zwölf Stufen in 190 Pixeln
   * blieben 15 Pixel je Zeile, während die Schrift unverändert 10 Pixel maß —
   * die Zeilen liefen ineinander. Die Lastwaage verwarf zusätzlich stillschweigend
   * jeden Balken, der nicht mehr passte, und schrieb ihre Überschrift zehn Pixel
   * *oberhalb* ihrer eigenen Zone. Beides sah aus wie ein abgeschnittener Rand.
   *
   * Deshalb gilt jetzt: Jede Liste hat eine Mindestzeilenhöhe. Passen nicht alle
   * Einträge, wird ein Ausschnitt gezeigt und die Zahl der übrigen ausgewiesen.
   */
  layout() {
    const padding = 12;
    const gap = 10;
    const compact = this.width < 640;
    const ladderWidth = compact ? 0 : clamp(this.width * 0.26, 190, 300);
    const scissorsHeight = clamp(this.height * 0.2, 46, 96);
    const scaleHeight = clamp(this.height * 0.17, 44, 84);
    const fieldWidth = this.width - padding * 2 - (ladderWidth ? ladderWidth + gap : 0);
    const fieldHeight = Math.max(60, this.height - padding * 2 - gap - scissorsHeight
      - (compact ? scaleHeight + gap : 0));
    const rightX = padding + fieldWidth + gap;
    // In der breiten Aufteilung teilen sich Leiter und Waage die rechte Spalte:
    // Die Leiter bekommt die Höhe des Feldes, die Waage die der Schere darunter.
    return {
      padding,
      gap,
      compact,
      field: { x: padding, y: padding, w: Math.max(80, fieldWidth), h: fieldHeight },
      ladder: ladderWidth ? { x: rightX, y: padding, w: ladderWidth, h: fieldHeight } : null,
      scissors: { x: padding, y: padding + fieldHeight + gap, w: (compact ? this.width - padding * 2 : fieldWidth), h: scissorsHeight },
      scale: compact
        ? { x: padding, y: padding + fieldHeight + gap + scissorsHeight + gap, w: this.width - padding * 2, h: scaleHeight }
        : { x: rightX, y: padding + fieldHeight + gap, w: ladderWidth, h: scissorsHeight }
    };
  }

  draw(now) {
    const ctx = this.context;
    if (!ctx) return;
    const zones = this.layout();
    const color = this.activeColor(now);
    ctx.clearRect(0, 0, this.width, this.height);

    this.withinZone(zones.field, () => this.drawField(zones.field, color, now));
    if (zones.ladder) this.drawLadder(zones.ladder, color);
    this.withinZone(zones.scissors, () => this.drawScissors(zones.scissors, color));
    this.drawScale(zones.scale, color);
    if (this.pulse > 0 && !this.reducedMotion) this.drawPulse(zones.field, now);
  }

  /**
   * Das Domänenfeld.
   *
   * Der unveränderliche Teil — Grundflächen und Wochenendtönung — liegt in einer
   * Standebene und wird je Bild einmal kopiert. Bewegt wird nur, was sich
   * wirklich ändert: einrastende Zuordnungen, flirrende Kandidatenmengen und
   * die Druckwellen der letzten Entscheidungen.
   */
  drawField(rect, color, now) {
    const ctx = this.context;
    const days = this.cells.length / 2;
    const columns = Math.max(1, days);
    const cellWidth = rect.w / columns;
    const cellHeight = rect.h / 2;
    const inset = Math.min(2.5, cellWidth * 0.12);

    // Der Schlüssel trägt nur die Größe: Das Raster liegt in der Monatsfarbe,
    // nicht in der Phasenfarbe. Sonst entstünde je Phase eine neue Vollleinwand,
    // und die Phasenfarbe gehört ohnehin dem, was sich bewegt.
    const base = this.accent;
    const layer = this.staticLayer(`field|${Math.round(rect.w)}x${Math.round(rect.h)}`, target => {
      for (let index = 0; index < this.cells.length; index += 1) {
        const cell = this.cells[index];
        const column = Math.floor(index / 2);
        const row = cell.role === 'bd' ? 0 : 1;
        const x = rect.x + column * cellWidth + inset;
        const y = rect.y + row * cellHeight + inset;
        const w = Math.max(1, cellWidth - inset * 2);
        const h = Math.max(1, cellHeight - inset * 2);
        const weekendTone = [0, 6].includes(cell.weekday) ? 0.16 : 0.08;
        target.fillStyle = hsl({ ...base, l: clamp(base.l + 0.3, 0, 0.94) }, weekendTone);
        target.beginPath();
        if (typeof target.roundRect === 'function') target.roundRect(x, y, w, h, Math.min(3, w * 0.3));
        else target.rect(x, y, w, h);
        target.fill();
      }
    });
    if (layer) ctx.drawImage(layer, 0, 0, this.width, this.height);

    let bursts = this.burstBudget();
    for (let index = 0; index < this.cells.length; index += 1) {
      const cell = this.cells[index];
      const column = Math.floor(index / 2);
      const row = cell.role === 'bd' ? 0 : 1;
      const x = rect.x + column * cellWidth + inset;
      const y = rect.y + row * cellHeight + inset;
      const w = Math.max(1, cellWidth - inset * 2);
      const h = Math.max(1, cellHeight - inset * 2);

      if (!layer) {
        // Ohne Standebene — sehr alte Browser, kein Offscreen — wird die
        // Grundfläche wie bisher je Bild gezeichnet.
        const weekendTone = [0, 6].includes(cell.weekday) ? 0.16 : 0.08;
        ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.3, 0, 0.94) }, weekendTone);
        this.roundRect(x, y, w, h, Math.min(3, w * 0.3));
        ctx.fill();
      }

      if (cell.staffId) {
        const hue = hueForStaff(cell.staffId);
        const staffColor = { h: hue, s: 0.55, l: cell.fixed ? 0.42 : 0.52 };
        // Das Einrasten schwingt einmal über: Der Balken schießt kurz über
        // seine Endhöhe hinaus und setzt sich. Linear gewachsen wirkte er
        // gezeichnet, nicht entschieden.
        const grow = cell.fixed ? 1 : ease.outBack(cell.settle);
        const gh = h * clamp(0.35 + 0.65 * grow, 0.05, 1.12);
        ctx.fillStyle = hsl(staffColor, cell.fixed ? 0.55 : 0.35 + 0.55 * clamp(cell.settle, 0, 1));
        this.roundRect(x, y + (h - gh) / 2, w, gh, Math.min(3, w * 0.3));
        ctx.fill();

        // Schein als Plättchen statt als Weichzeichner — gleiche Optik, ein
        // Kopiervorgang statt einer Zwischenfläche je Zelle.
        if (this.detail > 0.3) {
          // Der Schein folgt dem Balken über seine ganze Höhe, statt als Fleck
          // in seiner Mitte zu sitzen.
          const top = y + (h - gh) / 2;
          this.glowAlong(staffColor, x + w / 2, top, x + w / 2, top + gh,
            cell.fixed ? 0.25 : 0.4 + cell.spark * 1.6, Math.min(14, cellWidth * 1.6));
        }

        // Eine frische Entscheidung schlägt eine Welle und wirft Funken in
        // Richtung ihrer Zeile. Beide stammen aus Vorräten, nicht aus `new`.
        if (cell.burst) {
          cell.burst = false;
          if (bursts <= 0) continue;
          bursts -= 1;
          this.ripples.emit({ x: x + w / 2, y: y + h / 2, hue, grow: cellWidth * 6, width: 1.6 });
          const sparks = Math.round(3 * this.detail);
          for (let spark = 0; spark < sparks; spark += 1) {
            this.particles.emit({
              x: x + w / 2,
              y: y + h / 2,
              vx: hashNoise(index + spark, now / 700, 3) * cellWidth * 3,
              vy: hashNoise(index * 3 + spark, now / 900, 3) * cellHeight * 1.2,
              hue,
              size: Math.max(2, cellWidth * 0.6),
              decay: 2.2,
              drag: 0.92
            });
          }
        }
      } else if (!this.reducedMotion && this.detail > 0.35) {
        // Unentschieden: die Kandidatenmenge flirrt als Fächer feiner Marken.
        // Jede Marke driftet auf ihrer eigenen, wiederholbaren Bahn — echtes
        // Rauschen würde in jedem Bild anders flackern.
        const marks = Math.max(2, Math.round(cell.candidates * this.detail));
        for (let mark = 0; mark < marks; mark += 1) {
          const t = (now / 900 + mark / marks + column * 0.13) % 1;
          const my = y + h * (0.2 + 0.6 * t);
          const drift = hashNoise(index * 7 + mark, now / 1400, 1) * w * 0.16;
          ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.2, 0, 0.9) }, 0.1 + 0.14 * Math.sin(t * Math.PI));
          ctx.fillRect(x + w * 0.25 + drift, my, Math.max(1, w * 0.5), 1);
        }
      }
    }

    this.ripples.paint(ctx, Math.round(8 * this.detail));
    this.particles.paint(ctx, this.glow, this.sparkLimit, 0.5);

    // Rollenbeschriftung – klein, links, ohne das Raster zu überlagern.
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.1, 0.15, 0.6) }, 0.75);
    ctx.fillText('BD', rect.x + 2, rect.y + cellHeight * 0.5);
    ctx.fillText('HG', rect.x + 2, rect.y + cellHeight * 1.5);
  }

  drawLadder(rect, color) {
    const ctx = this.context;
    if (!this.stages.length) return;
    this.withinZone(rect, () => {
      const titleHeight = 14;
      const body = { x: rect.x, y: rect.y + titleHeight, w: rect.w, h: Math.max(0, rect.h - titleHeight) };

      ctx.font = `600 ${LIST_FONT}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.1, 0.15, 0.6) }, 0.85);
      ctx.fillText(this.fitText('Prioritätsleiter', rect.w), rect.x, rect.y);

      // Wie viele Sprossen passen, ohne die Mindestzeilenhöhe zu unterschreiten?
      const capacity = Math.max(1, Math.floor(body.h / LADDER_MIN_ROW));
      const total = this.stages.length;
      const overflow = total > capacity;
      const shownCount = overflow ? Math.max(1, capacity - 1) : total;
      // Der Ausschnitt endet an der zuletzt aktiven Stufe: Was gerade passiert,
      // ist immer sichtbar; Abgeschlossenes darf nach oben herauswandern.
      const activeIndex = Math.max(0, this.stages.findLastIndex(stage => stage.status !== 'pending'));
      const start = clamp(activeIndex - shownCount + 1, 0, Math.max(0, total - shownCount));
      const visible = this.stages.slice(start, start + shownCount);
      const rowHeight = Math.min(26, body.h / Math.max(1, shownCount + (overflow ? 1 : 0)));

      ctx.textBaseline = 'middle';
      visible.forEach((stage, index) => {
        const y = body.y + index * rowHeight;
        const done = stage.status === 'done';
        const broken = stage.status === 'broken';
        const tone = broken ? SEVERITY.red : done ? SEVERITY.proof : color;
        this.applyGlow(tone, done ? 0.8 : 0.35, 8);
        ctx.fillStyle = hsl(tone, broken ? 0.5 : done ? 0.42 : 0.2);
        this.roundRect(rect.x, y + 1, rect.w, Math.max(4, rowHeight - 3), 4);
        ctx.fill();
        this.clearGlow();
        ctx.fillStyle = hsl({ ...tone, l: clamp(tone.l - 0.28, 0.1, 0.5) }, 0.95);

        // Der Zahlenwert bekommt seinen Platz zuerst, die Beschriftung den Rest.
        let valueWidth = 0;
        let valueText = '';
        if (stage.value !== null && stage.value !== undefined && Number.isFinite(Number(stage.value))) {
          valueText = Number(stage.value).toFixed(Number.isInteger(stage.value) ? 0 : 2);
          valueWidth = ctx.measureText(valueText).width + 8;
        }
        const mark = done ? '✓ ' : broken ? '✕ ' : '▸ ';
        const label = this.fitText(`${mark}${stage.label || stage.id}`, rect.w - 12 - valueWidth);
        ctx.fillText(label, rect.x + 6, y + rowHeight / 2);
        if (valueText) {
          ctx.textAlign = 'right';
          ctx.fillText(valueText, rect.x + rect.w - 6, y + rowHeight / 2);
          ctx.textAlign = 'left';
        }
      });

      if (overflow) {
        const y = body.y + shownCount * rowHeight;
        ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.75);
        ctx.fillText(this.fitText(`+ ${total - shownCount} weitere Stufen`, rect.w - 12), rect.x + 6, y + rowHeight / 2);
      }
    });
  }

  /**
   * Die Schere: oben der Zielwert, unten die bewiesene Schranke.
   * Die Fläche dazwischen ist genau das, was noch nicht bewiesen ist.
   */
  drawScissors(rect, color) {
    const ctx = this.context;
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.34, 0, 0.96) }, 0.1);
    this.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
    ctx.fill();
    if (this.bounds.length < 2) {
      ctx.font = `${LIST_FONT}px system-ui, sans-serif`;
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.6);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(
        this.fitText('Schranken erscheinen, sobald die exakte Suche Zwischenlösungen meldet', rect.w - 16),
        rect.x + 8,
        rect.y + rect.h / 2
      );
      return;
    }
    const values = this.bounds.flatMap(entry => [entry.value, entry.bound]).filter(Number.isFinite);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1e-6, max - min);
    const px = index => rect.x + 6 + (rect.w - 12) * (index / Math.max(1, this.bounds.length - 1));
    const py = value => rect.y + rect.h - 6 - (rect.h - 12) * ((value - min) / span);

    ctx.beginPath();
    this.bounds.forEach((entry, index) => {
      const x = px(index);
      const y = py(entry.value);
      if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    for (let index = this.bounds.length - 1; index >= 0; index -= 1) {
      const entry = this.bounds[index];
      ctx.lineTo(px(index), py(Number.isFinite(entry.bound) ? entry.bound : entry.value));
    }
    ctx.closePath();
    ctx.fillStyle = hsl({ ...color, h: color.h + 12 }, 0.18);
    ctx.fill();

    for (const [key, tone, width] of [['value', color, 1.8], ['bound', SEVERITY.proof, 1.4]]) {
      ctx.beginPath();
      let started = false;
      this.bounds.forEach((entry, index) => {
        const raw = entry[key];
        if (!Number.isFinite(raw)) return;
        const x = px(index);
        const y = py(raw);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      });
      this.applyGlow(tone, 0.7, 10);
      ctx.strokeStyle = hsl(tone, 0.9);
      ctx.lineWidth = width;
      ctx.stroke();
      this.clearGlow();
    }
  }

  /** Lastwaage: aufsteigend sortierte Balken. Der kürzeste hebt sich zuerst. */
  drawScale(rect, color) {
    const ctx = this.context;
    if (!this.loads.length) return;
    this.withinZone(rect, () => {
      const titleHeight = 14;
      const body = { x: rect.x, y: rect.y + titleHeight, w: rect.w, h: Math.max(0, rect.h - titleHeight) };

      // Die Überschrift stand bisher *oberhalb* der eigenen Zone und wurde vom
      // Nachbarn überschrieben. Sie gehört hinein.
      ctx.font = `600 ${LIST_FONT}px system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.1, 0.15, 0.6) }, 0.85);
      ctx.fillText(this.fitText('Last je Person', rect.w), rect.x, rect.y);

      const sorted = [...this.loads].sort((left, right) => left.value - right.value);
      const max = Math.max(1, ...sorted.map(entry => entry.value));

      // Richtungswechsel statt Ausdünnen: In einer flachen, breiten Zone stehen
      // die Balken als Säulen nebeneinander. So bleibt die gesamte Belegschaft
      // sichtbar, auch wenn nur dreißig Pixel Höhe zur Verfügung stehen —
      // waagerechte Balken bräuchten dafür neun Zeilen.
      if (body.h < sorted.length * SCALE_MIN_ROW && body.w / sorted.length >= 5) {
        const columnWidth = body.w / sorted.length;
        sorted.forEach((entry, index) => {
          const staffColor = { h: hueForStaff(entry.staffId || String(index)), s: 0.5, l: 0.5 };
          const height = Math.max(2, (body.h - 2) * clamp(entry.value / max, 0, 1));
          this.applyGlow(staffColor, 0.35, 6);
          ctx.fillStyle = hsl(staffColor, 0.6);
          this.roundRect(
            body.x + index * columnWidth + 1,
            body.y + body.h - height,
            Math.max(2, columnWidth - 2),
            height,
            2
          );
          ctx.fill();
          this.clearGlow();
        });
        return;
      }

      const capacity = Math.max(1, Math.floor(body.h / SCALE_MIN_ROW));
      const overflow = sorted.length > capacity;
      // Bei Überzahl bleiben die *höchstbelasteten* Personen sichtbar — sie sind
      // der Grund, warum Leximin überhaupt arbeitet.
      const shown = overflow ? sorted.slice(-Math.max(1, capacity - 1)) : sorted;
      const rowHeight = Math.min(11, body.h / Math.max(1, shown.length + (overflow ? 1 : 0)));

      shown.forEach((entry, index) => {
        const y = body.y + index * rowHeight;
        const staffColor = { h: hueForStaff(entry.staffId || String(index)), s: 0.5, l: 0.5 };
        const width = (rect.w - 4) * clamp(entry.value / max, 0, 1);
        this.applyGlow(staffColor, 0.35, 6);
        ctx.fillStyle = hsl(staffColor, 0.6);
        this.roundRect(rect.x + 2, y + 1, Math.max(2, width), Math.max(2, rowHeight - 2), 2);
        ctx.fill();
        this.clearGlow();
      });

      if (overflow) {
        ctx.font = `600 ${LIST_FONT}px system-ui, sans-serif`;
        ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.75);
        ctx.textBaseline = 'top';
        ctx.fillText(
          this.fitText(`+ ${sorted.length - shown.length} weniger belastete`, rect.w - 4),
          rect.x + 2,
          body.y + shown.length * rowHeight + 1
        );
      }
    });
  }

  /** Der Kristallisationspuls: eine Welle, ein Mal, über das gesamte Feld. */
  drawPulse(rect, now) {
    const ctx = this.context;
    const progress = 1 - this.pulse;
    const radius = Math.hypot(rect.w, rect.h) * progress;
    const tone = SEVERITY.proof;
    this.applyGlow(tone, 1.6, 26);
    ctx.strokeStyle = hsl(tone, this.pulse * 0.85);
    ctx.lineWidth = 2 + 4 * this.pulse;
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(1, radius), 0, TAU);
    ctx.stroke();
    this.clearGlow();
  }
}

export const CRYSTALLIZER_VERSION = '20260806.1';
