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
 * GLANZ FOLGT DER FARBE
 *
 * Der Glow ist keine feste Größe. Wärme, Sättigung und Helligkeit einer Farbe
 * bestimmen, wie weit und wie stark sie strahlt: Ein warmer, satter Ton trägt
 * weiter als ein kühler, blasser; eine dunkle Farbe braucht mehr Radius, um
 * überhaupt zu leuchten, eine sehr helle würde sonst ausbrennen. Dadurch wirken
 * rote Warnungen heiß und drängend, grüne Bestätigungen ruhig, und die
 * Monatsfarbe bleibt in jedem Monat gleich präsent, ohne je zu schreien.
 *
 * Die Schleife ist rahmenratenunabhängig und respektiert `prefers-reduced-motion`:
 * Dann entfallen Fächern, Puls und Drift — Raster, Kurven und Balken bleiben als
 * ruhige Zustandsanzeige.
 */

const TAU = Math.PI * 2;

/** Semantische Farbwelt in HSL. Die Zahlen sind Ton, Sättigung, Helligkeit. */
const SEVERITY = Object.freeze({
  red: { h: 6, s: 0.78, l: 0.55 },
  orange: { h: 28, s: 0.82, l: 0.55 },
  yellow: { h: 46, s: 0.85, l: 0.55 },
  green: { h: 148, s: 0.52, l: 0.44 },
  gray: { h: 220, s: 0.06, l: 0.55 },
  proof: { h: 168, s: 0.62, l: 0.5 }
});

const PHASE_SHIFT = Object.freeze({
  analysis: 0,
  warmstart: -12,
  search: -12,
  propagate: -22,
  model: 18,
  exact: 30,
  repair: 40,
  polish: 52,
  perfect: 60,
  audit: -34,
  certify: -44,
  complete: -44,
  blocked: 96
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hsl({ h, s, l }, alpha = 1) {
  return `hsl(${((h % 360) + 360) % 360} ${clamp(s * 100, 0, 100)}% ${clamp(l * 100, 0, 100)}% / ${clamp(alpha, 0, 1)})`;
}

/**
 * Strahlkraft einer Farbe.
 *
 * `warmth` ist eins bei rund 40° (Bernstein) und null bei rund 220° (Kobalt).
 * Warme, satte Töne tragen weiter. Der Helligkeitsterm ist eine umgekehrte
 * Parabel mit Maximum bei mittlerer Helligkeit: Tiefdunkle Farben strahlen
 * kaum, sehr helle brennen aus, dazwischen liegt der nutzbare Bereich.
 */
export function glowProfile(color, energy = 1) {
  const warmth = Math.cos(((color.h - 40) * Math.PI) / 180) * 0.5 + 0.5;
  const brightness = 1 - Math.pow((color.l - 0.55) / 0.55, 2);
  const reach = 0.45 + 0.75 * warmth + 0.55 * color.s;
  return {
    warmth,
    radius: clamp(reach * (0.6 + 0.9 * clamp(energy, 0, 2)) * (0.55 + 0.75 * clamp(brightness, 0, 1)), 0.05, 3.4),
    alpha: clamp(0.24 + 0.5 * color.s * clamp(brightness, 0, 1) * clamp(energy, 0, 2), 0.05, 0.92)
  };
}

/** Stabiler Farbton je Person – gleiche Person, gleiche Farbe, jeden Monat. */
function hueForStaff(staffId) {
  let hash = 2166136261;
  for (let index = 0; index < staffId.length; index += 1) {
    hash ^= staffId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

function readAccent(canvas) {
  try {
    const styles = getComputedStyle(canvas);
    const raw = styles.getPropertyValue('--month-accent') || styles.getPropertyValue('--accent');
    const match = raw.trim().match(/^#?([0-9a-f]{6})$/i);
    if (!match) return { h: 208, s: 0.42, l: 0.48 };
    const value = parseInt(match[1], 16);
    return rgbToHsl((value >> 16) & 255, (value >> 8) & 255, value & 255);
  } catch {
    return { h: 208, s: 0.42, l: 0.48 };
  }
}

function rgbToHsl(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === red) h = ((green - blue) / d + (green < blue ? 6 : 0)) * 60;
  else if (max === green) h = ((blue - red) / d + 2) * 60;
  else h = ((red - green) / d + 4) * 60;
  return { h, s, l };
}

export class AutoPlanCrystallizer {
  constructor(canvas, monthData, options = {}) {
    this.canvas = canvas;
    this.context = canvas?.getContext?.('2d') || null;
    this.reducedMotion = Boolean(options.reducedMotion)
      || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.accent = readAccent(canvas);
    this.phase = 'analysis';
    this.progress = 0;
    this.message = '';
    this.running = true;
    this.crystallizedAt = null;
    this.pulse = 0;
    this.lastFrame = 0;
    this.startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    this.cells = this.buildCells(monthData);
    this.cellByKey = new Map(this.cells.map(cell => [cell.key, cell]));
    this.stages = [];
    this.loads = [];
    this.bounds = [];
    this.severity = null;
    this.severityUntil = 0;

    // Die Laufanzeige trägt ihren Zustand am Element: Andere Schichten und die
    // Browsertests lesen daran ab, ob gezeichnet wird. Der Vertrag stammt aus
    // der Orbit-Ansicht und bleibt unverändert gültig.
    if (canvas?.dataset) canvas.dataset.renderMode = this.context ? 'running' : 'unavailable';

    if (this.context) {
      this.resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => this.resize())
        : null;
      this.resizeObserver?.observe(canvas);
      this.resize();
      this.loop = this.loop.bind(this);
      this.frame = requestAnimationFrame(this.loop);
    }
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
          spark: 0
        });
      }
    }
    return cells;
  }

  resize() {
    if (!this.canvas || !this.context) return;
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.max(320, Math.floor(rect.width || this.canvas.clientWidth || 640));
    const height = Math.max(200, Math.floor(rect.height || this.canvas.clientHeight || 320));
    this.canvas.width = Math.floor(width * ratio);
    this.canvas.height = Math.floor(height * ratio);
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = width;
    this.height = height;
  }

  /**
   * Fortschrittsmeldung der Engine. Alles, was hier ankommt, ist ein Ereignis
   * des Laufs — nichts wird interpoliert, um Betrieb vorzutäuschen.
   */
  update(update = {}) {
    if (!update || typeof update !== 'object') return;
    if (update.phase) this.phase = update.phase;
    if (Number.isFinite(update.progress)) this.progress = clamp(update.progress, 0, 1);
    if (update.message) this.message = String(update.message);
    if (update.level && SEVERITY[update.level]) {
      this.severity = SEVERITY[update.level];
      this.severityUntil = (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 900;
    }
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
        t: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - this.startedAt,
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
    if (cell.staffId !== staffId) cell.spark = 1;
    cell.staffId = staffId || '';
    cell.settle = Math.max(cell.settle, 0.02);
  }

  /** Der eine laute Moment: bewiesene Optimalität. */
  crystallize() {
    this.crystallizedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.pulse = 1;
  }

  finish() {
    if (this.canvas?.dataset) this.canvas.dataset.renderMode = 'complete';
    for (const cell of this.cells) if (cell.staffId) cell.settle = 1;
    this.phase = 'complete';
    this.progress = 1;
  }

  stop() {
    this.running = false;
    if (this.canvas?.dataset) this.canvas.dataset.renderMode = 'stopped';
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.resizeObserver?.disconnect();
  }

  loop(now) {
    if (!this.running || !this.context) return;
    const delta = this.lastFrame ? Math.min(0.12, (now - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = now;
    this.step(delta);
    this.draw(now);
    this.frame = requestAnimationFrame(this.loop);
  }

  step(delta) {
    const speed = this.reducedMotion ? 6 : 2.4;
    for (const cell of this.cells) {
      if (cell.settle > 0 && cell.settle < 1) cell.settle = clamp(cell.settle + delta * speed, 0, 1);
      if (cell.spark > 0) cell.spark = Math.max(0, cell.spark - delta * 1.8);
    }
    if (this.pulse > 0) this.pulse = Math.max(0, this.pulse - delta * 0.55);
  }

  /** Die Farbe der laufenden Phase: Monatsfarbe, um den Phasenversatz gedreht. */
  phaseColor() {
    const shift = PHASE_SHIFT[this.phase] ?? 0;
    return { h: this.accent.h + shift, s: clamp(this.accent.s + 0.08, 0, 1), l: clamp(this.accent.l, 0.22, 0.72) };
  }

  activeColor(now) {
    if (this.severity && now < this.severityUntil) return this.severity;
    return this.phaseColor();
  }

  /**
   * Setzt Glow-Radius und -Farbe am Kontext. Einzige Stelle, an der `shadowBlur`
   * gesetzt wird — so bleibt die Regel „Glanz folgt der Farbe" durchsetzbar.
   */
  applyGlow(color, energy, scale = 18) {
    const profile = glowProfile(color, energy);
    this.context.shadowBlur = profile.radius * scale;
    this.context.shadowColor = hsl(color, profile.alpha);
    return profile;
  }

  clearGlow() {
    this.context.shadowBlur = 0;
    this.context.shadowColor = 'transparent';
  }

  /**
   * Zonenaufteilung. Die Rechtecke werden einmal je Bild berechnet und
   * überschneiden sich per Konstruktion nicht: Jede Ebene bekommt ihren
   * eigenen Streifen, niemand zeichnet in den Streifen eines anderen.
   */
  layout() {
    const padding = 12;
    const compact = this.width < 620;
    const ladderWidth = compact ? 0 : clamp(this.width * 0.26, 150, 250);
    const scissorsHeight = clamp(this.height * 0.2, 46, 96);
    const scaleHeight = clamp(this.height * 0.17, 40, 80);
    const fieldWidth = this.width - padding * 2 - (ladderWidth ? ladderWidth + padding : 0);
    const fieldHeight = this.height - padding * 3 - scissorsHeight - (compact ? scaleHeight + padding : 0);
    return {
      padding,
      compact,
      field: { x: padding, y: padding, w: Math.max(80, fieldWidth), h: Math.max(60, fieldHeight) },
      ladder: ladderWidth
        ? { x: padding * 2 + fieldWidth, y: padding, w: ladderWidth, h: Math.max(60, fieldHeight) }
        : null,
      scissors: { x: padding, y: padding * 2 + Math.max(60, fieldHeight), w: this.width - padding * 2, h: scissorsHeight },
      scale: compact
        ? { x: padding, y: padding * 3 + Math.max(60, fieldHeight) + scissorsHeight, w: this.width - padding * 2, h: scaleHeight }
        : { x: padding * 2 + fieldWidth, y: padding * 2 + Math.max(60, fieldHeight), w: ladderWidth, h: scissorsHeight }
    };
  }

  draw(now) {
    const ctx = this.context;
    if (!ctx) return;
    const zones = this.layout();
    const color = this.activeColor(now);
    ctx.clearRect(0, 0, this.width, this.height);

    this.drawField(zones.field, color, now);
    if (zones.ladder) this.drawLadder(zones.ladder, color);
    this.drawScissors(zones.scissors, color);
    this.drawScale(zones.scale, color);
    if (this.pulse > 0 && !this.reducedMotion) this.drawPulse(zones.field, now);
  }

  drawField(rect, color, now) {
    const ctx = this.context;
    const days = this.cells.length / 2;
    const columns = Math.max(1, days);
    const cellWidth = rect.w / columns;
    const cellHeight = rect.h / 2;
    const inset = Math.min(2.5, cellWidth * 0.12);

    for (const cell of this.cells) {
      const index = Math.floor(this.cells.indexOf(cell) / 2);
      const row = cell.role === 'bd' ? 0 : 1;
      const x = rect.x + index * cellWidth + inset;
      const y = rect.y + row * cellHeight + inset;
      const w = Math.max(1, cellWidth - inset * 2);
      const h = Math.max(1, cellHeight - inset * 2);

      // Grundfläche: Wochenenden dunkler getönt, damit das Raster lesbar bleibt.
      const weekendTone = [0, 6].includes(cell.weekday) ? 0.16 : 0.08;
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.3, 0, 0.94) }, weekendTone);
      this.roundRect(x, y, w, h, Math.min(3, w * 0.3));
      ctx.fill();

      if (cell.staffId) {
        const staffColor = { h: hueForStaff(cell.staffId), s: 0.55, l: cell.fixed ? 0.42 : 0.52 };
        const energy = cell.fixed ? 0.25 : 0.4 + cell.spark * 1.6;
        this.applyGlow(staffColor, energy, Math.min(14, cellWidth * 1.6));
        ctx.fillStyle = hsl(staffColor, cell.fixed ? 0.55 : 0.35 + 0.55 * cell.settle);
        const grow = cell.settle;
        const gh = h * (0.35 + 0.65 * grow);
        this.roundRect(x, y + (h - gh) / 2, w, gh, Math.min(3, w * 0.3));
        ctx.fill();
        this.clearGlow();
      } else if (!this.reducedMotion) {
        // Unentschieden: die Kandidatenmenge flirrt als Fächer feiner Marken.
        const marks = cell.candidates;
        for (let mark = 0; mark < marks; mark += 1) {
          const t = (now / 900 + mark / marks + index * 0.13) % 1;
          const my = y + h * (0.2 + 0.6 * t);
          ctx.fillStyle = hsl({ ...color, l: clamp(color.l + 0.2, 0, 0.9) }, 0.1 + 0.14 * Math.sin(t * Math.PI));
          ctx.fillRect(x + w * 0.25, my, Math.max(1, w * 0.5), 1);
        }
      }
    }

    // Rollenbeschriftung – klein, links, ohne das Raster zu überlagern.
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.1, 0.15, 0.6) }, 0.75);
    ctx.fillText('BD', rect.x + 2, rect.y + cellHeight * 0.5);
    ctx.fillText('HG', rect.x + 2, rect.y + cellHeight * 1.5);
  }

  drawLadder(rect, color) {
    const ctx = this.context;
    const rows = Math.max(1, this.stages.length || 1);
    const rowHeight = Math.min(24, rect.h / rows);
    ctx.font = '600 10px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    this.stages.forEach((stage, index) => {
      const y = rect.y + index * rowHeight;
      if (y + rowHeight > rect.y + rect.h) return;
      const done = stage.status === 'done';
      const broken = stage.status === 'broken';
      const tone = broken ? SEVERITY.red : done ? SEVERITY.proof : color;
      this.applyGlow(tone, done ? 0.8 : 0.35, 8);
      ctx.fillStyle = hsl(tone, broken ? 0.5 : done ? 0.42 : 0.2);
      this.roundRect(rect.x, y + 2, rect.w, rowHeight - 4, 4);
      ctx.fill();
      this.clearGlow();
      ctx.fillStyle = hsl({ ...tone, l: clamp(tone.l - 0.28, 0.1, 0.5) }, 0.95);
      const label = String(stage.label || stage.id).slice(0, 22);
      ctx.fillText(`${done ? '🔒 ' : broken ? '✕ ' : '▸ '}${label}`, rect.x + 6, y + rowHeight / 2);
      if (stage.value !== null && stage.value !== undefined) {
        const text = Number(stage.value).toFixed(Number.isInteger(stage.value) ? 0 : 2);
        ctx.textAlign = 'right';
        ctx.fillText(text, rect.x + rect.w - 6, y + rowHeight / 2);
        ctx.textAlign = 'left';
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
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.05, 0.2, 0.6) }, 0.6);
      ctx.textBaseline = 'middle';
      ctx.fillText('Schranken erscheinen, sobald die exakte Suche Zwischenlösungen meldet', rect.x + 8, rect.y + rect.h / 2);
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
    const sorted = [...this.loads].sort((left, right) => left.value - right.value);
    const max = Math.max(1, ...sorted.map(entry => entry.value));
    const barHeight = Math.min(9, (rect.h - 4) / sorted.length);
    sorted.forEach((entry, index) => {
      const y = rect.y + index * barHeight;
      if (y + barHeight > rect.y + rect.h) return;
      const staffColor = { h: hueForStaff(entry.staffId || String(index)), s: 0.5, l: 0.5 };
      const width = (rect.w - 4) * (entry.value / max);
      this.applyGlow(staffColor, 0.35, 6);
      ctx.fillStyle = hsl(staffColor, 0.6);
      this.roundRect(rect.x + 2, y + 1, Math.max(2, width), Math.max(2, barHeight - 2), 2);
      ctx.fill();
      this.clearGlow();
    });
    ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillStyle = hsl({ ...color, l: clamp(color.l - 0.1, 0.15, 0.6) }, 0.8);
    ctx.textBaseline = 'top';
    ctx.fillText('Last je Person', rect.x + 2, rect.y - 10);
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

  roundRect(x, y, w, h, r) {
    const ctx = this.context;
    const radius = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, radius);
      return;
    }
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }
}

export const CRYSTALLIZER_VERSION = '20260806.1';
