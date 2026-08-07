/**
 * Auto-Plan v10.6 — „Kaskade".
 *
 * Die Ansicht zeigt das Verfahren selbst: die lexikografische Kaskade. Der Kern
 * löst nicht ein Ziel, sondern eine geordnete Folge — erst die wichtigste Stufe
 * bis zum Beweis, dann die nächste unter der Auflage, die erste nicht mehr zu
 * verschlechtern. Genau das ist ein Wasserfall, und genau so steht es hier:
 *
 *   Becken        Ein Becken je Zielstufe, treppab angeordnet. Die oberste
 *                 Stufe ist die wichtigste; nach unten wird verfeinert.
 *   Wasserstand   Im laufenden Becken steht der Zielwert oben, die bewiesene
 *                 untere Schranke unten. Das Band dazwischen ist genau das,
 *                 was noch nicht bewiesen ist — es schrumpft im Takt der
 *                 Zwischenlösungen und wird bei Beweis zu einer Linie.
 *   Gefrieren     Eine bewiesene Stufe erstarrt: Das Becken wird ruhig, der
 *                 Wert eingraviert, ein Haken gesetzt. Eine abgebrochene Stufe
 *                 bleibt offen und trägt ihren Grund; eine unlösbare bricht.
 *   Überlauf      Zwischen abgeschlossenem und nächstem Becken fällt Wasser:
 *                 Das Ergebnis der Stufe wird zur Auflage der nächsten.
 *   Strom unten   Jede eingehende Zuordnung fällt als Tropfen in der Farbe
 *                 ihrer Person. Die Dichte des Stroms ist die tatsächliche
 *                 Entscheidungsrate — kein Taktgeber, ein Messwert.
 *
 * Alles Gezeigte stammt aus Meldungen des Laufs. Bei reduzierter Bewegung
 * entfallen Fließen, Tropfen und Wellen; Becken, Bänder und Werte bleiben als
 * ruhige Zustandsanzeige stehen.
 */

import {
  CanvasStage, SEVERITY, TAU, clamp, hsl, hueForStaff, nowMs
} from './auto-plan-visual-kit.js?v=20260806.1';
import { ease, hashNoise } from './auto-plan-visual-effects.js?v=20260806.1';

/* Lesbarkeitsuntergrenzen. Unter diesen Werten wird ausgedünnt statt gestaucht. */
const BASIN_MIN = 22;
/* Obergrenze, damit zwei Stufen auf einer hohen Leinwand nicht zu zwei
   Riesenwannen werden. Bleibt Platz übrig, steht die Kaskade mittig. */
const BASIN_MAX = 76;
/* Die Wasserlinie bekommt ihre eigene Bahn am Beckenboden. Lief sie über die
   ganze Beckenhöhe, verdeckte das Band bei großer Lücke die Beschriftung. */
const WATER_LANE = 11;
const LIST_FONT = 11;
const HEAD_HEIGHT = 15;
const STREAM_HEIGHT = 26;
/* Mehr Tropfen als das gleichzeitig zu zeigen wäre Rauschen, kein Messwert. */
const DROP_LIMIT = 90;

/** Status der Engine-Spur auf die drei Zustände der Ansicht abgebildet. */
function basinState(status) {
  if (status === 'done' || status === 'OPTIMAL') return 'frozen';
  if (status === 'broken' || status === 'INFEASIBLE') return 'broken';
  if (status === 'BUDGET_EXHAUSTED') return 'open';
  if (status === 'running' || status === 'FEASIBLE') return 'running';
  return 'pending';
}

export class AutoPlanCascade extends CanvasStage {
  constructor(canvas, monthData, options = {}) {
    super(canvas, options);

    this.stages = [];
    this.drops = [];
    this.seen = new Set();
    this.decisions = 0;
    this.splash = 0;
    this.provenAt = null;
    // Die Feldzahl des Monats ist die Bezugsgröße des Stroms: Ohne sie wäre die
    // Entscheidungsrate eine Zahl ohne Maßstab.
    this.fieldCount = Object.keys(monthData?.days || {}).length * 2;

    this.start();
  }

  update(update = {}) {
    if (!update || typeof update !== 'object') return;
    super.update(update);
    if (Array.isArray(update.stages)) {
      // Die Engine schickt den Stufenplan einmal vollständig. Bereits bekannte
      // Zustände bleiben erhalten — ein erneuter Plan darf keine bewiesene
      // Stufe zurück auf „offen" setzen.
      this.stages = update.stages.map(stage => {
        const known = this.stages.find(entry => entry.id === stage.id);
        return {
          id: stage.id,
          label: stage.label || stage.id,
          status: known?.status ?? stage.status ?? 'pending',
          value: known?.value ?? stage.value ?? null,
          bound: known?.bound ?? stage.bound ?? null,
          span: known?.span ?? null,
          fill: known?.fill ?? 0
        };
      });
    }
    if (update.stage && update.cpSatPhase) this.markStage(update.cpSatPhase, 'running');
    if (update.incumbent) this.applyIncumbent(update.incumbent);
  }

  markStage(id, status, value = null, bound = null) {
    const existing = this.stages.find(stage => stage.id === id || stage.label === id);
    if (!existing) {
      this.stages.push({ id, label: id, status, value, bound, span: null, fill: 0 });
      return;
    }
    // Ein bewiesenes Becken taut nicht wieder auf.
    if (existing.status !== 'done' || status === 'broken') existing.status = status;
    if (value !== null) existing.value = value;
    if (bound !== null) existing.bound = bound;
  }

  /**
   * Eine Zwischenlösung: Sie füllt das laufende Becken, lässt Tropfen fallen
   * und schließt die Stufe, sobald Zielwert und Schranke zusammenfallen.
   */
  applyIncumbent(incumbent) {
    const label = incumbent.stage || null;
    const stage = label
      ? this.stages.find(entry => entry.id === label || entry.label === label)
      : this.stages.find(entry => basinState(entry.status) === 'running');

    if (Array.isArray(incumbent.assignments)) {
      for (const assignment of incumbent.assignments) {
        const key = `${assignment.dateIso}|${assignment.role}|${assignment.staffId}`;
        if (!assignment.staffId || this.seen.has(key)) continue;
        this.seen.add(key);
        this.decisions += 1;
        this.spawnDrop(assignment.staffId);
      }
    }

    if (!stage) return;
    if (Number.isFinite(incumbent.objectiveValue)) stage.value = incumbent.objectiveValue;
    if (Number.isFinite(incumbent.bestBound)) stage.bound = incumbent.bestBound;
    if (stage.status === 'pending') stage.status = 'running';

    // Der Maßstab eines Beckens ist die größte je gesehene Lücke dieser Stufe.
    // Ohne ihn wäre das Band bei jedem Zwischenschritt neu normiert und stünde
    // scheinbar still, obwohl es sich schließt.
    if (Number.isFinite(stage.value) && Number.isFinite(stage.bound)) {
      const gap = Math.abs(stage.value - stage.bound);
      stage.span = Math.max(stage.span ?? 0, gap);
    }

    const gapClosed = incumbent.hasObjective === true
      && Number.isFinite(incumbent.objectiveValue)
      && Number.isFinite(incumbent.bestBound)
      && Math.abs(incumbent.objectiveValue - incumbent.bestBound) < 1e-9;
    if (gapClosed) {
      stage.status = 'done';
      this.splash = 1;
      if (this.provenAt === null && this.stages.every(entry => basinState(entry.status) === 'frozen')) {
        this.provenAt = nowMs();
      }
    }
  }

  spawnDrop(staffId) {
    if (this.reducedMotion) return;
    // Die Obergrenze folgt dem Budget: Bei knapper Zeit zeigt der Strom
    // weniger Tropfen, nie andere.
    const limit = Math.max(8, Math.round(DROP_LIMIT * this.detail));
    while (this.drops.length >= limit) this.drops.shift();
    this.drops.push({ hue: hueForStaff(staffId), x: Math.random(), t: 0, speed: 0.7 + Math.random() * 0.6, splashed: false });
  }

  finish() {
    super.finish();
    for (const stage of this.stages) if (stage.status === 'running') stage.status = 'open';
  }

  /** Beweisring und fallende Tropfen sind die Ausklänge dieser Ansicht. */
  isAnimating() {
    return super.isAnimating() || this.splash > 0 || this.drops.length > 0;
  }

  step(delta) {
    const speed = this.reducedMotion ? 6 : 2.6;
    for (const stage of this.stages) {
      const target = basinState(stage.status) === 'pending' ? 0 : 1;
      stage.fill = clamp(stage.fill + (target - stage.fill) * Math.min(1, delta * speed), 0, 1);
    }
    for (const drop of this.drops) drop.t += delta * drop.speed;
    this.drops = this.drops.filter(drop => drop.t < 1);
    if (this.splash > 0) this.splash = Math.max(0, this.splash - delta * 1.2);
  }

  layout() {
    const padding = 12;
    const gap = 8;
    const top = padding + HEAD_HEIGHT;
    const streamHeight = Math.min(STREAM_HEIGHT, Math.max(14, this.height * 0.12));
    const bodyHeight = Math.max(40, this.height - top - padding - streamHeight - gap);
    return {
      padding,
      head: { x: padding, y: padding, w: this.width - padding * 2, h: HEAD_HEIGHT },
      basins: { x: padding, y: top, w: this.width - padding * 2, h: bodyHeight },
      stream: { x: padding, y: top + bodyHeight + gap, w: this.width - padding * 2, h: streamHeight }
    };
  }

  /**
   * Welche Becken werden gezeigt?
   *
   * Passen nicht alle in die Mindesthöhe, endet der Ausschnitt am laufenden
   * Becken: Was gerade passiert, ist immer sichtbar; Bewiesenes darf nach oben
   * herauswandern. Die Zahl der übrigen wird ausgewiesen.
   */
  visibleStages(height) {
    const total = this.stages.length;
    const capacity = Math.max(1, Math.floor(height / BASIN_MIN));
    if (total <= capacity) return { stages: this.stages, start: 0, hidden: 0 };
    const room = Math.max(1, capacity - 1);
    const activeIndex = Math.max(0, this.stages.findLastIndex(stage => basinState(stage.status) !== 'pending'));
    const start = clamp(activeIndex - room + 1, 0, Math.max(0, total - room));
    return { stages: this.stages.slice(start, start + room), start, hidden: total - room };
  }

  draw(now) {
    const ctx = this.context;
    if (!ctx) return;
    const zones = this.layout();
    const color = this.activeColor(now);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawHead(zones.head, color);
    this.withinZone(zones.basins, () => this.drawBasins(zones.basins, color, now));
    this.withinZone(zones.stream, () => this.drawStream(zones.stream, color));
  }

  drawHead(rect, color) {
    const ctx = this.context;
    const frozen = this.stages.filter(stage => basinState(stage.status) === 'frozen').length;
    ctx.font = `600 ${LIST_FONT}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.1, 0.15, 0.6) }, 0.85);
    ctx.fillText(this.fitText('Kaskade · Zielstufen in Rangfolge', rect.w * 0.62), rect.x, rect.y);
    ctx.textAlign = 'right';
    ctx.fillStyle = hsl(this.provenAt ? SEVERITY.proof : { ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.85);
    ctx.fillText(
      this.fitText(this.stages.length ? `${frozen}/${this.stages.length} bewiesen` : 'Stufenplan folgt', rect.w * 0.38),
      rect.x + rect.w,
      rect.y
    );
    ctx.textAlign = 'left';
  }

  drawBasins(rect, color, now) {
    const ctx = this.context;
    if (!this.stages.length) {
      ctx.font = `${LIST_FONT}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.6);
      ctx.fillText(
        this.fitText('Becken erscheinen, sobald die exakte Suche ihren Stufenplan meldet', rect.w - 12),
        rect.x + 6,
        rect.y + rect.h / 2
      );
      return;
    }

    const { stages, start, hidden } = this.visibleStages(rect.h);
    const lines = Math.max(1, stages.length + (hidden ? 1 : 0));
    const rowHeight = clamp(rect.h / lines, BASIN_MIN, BASIN_MAX);
    const top = rect.y + Math.max(0, (rect.h - rowHeight * lines) / 2);
    // Der Treppenversatz macht die Rangfolge auf einen Blick lesbar, darf aber
    // die Becken nie unter zwei Drittel der Breite drücken.
    const step = Math.min(10, (rect.w * 0.34) / Math.max(1, lines));

    stages.forEach((stage, index) => {
      const state = basinState(stage.status);
      const y = top + index * rowHeight;
      const height = Math.max(10, rowHeight - 5);
      const x = rect.x + index * step;
      const width = Math.max(60, rect.w - index * step);
      const tone = state === 'broken' ? SEVERITY.red : state === 'frozen' ? SEVERITY.proof : color;

      // Beckenwanne.
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.32, 0, 0.95) }, 0.12);
      this.roundRect(x, y, width, height, 5);
      ctx.fill();

      // Überlauf in das nächste Becken: Er entsteht erst, wenn diese Stufe
      // wirklich abgeschlossen ist — vorher fließt nichts weiter.
      if (state === 'frozen' && index < stages.length - 1 && !this.reducedMotion) {
        const fallX = x + width - Math.max(6, step * 1.4);
        ctx.strokeStyle = hsl(SEVERITY.proof, 0.28 + 0.2 * Math.sin(now / 300 + index));
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(fallX, y + height);
        ctx.lineTo(fallX, y + rowHeight);
        ctx.stroke();
      }

      // Wasserlinie: Die Höhe des Bandes ist die verbliebene Ungewissheit
      // zwischen Zielwert und bewiesener Schranke. Sie sinkt auf eine Linie,
      // sobald beide zusammenfallen — der Beweis wird zum Standbild.
      const lane = Math.min(WATER_LANE, height * 0.42);
      if (state !== 'pending') {
        const inner = { x: x + 3, y: y + height - lane - 2, w: width - 6, h: lane };
        const gap = Number.isFinite(stage.value) && Number.isFinite(stage.bound)
          ? Math.abs(stage.value - stage.bound)
          : null;
        const share = gap === null || !stage.span ? 1 : clamp(gap / stage.span, 0, 1);
        const bandHeight = state === 'frozen' ? 1.5 : Math.max(1.5, inner.h * (0.12 + 0.88 * share));
        const bandY = inner.y + inner.h - bandHeight;
        const bandWidth = Math.max(1.5, inner.w * stage.fill);

        ctx.fillStyle = hsl(tone, state === 'broken' ? 0.5 : 0.34 + 0.3 * stage.fill);
        this.roundRect(inner.x, bandY, bandWidth, bandHeight, Math.min(2, bandHeight / 2));
        ctx.fill();
        // Ein Unterzug statt Plättchen: Die Wasserlinie ist über achthundert
        // Pixel lang und wenige hoch. Punktförmiger Schein ergäbe darauf zwei
        // Leuchtflecken; zwei weiche Rechtecke ergeben ein glühendes Band — und
        // kosten zwei Füllungen statt eines Dutzends Kopien.
        if (this.detail > 0.3) {
          const halo = state === 'frozen' ? 0.16 : 0.1 + 0.1 * stage.fill;
          for (const spread of [3, 1.4]) {
            ctx.fillStyle = hsl({ ...tone, l: clamp(tone.l + 0.12, 0, 0.92) }, halo / spread);
            this.roundRect(inner.x, bandY - spread, bandWidth, bandHeight + spread * 2, (bandHeight + spread * 2) / 2);
            ctx.fill();
          }
        }

        // Oberkante Zielwert, Unterkante Schranke. Sie treffen sich genau dann,
        // wenn die Stufe bewiesen ist. Solange sie sich nicht treffen, ist das
        // Becken in Bewegung: Die Oberkante trägt eine flache Welle, die mit der
        // Lücke abklingt. Ein bewiesenes Becken steht still — genau das ist die
        // Aussage von „erstarrt".
        ctx.strokeStyle = hsl(tone, 0.75);
        ctx.lineWidth = 1;
        const restless = state === 'running' && !this.reducedMotion && this.detail > 0.4;
        for (const [edge, waving] of [[bandY, restless], [bandY + bandHeight, false]]) {
          ctx.beginPath();
          if (!waving) {
            ctx.moveTo(inner.x, edge);
            ctx.lineTo(inner.x + bandWidth, edge);
          } else {
            // Zwölf Stützstellen genügen für eine ruhige Welle; die Amplitude
            // folgt der verbliebenen Ungewissheit.
            const steps = 12;
            const amplitude = Math.min(2.2, bandHeight * 0.35) * share;
            for (let step = 0; step <= steps; step += 1) {
              const t = step / steps;
              const x = inner.x + bandWidth * t;
              const y = edge + Math.sin(t * Math.PI * 3 + now / 260 + index) * amplitude;
              if (step === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }

        // Ein erstarrtes Becken bekommt einen wandernden Lichtgrat: die
        // Kristallkante, die anzeigt, dass hier nichts mehr verhandelt wird.
        if (state === 'frozen' && this.detail > 0.5 && !this.reducedMotion) {
          const sweep = ((now / 2400 + index * 0.2) % 1);
          this.glowAt(SEVERITY.proof, inner.x + inner.w * sweep, bandY, 0.7, 10);
        }
      }

      // Beschriftung in der oberen Bahn — über der Wasserlinie, nie darunter.
      const textY = y + Math.max(8, (height - lane) / 2);
      ctx.font = `600 ${LIST_FONT}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      let valueText = '';
      if (stage.value !== null && Number.isFinite(Number(stage.value))) {
        valueText = Number(stage.value).toFixed(Number.isInteger(stage.value) ? 0 : 2);
      }
      const boundText = Number.isFinite(Number(stage.bound)) && stage.bound !== null && state !== 'frozen'
        ? `≥ ${Number(stage.bound).toFixed(Number.isInteger(stage.bound) ? 0 : 2)}`
        : '';
      const tail = [valueText, boundText].filter(Boolean).join('  ');
      const tailWidth = tail ? ctx.measureText(tail).width + 12 : 0;
      const mark = state === 'frozen' ? '✓ ' : state === 'broken' ? '✕ ' : state === 'running' ? '▸ ' : state === 'open' ? '– ' : '· ';
      ctx.fillStyle = hsl({ ...tone, l: clamp(tone.l - 0.28, 0.1, 0.5) }, 0.95);
      ctx.fillText(this.fitText(`${mark}${index + start + 1}. ${stage.label}`, width - 16 - tailWidth), x + 8, textY);
      if (tail) {
        ctx.textAlign = 'right';
        ctx.fillText(tail, x + width - 8, textY);
        ctx.textAlign = 'left';
      }
    });

    if (hidden) {
      ctx.font = `${LIST_FONT}px system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.75);
      ctx.fillText(
        this.fitText(`+ ${hidden} weitere Stufen`, rect.w - 14),
        rect.x + 8,
        top + stages.length * rowHeight + rowHeight / 2
      );
    }

    if (this.splash > 0 && !this.reducedMotion) this.drawSplash(rect);
  }

  /** Der Moment eines Beweises: ein Ring, der über die Kaskade läuft. */
  drawSplash(rect) {
    const ctx = this.context;
    const progress = 1 - this.splash;
    this.applyGlow(SEVERITY.proof, 1.5, 24);
    ctx.strokeStyle = hsl(SEVERITY.proof, this.splash * 0.7);
    ctx.lineWidth = 1.5 + 3 * this.splash;
    ctx.beginPath();
    ctx.arc(rect.x + rect.w / 2, rect.y + rect.h / 2, Math.max(1, Math.hypot(rect.w, rect.h) * progress * 0.5), 0, TAU);
    ctx.stroke();
    this.clearGlow();
  }

  /** Entscheidungsstrom: ein Tropfen je erstmals gesehener Zuordnung. */
  drawStream(rect, color) {
    const ctx = this.context;
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.32, 0, 0.95) }, 0.12);
    this.roundRect(rect.x, rect.y, rect.w, rect.h, 4);
    ctx.fill();

    // Schweife bekommen nur die jüngsten Tropfen. Ältere sind ohnehin fast
    // verblasst; ihre Spur kostete zwei Striche für nichts.
    let trails = Math.round(24 * this.detail);
    for (let position = this.drops.length - 1; position >= 0; position -= 1) {
      const drop = this.drops[position];
      const tone = { h: drop.hue, s: 0.55, l: 0.52 };
      const x = rect.x + 4 + (rect.w - 8) * drop.x;
      // Fallen heißt beschleunigen: Ein Tropfen mit gleichbleibender
      // Geschwindigkeit sieht aus wie eine Perlenkette an einer Schnur.
      const fall = ease.outCubic(clamp(drop.t, 0, 1) * 0.4 + Math.pow(clamp(drop.t, 0, 1), 2) * 0.6);
      const y = rect.y + 3 + (rect.h - 6) * fall;
      const alpha = 0.85 * (1 - drop.t);

      // Schweif: zwei kurze Striche mit abnehmender Deckkraft. Ein echter
      // Verlauf sähe minimal weicher aus, kostet aber je Tropfen und Bild ein
      // neues Verlaufsobjekt — bei neunzig Tropfen und dreißig Bildern in der
      // Sekunde sind das zweitausendsiebenhundert Allokationen je Sekunde für
      // einen Unterschied, den niemand sieht.
      if (this.detail > 0.5 && trails > 0) {
        trails -= 1;
        const reach = rect.h * 0.3;
        ctx.lineWidth = 1;
        for (const [from, to, fade] of [[y - reach, y - reach * 0.5, 0.18], [y - reach * 0.5, y, 0.45]]) {
          ctx.strokeStyle = hsl(tone, alpha * fade);
          ctx.beginPath();
          ctx.moveTo(x, Math.max(rect.y + 2, from));
          ctx.lineTo(x, Math.max(rect.y + 2, to));
          ctx.stroke();
        }
      }

      ctx.fillStyle = hsl(tone, alpha);
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, TAU);
      ctx.fill();
      if (this.detail > 0.3) this.glowAt(tone, x, y, 0.5, 8);

      // Aufschlag: Wer den Boden erreicht, schlägt einen Ring. Der Ring wird
      // genau einmal je Tropfen ausgelöst.
      if (!drop.splashed && drop.t > 0.92) {
        drop.splashed = true;
        // Klein halten: Ein Aufschlagring, der breiter ist als die Zone hoch,
        // wird von ihr beschnitten und liest sich als Bogen, nicht als Spritzer.
        this.ripples.emit({ x, y: rect.y + rect.h - 4, hue: drop.hue, grow: rect.h * 0.8, width: 1.2 });
      }
    }
    this.ripples.paint(ctx, Math.round(6 * this.detail));

    ctx.font = `600 9px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.24, 0.1, 0.45) }, 0.95);
    const seconds = Math.max(0.001, (nowMs() - this.startedAt) / 1000);
    ctx.fillText(
      this.fitText(
        `${this.decisions} Zuordnungen gesichtet · ${(this.decisions / seconds).toFixed(1)}/s · ${this.fieldCount} Felder im Monat`,
        rect.w - 12
      ),
      rect.x + 6,
      rect.y + rect.h / 2
    );
  }
}

export const CASCADE_VERSION = '20260806.1';
