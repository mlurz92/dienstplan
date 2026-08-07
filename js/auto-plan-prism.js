/**
 * Auto-Plan v10.7 — „Prisma".
 *
 * Der Lauf als Licht: Ein Strahl fällt von links auf ein Prisma und wird dort
 * in die Zielstufen der lexikografischen Kaskade aufgefächert — je Stufe ein
 * Spektralband, in Regenbogenreihenfolge von Rot bis Violett.
 *
 *   Strahl        Der laufende Prozess. Seine Dicke folgt dem Fortschritt,
 *                 seine Farbe der Phase; eine rote Bewertung färbt ihn kurz um.
 *   Prisma        Der Punkt, an dem aus einem Suchlauf getrennte Ziele werden.
 *   Bänder        Ein Band je Zielstufe, oben die wichtigste. Ein wartendes
 *                 Band liegt matt, das laufende atmet, ein bewiesenes leuchtet
 *                 bis zum Rand und trägt seinen Wert.
 *   Funken        Jede eingehende Zuordnung fliegt als Funke in der Farbe ihrer
 *                 Person den Strahl entlang und bricht sich im Band der Stufe,
 *                 die sie gerade beschäftigt. Die Dichte ist die tatsächliche
 *                 Entscheidungsrate — kein Taktgeber, ein Messwert.
 *
 * Die Reihenfolge der Farben ist dieselbe wie im Monatsfarbsystem „Regenbogen":
 * Rot beginnt, Violett schließt. Das ist keine Dekoration, sondern dieselbe
 * Lesehilfe an zwei Orten — oben die wichtigste Stufe, unten die feinste.
 *
 * Alles Gezeigte stammt aus Meldungen des Laufs. Bei reduzierter Bewegung
 * entfallen Funken, Atmen und Brechungsblitz; Strahl, Prisma und Bänder bleiben
 * als ruhige Zustandsanzeige stehen.
 */

import { CanvasStage, SEVERITY, TAU, clamp, hsl, hueForStaff, nowMs } from './auto-plan-visual-kit.js?v=20260806.1';

/* Lesbarkeitsuntergrenzen. Unter diesen Werten wird ausgedünnt statt gestaucht. */
const BAND_MIN = 9;
const LIST_FONT = 11;
const HEAD_HEIGHT = 15;
/* Mehr Funken gleichzeitig wäre Rauschen, kein Messwert. */
const SPARK_LIMIT = 70;
/* Ohne Stufenplan zeigt das Prisma das volle Spektrum — sieben Bänder, wie sie
   der Physikunterricht kennt. Es steht dann für „noch nichts aufgeteilt". */
const IDLE_BANDS = 7;
/* Rot bis Violett. Der Kreis wird bewusst nicht geschlossen: Ein zwölftes Band
   in Magenta läge neben dem roten ersten und ließe die Reihenfolge kippen. */
const SPECTRUM_START = 0;
const SPECTRUM_END = 292;

/** Status der Engine-Spur auf die drei Zustände der Ansicht abgebildet. */
function bandState(status) {
  if (status === 'done' || status === 'OPTIMAL') return 'proven';
  if (status === 'broken' || status === 'INFEASIBLE') return 'broken';
  if (status === 'running' || status === 'FEASIBLE') return 'running';
  if (status === 'open' || status === 'BUDGET_EXHAUSTED') return 'open';
  return 'pending';
}

export class AutoPlanPrism extends CanvasStage {
  constructor(canvas, monthData, options = {}) {
    super(canvas, options);

    this.stages = [];
    this.sparks = [];
    this.seen = new Set();
    this.decisions = 0;
    this.refraction = 0;
    this.provenAt = null;
    // Die Feldzahl des Monats ist die Bezugsgröße: Ohne sie wäre die Zahl der
    // Entscheidungen eine Zahl ohne Maßstab.
    this.fieldCount = Object.keys(monthData?.days || {}).length * 2;

    this.start();
  }

  update(update = {}) {
    if (!update || typeof update !== 'object') return;
    super.update(update);
    if (Array.isArray(update.stages)) {
      // Die Engine schickt den Stufenplan einmal vollständig. Bereits bekannte
      // Zustände bleiben erhalten — ein erneuter Plan darf kein bewiesenes Band
      // zurück auf „wartend" setzen.
      this.stages = update.stages.map(stage => {
        const known = this.stages.find(entry => entry.id === stage.id);
        return {
          id: stage.id,
          label: stage.label || stage.id,
          status: known?.status ?? stage.status ?? 'pending',
          value: known?.value ?? stage.value ?? null,
          bound: known?.bound ?? stage.bound ?? null,
          lit: known?.lit ?? 0
        };
      });
    }
    if (update.stage && update.cpSatPhase) this.markStage(update.cpSatPhase, 'running');
    if (update.incumbent) this.applyIncumbent(update.incumbent);
  }

  markStage(id, status, value = null, bound = null) {
    const existing = this.stages.find(stage => stage.id === id || stage.label === id);
    if (!existing) {
      this.stages.push({ id, label: id, status, value, bound, lit: 0 });
      return;
    }
    // Ein bewiesenes Band erlischt nicht wieder.
    if (existing.status !== 'done' || status === 'broken') existing.status = status;
    if (value !== null) existing.value = value;
    if (bound !== null) existing.bound = bound;
  }

  /**
   * Eine Zwischenlösung: Sie hellt das laufende Band auf, schickt Funken und
   * schließt die Stufe, sobald Zielwert und Schranke zusammenfallen.
   */
  applyIncumbent(incumbent) {
    const label = incumbent.stage || null;
    const index = label
      ? this.stages.findIndex(entry => entry.id === label || entry.label === label)
      : this.stages.findIndex(entry => bandState(entry.status) === 'running');
    const stage = index >= 0 ? this.stages[index] : null;

    if (Array.isArray(incumbent.assignments)) {
      for (const assignment of incumbent.assignments) {
        const key = `${assignment.dateIso}|${assignment.role}|${assignment.staffId}`;
        if (!assignment.staffId || this.seen.has(key)) continue;
        this.seen.add(key);
        this.decisions += 1;
        this.spawnSpark(assignment.staffId, index);
      }
    }

    if (!stage) return;
    if (Number.isFinite(incumbent.objectiveValue)) stage.value = incumbent.objectiveValue;
    if (Number.isFinite(incumbent.bestBound)) stage.bound = incumbent.bestBound;
    if (stage.status === 'pending') stage.status = 'running';

    // Ohne Zielfunktion gibt es nichts zu beweisen: Die vorgeschaltete
    // Zulässigkeitssuche meldet Zielwert wie Schranke als null, und aus zwei
    // Nullen wird hier kein Optimum.
    const gapClosed = incumbent.hasObjective === true
      && Number.isFinite(incumbent.objectiveValue)
      && Number.isFinite(incumbent.bestBound)
      && Math.abs(incumbent.objectiveValue - incumbent.bestBound) < 1e-9;
    if (!gapClosed) return;

    stage.status = 'done';
    this.refraction = 1;
    if (this.provenAt === null && this.stages.every(entry => bandState(entry.status) === 'proven')) {
      this.provenAt = nowMs();
    }
  }

  spawnSpark(staffId, bandIndex) {
    if (this.reducedMotion) return;
    // Die Obergrenze folgt dem Budget: Bei knapper Zeit zeigt das Prisma
    // weniger Funken, nie andere.
    const limit = Math.max(6, Math.round(SPARK_LIMIT * this.detail));
    while (this.sparks.length >= limit) this.sparks.shift();
    this.sparks.push({
      hue: hueForStaff(staffId),
      band: bandIndex,
      t: 0,
      speed: 0.55 + Math.random() * 0.5,
      drift: Math.random() - 0.5
    });
  }

  finish() {
    super.finish();
    // Was beim Ende noch lief, ist nicht bewiesen — es blieb offen.
    for (const stage of this.stages) if (stage.status === 'running') stage.status = 'open';
  }

  /** Funken und Brechungsblitz sind die Ausklänge dieser Ansicht. */
  isAnimating() {
    return super.isAnimating() || this.sparks.length > 0 || this.refraction > 0;
  }

  step(delta) {
    const speed = this.reducedMotion ? 6 : 3.1;
    for (const stage of this.stages) {
      const state = bandState(stage.status);
      const target = state === 'proven' ? 1 : state === 'running' ? 0.66 : state === 'pending' ? 0.12 : 0.34;
      stage.lit = clamp(stage.lit + (target - stage.lit) * Math.min(1, delta * speed), 0, 1);
    }
    for (const spark of this.sparks) spark.t += delta * spark.speed;
    this.sparks = this.sparks.filter(spark => spark.t < 1);
    if (this.refraction > 0) this.refraction = Math.max(0, this.refraction - delta * 1.3);
  }

  layout() {
    const padding = 12;
    const top = padding + HEAD_HEIGHT;
    const bodyHeight = Math.max(30, this.height - top - padding);
    const width = Math.max(60, this.width - padding * 2);
    return {
      head: { x: padding, y: padding, w: width, h: HEAD_HEIGHT },
      body: { x: padding, y: top, w: width, h: bodyHeight }
    };
  }

  /**
   * Welche Bänder werden gezeigt?
   *
   * Passen nicht alle in die Mindesthöhe, endet der Ausschnitt am laufenden
   * Band: Was gerade passiert, ist immer sichtbar; Bewiesenes darf nach oben
   * herauswandern. Die Zahl der übrigen wird ausgewiesen.
   */
  visibleStages(height) {
    const total = this.stages.length;
    const capacity = Math.max(1, Math.floor(height / BAND_MIN));
    if (total <= capacity) return { stages: this.stages, hidden: 0 };
    const activeIndex = Math.max(0, this.stages.findLastIndex(stage => bandState(stage.status) !== 'pending'));
    const start = clamp(activeIndex - capacity + 1, 0, Math.max(0, total - capacity));
    return { stages: this.stages.slice(start, start + capacity), hidden: total - capacity };
  }

  /** Der Farbton eines Bandes: Rot beginnt, Violett schließt. */
  bandHue(index, count) {
    if (count <= 1) return SPECTRUM_START;
    return SPECTRUM_START + (SPECTRUM_END - SPECTRUM_START) * (index / (count - 1));
  }

  draw(now) {
    const ctx = this.context;
    if (!ctx) return;
    const zones = this.layout();
    const color = this.activeColor(now);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawHead(zones.head, color);
    this.withinZone(zones.body, () => this.drawSpectrum(zones.body, color, now));
  }

  drawHead(rect, color) {
    const ctx = this.context;
    const proven = this.stages.filter(stage => bandState(stage.status) === 'proven').length;
    ctx.font = `600 ${LIST_FONT}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.1, 0.15, 0.6) }, 0.85);
    ctx.fillText(this.fitText('Prisma · ein Strahl, aufgefächert in Zielstufen', rect.w * 0.62), rect.x, rect.y);

    const decisions = this.fieldCount
      ? `${this.decisions}/${this.fieldCount} Felder`
      : `${this.decisions} Entscheidungen`;
    ctx.textAlign = 'right';
    ctx.fillStyle = hsl(this.provenAt ? SEVERITY.proof : { ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.85);
    ctx.fillText(
      this.fitText(this.stages.length ? `${proven}/${this.stages.length} bewiesen · ${decisions}` : decisions, rect.w * 0.38),
      rect.x + rect.w,
      rect.y
    );
  }

  drawSpectrum(rect, color, now) {
    const ctx = this.context;
    const centerY = rect.y + rect.h / 2;
    const prismX = rect.x + Math.min(rect.w * 0.32, 130);
    const prismSize = clamp(rect.h * 0.34, 14, 54);
    const { stages, hidden } = this.visibleStages(rect.h);
    const count = stages.length || IDLE_BANDS;
    const fanHeight = Math.max(BAND_MIN * count * 0.9, Math.min(rect.h * 0.92, BAND_MIN * count * 3));
    const bandHeight = fanHeight / count;
    const fanTop = centerY - fanHeight / 2;
    const right = rect.x + rect.w;

    this.drawBeam(rect, prismX, centerY, color, now);

    for (let index = 0; index < count; index += 1) {
      const stage = stages[index] || null;
      const hue = this.bandHue(index, count);
      const lit = stage ? stage.lit : 0.24;
      const top = fanTop + index * bandHeight;
      const breathing = !this.reducedMotion && stage && bandState(stage.status) === 'running'
        ? 0.14 * (0.5 + 0.5 * Math.sin(now / 320 + index))
        : 0;
      const alpha = clamp(lit * 0.72 + breathing, 0.08, 0.95) * (0.35 + this.detail * 0.65);

      // Das Band beginnt schmal am Prisma und öffnet sich nach rechts — so wie
      // Licht sich bricht, und zugleich die Aussage: Am Anfang ist es ein Lauf,
      // am Ende sind es unterscheidbare Ziele.
      ctx.beginPath();
      ctx.moveTo(prismX, centerY - prismSize * 0.12);
      ctx.lineTo(right, top);
      ctx.lineTo(right, top + bandHeight * 0.94);
      ctx.lineTo(prismX, centerY + prismSize * 0.12);
      ctx.closePath();
      ctx.fillStyle = hsl({ h: hue, s: 0.78, l: 0.56 }, alpha);
      ctx.fill();

      if (!stage) continue;
      this.drawBandLabel(stage, { x: prismX, right, top, height: bandHeight, hue });
    }

    this.drawPrism(prismX, centerY, prismSize, color);
    if (!this.reducedMotion) this.drawSparks(rect, prismX, centerY, fanTop, bandHeight, count);

    if (hidden > 0) {
      ctx.font = `500 ${LIST_FONT - 1}px system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.1, 0.3, 0.7) }, 0.7);
      ctx.fillText(this.fitText(`+${hidden} bewiesene Stufen oberhalb`, rect.w * 0.5), rect.x, rect.y + rect.h);
    }
  }

  /** Der Strahl: Dicke aus dem Fortschritt, Farbe aus der Phase. */
  drawBeam(rect, prismX, centerY, color, now) {
    const ctx = this.context;
    const thickness = clamp(2 + this.progress * 9, 2, 12);
    const pulse = this.reducedMotion ? 0 : 0.08 * Math.sin(now / 260);
    ctx.beginPath();
    ctx.moveTo(rect.x, centerY - thickness / 2);
    ctx.lineTo(prismX, centerY - thickness * 0.22);
    ctx.lineTo(prismX, centerY + thickness * 0.22);
    ctx.lineTo(rect.x, centerY + thickness / 2);
    ctx.closePath();
    ctx.fillStyle = hsl({ ...color, s: clamp(color.s - 0.2, 0, 1), l: clamp(color.l + 0.24, 0.4, 0.92) }, 0.55 + pulse);
    ctx.fill();
    if (this.detail > 0.4) this.glowAt(color, (rect.x + prismX) / 2, centerY, 0.5 + this.progress * 0.5, 14);
  }

  /** Das Prisma selbst — ein Dreieck, das im Beweis kurz aufblitzt. */
  drawPrism(x, y, size, color) {
    const ctx = this.context;
    const flash = this.refraction;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.42, y + size * 0.5);
    ctx.lineTo(x, y - size * 0.62);
    ctx.lineTo(x + size * 0.42, y + size * 0.5);
    ctx.closePath();
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.3, 0.5, 0.95) }, 0.14 + flash * 0.35);
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.7) }, 0.75);
    ctx.stroke();
    if (flash > 0 && this.detail > 0.3) this.glowAt(SEVERITY.proof, x, y, flash, 22);
  }

  /**
   * Die Funken.
   *
   * Bis zum Prisma laufen alle auf dem Strahl; danach folgt jeder dem Band
   * seiner Stufe. Der Knick liegt genau dort, wo aus einem Lauf getrennte Ziele
   * werden — das ist die ganze Aussage dieser Ansicht in einer Bewegung.
   */
  drawSparks(rect, prismX, centerY, fanTop, bandHeight, count) {
    const ctx = this.context;
    const right = rect.x + rect.w;
    const limit = Math.max(4, this.sparkLimit || 16);
    for (const spark of this.sparks.slice(-limit)) {
      const band = spark.band >= 0 && spark.band < count ? spark.band : Math.floor(count / 2);
      const targetY = fanTop + (band + 0.5) * bandHeight + spark.drift * bandHeight * 0.5;
      const x = spark.t <= 0.5
        ? rect.x + (prismX - rect.x) * (spark.t / 0.5)
        : prismX + (right - prismX) * ((spark.t - 0.5) / 0.5);
      const y = spark.t <= 0.5 ? centerY : centerY + (targetY - centerY) * ((spark.t - 0.5) / 0.5);
      const fade = 1 - Math.max(0, spark.t - 0.75) / 0.25;
      ctx.beginPath();
      ctx.arc(x, y, 1.9, 0, TAU);
      ctx.fillStyle = hsl({ h: spark.hue, s: 0.72, l: 0.62 }, 0.85 * fade);
      ctx.fill();
    }
  }

  /** Beschriftung eines Bandes: Name links, Wert rechts — beide nur, wenn Platz ist. */
  drawBandLabel(stage, geometry) {
    const ctx = this.context;
    if (geometry.height < BAND_MIN + 2) return;
    const state = bandState(stage.status);
    const size = Math.min(LIST_FONT, geometry.height - 2);
    ctx.font = `${state === 'proven' ? 600 : 500} ${size}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const middle = geometry.top + geometry.height * 0.47;
    const room = Math.max(20, geometry.right - geometry.x - 90);

    ctx.textAlign = 'left';
    ctx.fillStyle = hsl({ h: geometry.hue, s: 0.5, l: 0.24 }, state === 'pending' ? 0.5 : 0.9);
    ctx.fillText(this.fitText(stage.label, room), geometry.x + Math.max(24, room * 0.06), middle);

    const mark = state === 'proven' ? '✓' : state === 'broken' ? '✕' : state === 'open' ? '·' : '';
    const value = Number.isFinite(stage.value) ? String(stage.value) : '';
    const text = [value, mark].filter(Boolean).join(' ');
    if (!text) return;
    ctx.textAlign = 'right';
    ctx.fillText(this.fitText(text, 80), geometry.right - 4, middle);
  }
}

export const PRISM_VERSION = '20260806.1';
