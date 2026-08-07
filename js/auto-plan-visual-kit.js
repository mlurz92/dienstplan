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
 * DIE ANIMATION KONKURRIERT NIE MIT DEM SOLVER
 *
 * Drei Bremsen, alle hier und damit für jede Ansicht gleich:
 *
 *   1. Takt      Gezeichnet wird höchstens rund dreißig Mal je Sekunde, nicht
 *                so oft wie die Anzeige kann. Der Unterschied ist unsichtbar,
 *                die Ersparnis ist die Hälfte.
 *   2. Budget    Die gemessene Bilddauer entscheidet über Detailgrad und
 *                Partikelzahl (`auto-plan-animation-policy.js`, dieselbe reine
 *                Funktion, die Orbit seit v7.5 verwendet). Wird es eng, zeigt
 *                die Ansicht weniger — nie etwas anderes.
 *   3. Sichtbar  Ist das Fenster verdeckt oder die Leinwand aus dem Bild
 *                gescrollt, ruht die Schleife vollständig. Eine Animation, die
 *                niemand sieht, ist reine Wärme.
 *
 * Der Detailgrad steht als `canvas.dataset.renderDetail` am Element. Er ist
 * bewusst **nicht** `renderMode`: Dort steht bei diesen Ansichten der
 * Lebenszyklus, und Orbit legt seine Güte dort ab — zwei Bedeutungen auf einem
 * Attribut sind schon eine zu viel.
 *
 * LESBARKEIT GEHT VOR VOLLSTÄNDIGKEIT
 *
 * Jede Liste hat eine Mindestzeilenhöhe. Passen nicht alle Einträge, wird ein
 * Ausschnitt gezeigt und die Zahl der übrigen ausgewiesen — eine Zeile, die man
 * nicht lesen kann, ist keine Information, sondern Rauschen.
 */

import { renderPolicyFor } from './auto-plan-animation-policy.js?v=20260806.1';
import { GlowAtlas, ParticlePool, RipplePool } from './auto-plan-visual-effects.js?v=20260806.1';

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
    this.lastPaint = 0;
    this.width = 640;
    this.height = 320;
    this.startedAt = nowMs();

    // Budget und Sichtbarkeit.
    this.averageFrameMs = 0;
    this.documentVisible = globalThis.document?.visibilityState !== 'hidden';
    this.intersecting = true;
    this.finished = false;
    this.policy = renderPolicyFor({ reduced: this.reducedMotion });

    // Effektvorräte. Sie kosten im Ruhezustand nichts und ersparen im Betrieb
    // jedes `shadowBlur` und jede Neuanlage im Bild.
    this.glow = new GlowAtlas();
    this.particles = new ParticlePool(options.particleCapacity ?? 220);
    this.ripples = new RipplePool(options.rippleCapacity ?? 24);
    this.staticLayers = new Map();

    if (canvas?.dataset) canvas.dataset.renderMode = this.context ? 'running' : 'unavailable';
  }

  /** Startet Beobachtung und Zeitschleife. Ohne Kontext geschieht nichts. */
  start() {
    if (!this.context || this.frame) return;
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.resize())
      : null;
    this.resizeObserver?.observe(this.canvas);

    // Eine verdeckte Leinwand zeichnet nicht. Beide Wege dorthin — verstecktes
    // Fenster und aus dem Bild gescrollte Fläche — werden beobachtet und beim
    // Anhalten wieder abgemeldet; ein hängender Beobachter hielte die Ansicht
    // nach dem Schließen des Dialogs am Leben.
    this.onVisibility = () => {
      this.documentVisible = globalThis.document?.visibilityState !== 'hidden';
      this.wake();
    };
    globalThis.document?.addEventListener?.('visibilitychange', this.onVisibility);
    this.intersectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        this.intersecting = entries.some(entry => entry.isIntersecting);
        this.wake();
      })
      : null;
    this.intersectionObserver?.observe(this.canvas);

    this.resize();
    this.loop = this.loop.bind(this);
    this.frame = requestAnimationFrame(this.loop);
  }

  /** Nach einer Pause wieder anlaufen, ohne die Schleife doppelt zu starten. */
  wake() {
    if (!this.running || !this.context || this.frame) return;
    this.lastFrame = 0;
    this.frame = requestAnimationFrame(this.loop);
  }

  resize() {
    if (!this.canvas || !this.context) return;
    // Die Standebene gilt für genau eine Größe; nach einer Änderung ist sie
    // wertlos und würde verzerrt aufgetragen.
    this.staticLayers.clear();
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
    // In den ruhenden Betriebsarten — reduzierte Bewegung, verdeckte Leinwand,
    // fertiger Lauf — läuft keine Schleife. Eine Meldung ändert dort den
    // Zustand, ohne dass jemand ihn zeichnete; sie muss also selbst wecken.
    this.wake();
  }

  finish() {
    if (this.canvas?.dataset) this.canvas.dataset.renderMode = 'complete';
    this.phase = 'complete';
    this.progress = 1;
    this.finished = true;
    this.wake();
  }

  stop() {
    this.running = false;
    if (this.canvas?.dataset) this.canvas.dataset.renderMode = 'stopped';
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    if (this.onVisibility) globalThis.document?.removeEventListener?.('visibilitychange', this.onVisibility);
    this.onVisibility = null;
    this.particles.clear();
    this.ripples.clear();
    this.staticLayers.clear();
  }

  /**
   * Die Schleife.
   *
   * Sie tut drei Dinge in dieser Reihenfolge: Budget bestimmen, Zustand
   * fortschreiben, zeichnen — und das letzte nur, wenn der Takt es erlaubt. Der
   * Zustand läuft dabei **immer** weiter: Eine Bewegung, die nur bei jedem
   * zweiten Bild fortschreitet, ruckelt; eine, die weiterläuft und seltener
   * gezeigt wird, ist bloß weicher abgetastet.
   */
  loop(now) {
    if (!this.running || !this.context) return;
    const delta = this.lastFrame ? Math.min(0.12, (now - this.lastFrame) / 1000) : 0.016;
    this.lastFrame = now;

    this.policy = renderPolicyFor({
      active: this.running,
      visible: this.documentVisible && this.intersecting,
      reduced: this.reducedMotion,
      finished: this.finished,
      averageFrameMs: this.averageFrameMs
    });
    if (this.canvas?.dataset) this.canvas.dataset.renderDetail = this.policy.mode;

    this.step(delta);
    this.particles.step(delta);
    this.ripples.step(delta);

    const interval = this.policy.frameIntervalMs;
    const due = !interval || !this.lastPaint || now - this.lastPaint >= interval;
    if (due) {
      const startedAt = nowMs();
      this.draw(now);
      this.lastPaint = now;
      // Gleitender Mittelwert: Ein einzelnes teures Bild — etwa während das
      // Betriebssystem etwas anderes tut — soll die Darstellung nicht dauerhaft
      // herabstufen, eine anhaltende Überlastung aber sehr wohl.
      const cost = nowMs() - startedAt;
      this.averageFrameMs = this.averageFrameMs ? this.averageFrameMs * 0.8 + cost * 0.2 : cost;
    }

    // Eine verdeckte Leinwand ruht immer — auch mitten in einem Ausklang. Ein
    // Ausklang, den niemand sieht, ist reine Wärme; er wird beim Sichtbarwerden
    // fortgesetzt, nicht verworfen.
    if (!this.documentVisible || !this.intersecting) {
      this.frame = null;
      return;
    }
    // Sonst ruhen nur Ansichten, die wirklich nichts mehr zu zeigen haben.
    if (!this.policy.continuous && !this.isAnimating()) {
      this.frame = null;
      return;
    }
    this.frame = requestAnimationFrame(this.loop);
  }

  /**
   * Zwischengespeicherte Standebene.
   *
   * Raster, Beschriftungen und Wannen ändern sich nur bei Größenänderung, malen
   * aber den größten Teil der Fläche. Einmal in eine eigene Leinwand gezeichnet
   * und danach kopiert, kostet das je Bild eine einzige Kopie statt hunderter
   * Pfade. `invalidateStatic` verwirft sie, wenn sich der Inhalt doch ändert.
   */
  staticLayer(key, draw) {
    const known = this.staticLayers.get(key);
    if (known) return known;
    // Jede Ebene ist eine vollständige Leinwand. Zwei genügen — eine je Zone,
    // die eine hat —, und mehr als vier wären ein Speicherleck mit Aussicht:
    // Ein Schlüssel, der sich je Phase ändert, legte sonst ein Dutzend an.
    if (this.staticLayers.size >= 4) this.staticLayers.clear();
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const canvas = typeof OffscreenCanvas === 'function'
      ? new OffscreenCanvas(Math.max(1, Math.floor(this.width * ratio)), Math.max(1, Math.floor(this.height * ratio)))
      : globalThis.document?.createElement?.('canvas');
    if (!canvas) return null;
    if (!(typeof OffscreenCanvas === 'function')) {
      canvas.width = Math.max(1, Math.floor(this.width * ratio));
      canvas.height = Math.max(1, Math.floor(this.height * ratio));
    }
    const ctx = canvas.getContext?.('2d');
    if (!ctx?.setTransform) return null;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    draw(ctx);
    this.staticLayers.set(key, canvas);
    return canvas;
  }

  invalidateStatic(key) {
    if (key === undefined) this.staticLayers.clear();
    else this.staticLayers.delete(key);
  }

  /** Detailgrad des laufenden Budgets: eins ist voll, null ist aus. */
  get detail() {
    return this.policy?.detail ?? 1;
  }

  /** Wie viele Partikel dieses Bild zeigen darf. */
  get sparkLimit() {
    return this.policy?.sparkLimit ?? 0;
  }

  /**
   * Ausbrüche je Bild — die Bremse gegen den Schwarm.
   *
   * Eine neue Zwischenlösung ersetzt im Zweifel *jede* Zuordnung des Monats.
   * Ohne Grenze zündeten dann zweiundsechzig Druckwellen gleichzeitig: teuer
   * und, schlimmer, nichtssagend — ein Blitz überall ist kein Hinweis auf
   * irgendetwas. Gezeigt werden die ersten, die restlichen Felder rasten still
   * ein. Die Aussage bleibt richtig, die Kosten bleiben beschränkt.
   */
  burstBudget() {
    return Math.max(1, Math.round(6 * this.detail));
  }

  step() {}

  draw() {}

  /**
   * Läuft gerade noch etwas aus?
   *
   * `finish()` versetzt die Ansicht in eine ruhende Betriebsart — der Lauf ist
   * vorbei, das Bild soll stehen. Genau in diesem Moment beginnen aber die
   * Ausklänge: die Abschlusskante der Weberei, der Kristallisationspuls, der
   * Beweisring der Kaskade. Der Unterbau kennt sie nicht; er fragt deshalb.
   * Unterklassen mit eigenem Ausklang erweitern diese Antwort — wer es
   * vergisst, dessen Animation steht nach einem Bild still.
   */
  isAnimating() {
    return Boolean(this.particles.live || this.ripples.live);
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
   * Schein um eine Stelle — die billige Form.
   *
   * Bis v10.6 setzte diese Methode `shadowBlur`, die teuerste Einstellung des
   * 2D-Kontexts, und zwar je Element und je Bild. Sie trägt jetzt ein
   * vorgerendertes Plättchen additiv auf: gleiche Optik, ein Kopiervorgang.
   * Die Regel „Glanz folgt der Farbe" bleibt unangetastet — Radius und Deckkraft
   * kommen weiterhin aus `glowProfile`, nur die Ausführung ist eine andere.
   */
  glowAt(color, x, y, energy = 1, scale = 18) {
    const profile = glowProfile(color, energy);
    const radius = profile.radius * scale * 0.6;
    this.glow.paint(this.context, color.h, x, y, radius, profile.alpha * this.detail);
    return profile;
  }

  /**
   * Schein entlang einer Strecke.
   *
   * Ein einzelnes Plättchen auf einem langen Balken sieht aus wie ein
   * Leuchtfleck in dessen Mitte, nicht wie ein glühender Balken. Für gestreckte
   * Formen werden deshalb mehrere Plättchen entlang der Achse gesetzt — zwei
   * bis vier genügen, weil sie sich additiv überlagern und zu einem Band
   * verschmelzen. Ihre Zahl folgt der Länge und dem Budget.
   */
  glowAlong(color, x0, y0, x1, y1, energy = 1, scale = 18) {
    const profile = glowProfile(color, energy);
    const radius = profile.radius * scale * 0.6;
    const length = Math.hypot(x1 - x0, y1 - y0);
    const steps = clamp(Math.round(length / Math.max(2, radius)), 1, Math.max(1, Math.round(4 * this.detail)));
    // Die Deckkraft wird auf die Stützstellen verteilt: Vier Plättchen mit
    // voller Stärke wären viermal so hell wie eines.
    const strength = (profile.alpha * this.detail) / Math.sqrt(steps);
    for (let step = 0; step < steps; step += 1) {
      const t = steps === 1 ? 0.5 : step / (steps - 1);
      this.glow.paint(this.context, color.h, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, radius, strength);
    }
    return profile;
  }

  /**
   * Der alte Weg über `shadowBlur`. Er bleibt für die wenigen Stellen, an denen
   * eine *Form* leuchten muss und kein Punkt — dort ist ein Plättchen falsch.
   * Bei knappem Budget wird er stillschweigend übersprungen.
   */
  applyGlow(color, energy, scale = 18) {
    const profile = glowProfile(color, energy);
    if (this.detail < 0.6) return profile;
    this.context.shadowBlur = profile.radius * scale * this.detail;
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
