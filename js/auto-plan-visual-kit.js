/**
 * Gemeinsamer Unterbau der Laufansichten.
 *
 * Vier Ansichten zeigen denselben Lauf: „Orbit" (ältester Strang, eigener
 * Unterbau), „Kristallisation", „Weberei" und „Kaskade". Die drei jüngeren
 * teilen sich alles, was nicht ihre Aussage ist — Farbwelt, Glanzregel,
 * Auflösungsanpassung, Zeitschleife, Zonenschnitt, Textkürzung.
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
 * LESBARKEIT GEHT VOR VOLLSTÄNDIGKEIT
 *
 * Jede Liste hat eine Mindestzeilenhöhe. Passen nicht alle Einträge, wird ein
 * Ausschnitt gezeigt und die Zahl der übrigen ausgewiesen — eine Zeile, die man
 * nicht lesen kann, ist keine Information, sondern Rauschen.
 */

export const TAU = Math.PI * 2;

/** Semantische Farbwelt in HSL. Die Zahlen sind Ton, Sättigung, Helligkeit. */
export const SEVERITY = Object.freeze({
  red: { h: 6, s: 0.78, l: 0.55 },
  orange: { h: 28, s: 0.82, l: 0.55 },
  yellow: { h: 46, s: 0.85, l: 0.55 },
  green: { h: 148, s: 0.52, l: 0.44 },
  gray: { h: 220, s: 0.06, l: 0.55 },
  proof: { h: 168, s: 0.62, l: 0.5 }
});

/** Drehung der Monatsfarbe je Phase — der Lauf färbt sich, statt umzuspringen. */
export const PHASE_SHIFT = Object.freeze({
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

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function hsl({ h, s, l }, alpha = 1) {
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
export function hueForStaff(staffId) {
  const value = String(staffId ?? '');
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 360;
}

export function rgbToHsl(r, g, b) {
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

/** Monatsfarbe aus den CSS-Token — sie wechselt mit dem angezeigten Monat. */
export function readAccent(canvas) {
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

/**
 * Reduzierte Bewegung. Neben der Systemeinstellung zählt die Einstellung der
 * Anwendung selbst: `html[data-motion="reduced"]` setzt sie, und eine Ansicht,
 * die sich darüber hinwegsetzt, macht die Einstellung wertlos.
 */
export function prefersReducedMotion(forced = false) {
  if (forced) return true;
  if (globalThis.document?.documentElement?.dataset?.motion === 'reduced') return true;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Leinwand mit Lebenszyklus.
 *
 * Der Vertrag mit der übrigen Oberfläche und den Browsertests steht am Element:
 * `canvas.dataset.renderMode` ist `running`, `complete`, `stopped` oder
 * `unavailable`. Er stammt aus der Orbit-Ansicht und gilt für alle.
 *
 * Unterklassen bauen ihren Zustand im Konstruktor auf und rufen danach
 * `start()`. Sie liefern `step(delta)` und `draw(now)`; alles andere steht hier.
 */
export class CanvasStage {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.context = canvas?.getContext?.('2d') || null;
    this.reducedMotion = prefersReducedMotion(Boolean(options.reducedMotion));
    this.accent = readAccent(canvas);
    this.phase = 'analysis';
    this.progress = 0;
    this.message = '';
    this.running = true;
    this.severity = null;
    this.severityUntil = 0;
    this.lastFrame = 0;
    this.width = 640;
    this.height = 320;
    this.startedAt = nowMs();
    if (canvas?.dataset) canvas.dataset.renderMode = this.context ? 'running' : 'unavailable';
  }

  /** Startet Beobachtung und Zeitschleife. Ohne Kontext geschieht nichts. */
  start() {
    if (!this.context || this.frame) return;
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.resize())
      : null;
    this.resizeObserver?.observe(this.canvas);
    this.resize();
    this.loop = this.loop.bind(this);
    this.frame = requestAnimationFrame(this.loop);
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
   * Die allen Ansichten gemeinsamen Felder einer Fortschrittsmeldung. Alles,
   * was hier ankommt, ist ein Ereignis des Laufs — nichts wird interpoliert,
   * um Betrieb vorzutäuschen.
   */
  update(update = {}) {
    if (!update || typeof update !== 'object') return;
    if (update.phase) this.phase = update.phase;
    if (Number.isFinite(update.progress)) this.progress = clamp(update.progress, 0, 1);
    if (update.message) this.message = String(update.message);
    if (update.level && SEVERITY[update.level]) {
      this.severity = SEVERITY[update.level];
      this.severityUntil = nowMs() + 900;
    }
  }

  finish() {
    if (this.canvas?.dataset) this.canvas.dataset.renderMode = 'complete';
    this.phase = 'complete';
    this.progress = 1;
  }

  stop() {
    this.running = false;
    if (this.canvas?.dataset) this.canvas.dataset.renderMode = 'stopped';
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  loop(now) {
    if (!this.running || !this.context) return;
    const delta = this.lastFrame ? Math.min(0.12, (now - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = now;
    this.step(delta);
    this.draw(now);
    this.frame = requestAnimationFrame(this.loop);
  }

  step() {}

  draw() {}

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

  /** Führt eine Zeichnung streng innerhalb ihrer Zone aus. */
  withinZone(rect, draw) {
    const ctx = this.context;
    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip();
    draw();
    ctx.restore();
  }

  /** Kürzt Text auf die verfügbare Breite und setzt ein Auslassungszeichen. */
  fitText(text, maxWidth) {
    const ctx = this.context;
    const value = String(text ?? '');
    if (maxWidth <= 0) return '';
    if (ctx.measureText(value).width <= maxWidth) return value;
    let low = 0;
    let high = value.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (ctx.measureText(`${value.slice(0, middle)}…`).width <= maxWidth) low = middle;
      else high = middle - 1;
    }
    return low > 0 ? `${value.slice(0, low)}…` : '';
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

export const VISUAL_KIT_VERSION = '20260806.1';
