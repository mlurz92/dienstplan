import { renderPolicyFor } from './auto-plan-animation-policy.js?v=20260803.6';

/**
 * Lebende Visualisierung des laufenden Auto-Plans.
 *
 * Die Darstellung ist kein Dekor, sondern eine Ablesung: Was auf der Fläche
 * passiert, entspricht dem, was der Algorithmus gerade tut.
 *
 * - Jedes Dienstfeld des Monats ist ein Knoten. BD liegt auf dem inneren, HG auf
 *   dem äußeren Ring. Bereits gesetzte Fixpunkte leuchten von Beginn an ruhig
 *   und gedämpft, offene Felder dunkel.
 * - Wird ein Feld entschieden, zündet sein Knoten, ein Komet fliegt aus dem Kern
 *   dorthin und eine Druckwelle läuft über den Ring.
 * - Zwischen Knoten laufen Kopplungsfäden mit wandernden Signalen; ihre Dichte
 *   und Geschwindigkeit folgen der tatsächlichen Suchaktivität.
 * - Der Kern pulsiert im Takt der Bewertungen pro Sekunde; die Farbwelt wechselt
 *   mit der Phase, von Analyse über Suche und Reparatur bis zur Zertifizierung.
 * - Am unteren Rand zeichnet eine Verlaufslinie die Qualität mit: Jede
 *   Verbesserung senkt die Kurve sichtbar ab.
 *
 * Die Schleife ist rahmenratenunabhängig und respektiert die
 * Systemeinstellung für reduzierte Bewegung.
 */

/**
 * Farbwelt der Darstellung.
 *
 * Die Fläche ist hell und trägt die Monatsfarbe der Anwendung. Die Phasen
 * verschieben den Akzent nur, statt die gesamte Darstellung umzufärben – auf
 * einer weißen Karte in einer markengebundenen Anwendung wäre ein bunter
 * Phasenwechsel unruhig. Die Monatsfarbe wird zur Laufzeit aus den CSS-Token
 * gelesen; sie ändert sich mit dem angezeigten Monat.
 */
const PHASE_TINT = Object.freeze({
  analysis: [0, 0, 0],
  search: [-14, -6, 26],
  propagate: [-26, 16, 6],
  repair: [34, -18, 40],
  polish: [46, 4, -34],
  perfect: [58, -18, 24],
  certify: [-42, 26, -22],
  audit: [-42, 26, -22],
  complete: [-42, 26, -22],
  blocked: [78, -46, -34]
});

const DEFAULT_ACCENT = [79, 143, 189];

function readAccent() {
  if (typeof getComputedStyle !== 'function' || typeof document === 'undefined') return [...DEFAULT_ACCENT];
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--month-accent').trim();
  const hex = raw.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const value = parseInt(hex[1], 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  }
  const rgb = raw.match(/(-?[\d.]+)[,\s]+(-?[\d.]+)[,\s]+(-?[\d.]+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [...DEFAULT_ACCENT];
}

const clampChannel = value => Math.max(0, Math.min(255, value));

function phaseColor(accent, phase) {
  const tint = PHASE_TINT[phase] || PHASE_TINT.analysis;
  return accent.map((channel, index) => clampChannel(channel + tint[index]));
}

const TAU = Math.PI * 2;
const prefersReducedMotion = () => globalThis.document?.documentElement?.dataset?.motion === 'reduced'
  || (typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches);

export class AutoPlanVisualizer {
  constructor(canvas, monthData) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d', { alpha: true });
    this.reduced = prefersReducedMotion();
    this.active = true;
    this.finished = false;
    this.documentVisible = globalThis.document?.visibilityState !== 'hidden';
    this.intersecting = true;
    this.dirty = true;
    this.averageFrameMs = 0;
    this.paintCount = 0;

    this.phase = 'analysis';
    this.progress = 0;
    this.displayProgress = 0;
    this.explored = 0;
    this.deadEnds = 0;
    this.improvements = 0;
    this.moves = 0;
    this.activity = 0;
    this.energy = 0;
    this.lastMoves = 0;
    this.lastActivityAt = 0;

    this.accent = readAccent();
    this.color = phaseColor(this.accent, 'analysis');
    this.targetColor = [...this.color];

    this.nodes = [];
    this.slotIndex = new Map();
    this.comets = [];
    this.waves = [];
    this.sparks = [];
    this.history = [];

    this.buildNodes(monthData);
    this.buildLinks();

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    this.onVisibilityChange = this.onVisibilityChange.bind(this);
    this.onMotionChange = this.onMotionChange.bind(this);
    this.lastFrame = 0;
    this.lastPaint = 0;
    this.frame = null;
    if (!this.context) {
      // Canvas ist eine progressive Zusatzdarstellung. Verweigert der Browser
      // den 2D-Kontext (Speicherdruck, Richtlinie oder Testumgebung), bleibt
      // der Solver vollständig bedienbar und die Visualisierung wird inert.
      this.active = false;
      this.canvas.dataset.renderMode = 'unavailable';
      this.canvas.dataset.frameInterval = 'event';
      this.observer = null;
      this.intersectionObserver = null;
      this.motionQuery = null;
      return;
    }
    this.observer = typeof ResizeObserver === 'function' ? new ResizeObserver(this.resize) : null;
    this.observer?.observe(canvas);
    this.intersectionObserver = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(entries => {
        const entry = entries[entries.length - 1];
        this.intersecting = Boolean(entry?.isIntersecting);
        this.syncRenderState();
        if (this.intersecting) this.requestRender();
      }, { threshold: .01 })
      : null;
    this.intersectionObserver?.observe(canvas);
    globalThis.document?.addEventListener?.('visibilitychange', this.onVisibilityChange);
    globalThis.window?.addEventListener?.('appsettingschange', this.onMotionChange);
    this.motionQuery = typeof globalThis.matchMedia === 'function'
      ? globalThis.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    this.motionQuery?.addEventListener?.('change', this.onMotionChange);
    this.resize();
    this.syncRenderState();
    this.requestRender();
  }

  renderPolicy() {
    return renderPolicyFor({
      active: this.active,
      visible: this.documentVisible && this.intersecting,
      reduced: this.reduced,
      finished: this.finished,
      averageFrameMs: this.averageFrameMs
    });
  }

  syncRenderState() {
    const policy = this.renderPolicy();
    this.canvas.dataset.renderMode = policy.mode;
    this.canvas.dataset.frameInterval = policy.frameIntervalMs === null ? 'event' : String(policy.frameIntervalMs);
    this.policy = policy;
    return policy;
  }

  requestRender() {
    if (!this.active || this.frame || !this.documentVisible || !this.intersecting) return;
    const policy = this.syncRenderState();
    if (!policy.continuous && !this.dirty) return;
    this.frame = requestAnimationFrame(this.draw);
  }

  onVisibilityChange() {
    this.documentVisible = globalThis.document?.visibilityState !== 'hidden';
    this.syncRenderState();
    if (this.documentVisible) {
      this.dirty = true;
      this.requestRender();
    } else if (this.frame) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
  }

  onMotionChange() {
    this.reduced = prefersReducedMotion();
    this.dirty = true;
    this.syncRenderState();
    this.requestRender();
  }

  buildNodes(monthData) {
    const dates = Object.keys(monthData?.days || {}).sort();
    const count = Math.max(1, dates.length);
    dates.forEach((dateIso, day) => {
      for (const role of ['bd', 'hg']) {
        const fixed = Boolean(monthData.days[dateIso]?.[role]);
        this.slotIndex.set(`${dateIso}|${role}`, this.nodes.length);
        this.nodes.push({
          dateIso,
          role,
          angle: (day / count) * TAU - Math.PI / 2,
          ring: role === 'bd' ? .58 : .82,
          fixed,
          settled: fixed,
          pulse: fixed ? .25 : 0,
          glow: fixed ? .3 : 0,
          x: 0,
          y: 0
        });
      }
    });
  }

  /**
   * Kopplungsfäden. Verbunden werden benachbarte Tage sowie BD und HG desselben
   * Tages – genau die Beziehungen, aus denen die fachlichen Kopplungsregeln
   * entstehen.
   */
  buildLinks() {
    this.links = [];
    for (let index = 0; index < this.nodes.length; index += 1) {
      const node = this.nodes[index];
      if (node.role === 'bd') {
        const partner = index + 1;
        if (partner < this.nodes.length) this.links.push({ from: index, to: partner, offset: Math.random() });
      }
      const nextDay = index + 2;
      if (nextDay < this.nodes.length) this.links.push({ from: index, to: nextDay, offset: Math.random() });
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(2, (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1) || 1);
    this.canvas.width = Math.max(1, Math.round(rect.width * ratio));
    this.canvas.height = Math.max(1, Math.round(rect.height * ratio));
    this.context.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
    this.dirty = true;
    this.requestRender();
  }

  /** Aufnahme eines Fortschrittsereignisses aus dem Algorithmus. */
  update(update) {
    if (!this.active) return;
    this.progress = Math.max(this.progress, Math.min(1, Number(update.progress) || 0));
    if (update.phase && PHASE_TINT[update.phase]) {
      this.phase = update.phase;
      this.targetColor = phaseColor(this.accent, update.phase);
    }
    this.explored = Math.max(this.explored, Number(update.exploredNodes ?? update.evaluations) || 0);
    this.deadEnds = Math.max(this.deadEnds, Number(update.deadEnds ?? update.rejected) || 0);
    this.moves = Math.max(this.moves, Number(update.moves) || 0);

    const improvements = Number(update.improvements) || 0;
    const gained = improvements > this.improvements;
    this.improvements = Math.max(this.improvements, improvements);

    const cells = update.changedCells?.length
      ? update.changedCells
      : update.dateIso ? [{ dateIso: update.dateIso, role: update.role }] : [];
    for (const cell of cells) this.ignite(cell, gained);

    if (gained) {
      this.energy = Math.min(1, this.energy + .55);
      this.waves.push({ radius: 0, life: 1, strong: true });
    }
    if (cells.length) this.energy = Math.min(1, this.energy + .16);

    const quality = Number(update.yellow);
    if (Number.isFinite(quality)) {
      const last = this.history[this.history.length - 1];
      if (last === undefined || last !== quality) this.history.push(quality);
      if (this.history.length > 160) this.history.shift();
    }
    this.dirty = true;
    this.requestRender();
  }

  /** Einen Knoten zünden und einen Kometen aus dem Kern dorthin schicken. */
  ignite(cell, strong) {
    const index = this.slotIndex.get(`${cell.dateIso}|${cell.role}`);
    if (!Number.isInteger(index)) return;
    const node = this.nodes[index];
    node.pulse = 1;
    node.glow = 1;
    node.settled = true;
    if (this.reduced) return;
    this.comets.push({ target: index, travel: 0, speed: strong ? 2.4 : 1.7, strong: Boolean(strong) });
    if (this.comets.length > 40) this.comets.shift();
  }

  /** Abschluss: ein letzter, ruhiger Impuls über alle Knoten. */
  finish() {
    if (!this.active) return;
    this.finished = true;
    this.progress = 1;
    this.displayProgress = 1;
    this.energy = 1;
    this.waves.push({ radius: 0, life: 1, strong: true });
    for (const node of this.nodes) node.glow = Math.max(node.glow, .5);
    this.dirty = true;
    this.syncRenderState();
    this.requestRender();
  }

  rgba(alpha, shift = 0) {
    const [r, g, b] = this.color;
    return `rgba(${Math.round(r + shift)},${Math.round(g + shift)},${Math.round(b + shift)},${alpha})`;
  }

  draw(time) {
    this.frame = null;
    if (!this.active) return;
    const policy = this.syncRenderState();
    if (!this.documentVisible || !this.intersecting) return;
    if (policy.continuous && this.lastPaint && time - this.lastPaint < policy.frameIntervalMs) {
      this.requestRender();
      return;
    }

    const delta = this.lastPaint ? Math.min(.08, (time - this.lastPaint) / 1000) : .016;
    this.lastFrame = time;
    this.lastPaint = time;
    const seconds = time / 1000;
    const renderStarted = globalThis.performance?.now?.() ?? Date.now();

    for (let channel = 0; channel < 3; channel += 1) {
      this.color[channel] += (this.targetColor[channel] - this.color[channel]) * Math.min(1, delta * 3);
    }
    this.displayProgress += (this.progress - this.displayProgress) * Math.min(1, delta * 2.6);
    this.energy = Math.max(0, this.energy - delta * .55);
    this.activity += (Math.min(1, this.energy + (this.finished ? .25 : .12)) - this.activity) * Math.min(1, delta * 4);

    const { width, height } = this;
    if (!width || !height) {
      this.requestRender();
      return;
    }
    const centerX = width / 2;
    const centerY = height / 2 - height * .04;
    const size = Math.min(width, height) * .40;
    const context = this.context;
    context.clearRect(0, 0, width, height);

    this.paintAtmosphere(context, centerX, centerY, size, seconds);
    this.paintRings(context, centerX, centerY, size, seconds);
    this.positionNodes(centerX, centerY, size, seconds, delta);
    this.paintLinks(context, seconds);
    this.paintComets(context, centerX, centerY, delta);
    this.paintNodes(context, delta);
    this.paintWaves(context, centerX, centerY, size, delta);
    this.paintSparks(context, delta);
    this.paintCore(context, centerX, centerY, size, seconds);
    this.paintHistory(context, width, height);
    const renderDuration = Math.max(0, (globalThis.performance?.now?.() ?? Date.now()) - renderStarted);
    this.averageFrameMs = this.paintCount
      ? this.averageFrameMs * .88 + renderDuration * .12
      : renderDuration;
    this.paintCount += 1;
    this.dirty = false;
    this.syncRenderState();
    this.requestRender();
  }

  paintAtmosphere(context, centerX, centerY, size, seconds) {
    const glow = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, size * 1.9);
    glow.addColorStop(0, this.rgba(.16 + this.activity * .14));
    glow.addColorStop(.5, this.rgba(.05 + this.activity * .04));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(centerX, centerY, size * 1.9, 0, TAU);
    context.fill();

    if (this.reduced) return;
    // Langsam wandernde Schleier geben der Fläche Tiefe, ohne vom Geschehen
    // abzulenken.
    const layers = Math.max(1, Math.ceil(3 * (this.policy?.detail ?? 1)));
    for (let layer = 0; layer < layers; layer += 1) {
      const angle = seconds * (.06 + layer * .035) + layer * 2.1;
      const radius = size * (1.05 + layer * .22);
      const x = centerX + Math.cos(angle) * size * .3;
      const y = centerY + Math.sin(angle * .8) * size * .22;
      const veil = context.createRadialGradient(x, y, 0, x, y, radius);
      veil.addColorStop(0, this.rgba(.05 + this.activity * .04, layer * 14));
      veil.addColorStop(1, 'rgba(0,0,0,0)');
      context.fillStyle = veil;
      context.beginPath();
      context.arc(x, y, radius, 0, TAU);
      context.fill();
    }
  }

  paintRings(context, centerX, centerY, size, seconds) {
    context.save();
    const ringCount = (this.policy?.detail ?? 1) < .6 ? 3 : 5;
    for (let ring = 0; ring < ringCount; ring += 1) {
      const radius = size * (.28 + ring * .16);
      const spin = this.reduced ? 0 : seconds * (ring % 2 ? .05 : -.038) * (1 + this.activity);
      context.save();
      context.translate(centerX, centerY);
      context.rotate(spin);
      context.strokeStyle = this.rgba(.09 + ring * .022 + this.activity * .04);
      context.lineWidth = ring === 3 ? 1.4 : .8;
      context.setLineDash(ring === 3 ? [6, 11] : ring === 1 ? [2, 7] : []);
      context.beginPath();
      context.arc(0, 0, radius, 0, TAU);
      context.stroke();
      context.restore();
    }
    context.restore();
    context.setLineDash([]);

    // Fortschrittsbogen: der sichtbare Anteil des Rings entspricht dem Anteil
    // der bereits abgeschlossenen Arbeit.
    context.save();
    context.translate(centerX, centerY);
    context.rotate(-Math.PI / 2);
    context.lineCap = 'round';
    context.strokeStyle = this.rgba(.14);
    context.lineWidth = 3;
    context.beginPath();
    context.arc(0, 0, size * 1.02, 0, TAU);
    context.stroke();
    const gradient = context.createLinearGradient(-size, -size, size, size);
    gradient.addColorStop(0, this.rgba(.95));
    gradient.addColorStop(1, this.rgba(.45, 40));
    context.strokeStyle = gradient;
    context.lineWidth = 3.4;
    context.shadowBlur = 18;
    context.shadowColor = this.rgba(.7);
    context.beginPath();
    context.arc(0, 0, size * 1.02, 0, Math.max(.001, this.displayProgress * TAU));
    context.stroke();
    context.restore();
  }

  positionNodes(centerX, centerY, size, seconds, delta) {
    const breathe = this.reduced ? 0 : 1;
    this.nodes.forEach((node, index) => {
      const drift = this.reduced ? 0 : seconds * (node.role === 'bd' ? -.035 : .028) * (1 + this.activity * .8);
      const angle = node.angle + drift;
      const wobble = breathe * Math.sin(seconds * 1.1 + index * .41) * .02;
      const radius = size * (node.ring + wobble);
      node.x = centerX + Math.cos(angle) * radius;
      node.y = centerY + Math.sin(angle) * radius;
      node.pulse = Math.max(0, node.pulse - delta * 1.6);
      node.glow = Math.max(node.fixed ? .22 : 0, node.glow - delta * .5);
    });
  }

  paintLinks(context, seconds) {
    const visible = Math.round(Math.max(this.displayProgress, .12) * this.links.length * (this.policy?.detail ?? 1));
    context.lineWidth = .7;
    for (let index = 0; index < visible; index += 1) {
      const link = this.links[index];
      const from = this.nodes[link.from];
      const to = this.nodes[link.to];
      if (!from || !to) continue;
      const lit = (from.settled ? .5 : .12) + (to.settled ? .5 : .12);
      const gradient = context.createLinearGradient(from.x, from.y, to.x, to.y);
      gradient.addColorStop(0, this.rgba(.02));
      gradient.addColorStop(.5, this.rgba(.05 + lit * .12 + this.activity * .06));
      gradient.addColorStop(1, this.rgba(.02));
      context.strokeStyle = gradient;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();

      if (this.reduced || index % 3) continue;
      const travel = (seconds * (.22 + this.activity * .5) + link.offset) % 1;
      context.fillStyle = this.rgba(.55 + this.activity * .35);
      context.beginPath();
      context.arc(from.x + (to.x - from.x) * travel, from.y + (to.y - from.y) * travel, 1.4, 0, TAU);
      context.fill();
    }
  }

  paintComets(context, centerX, centerY, delta) {
    for (let index = this.comets.length - 1; index >= 0; index -= 1) {
      const comet = this.comets[index];
      comet.travel += delta * comet.speed;
      if (comet.travel >= 1) {
        const node = this.nodes[comet.target];
        if (node) this.burst(node.x, node.y, comet.strong ? 12 : 6);
        this.comets.splice(index, 1);
        continue;
      }
      const node = this.nodes[comet.target];
      if (!node) {
        this.comets.splice(index, 1);
        continue;
      }
      const eased = comet.travel * comet.travel * (3 - 2 * comet.travel);
      const x = centerX + (node.x - centerX) * eased;
      const y = centerY + (node.y - centerY) * eased;
      const tail = Math.max(0, eased - .16);
      const tailX = centerX + (node.x - centerX) * tail;
      const tailY = centerY + (node.y - centerY) * tail;
      const gradient = context.createLinearGradient(tailX, tailY, x, y);
      gradient.addColorStop(0, this.rgba(0));
      gradient.addColorStop(1, this.rgba(comet.strong ? .95 : .7));
      context.strokeStyle = gradient;
      context.lineWidth = comet.strong ? 2.4 : 1.5;
      context.beginPath();
      context.moveTo(tailX, tailY);
      context.lineTo(x, y);
      context.stroke();
      context.fillStyle = this.rgba(1, 50);
      context.beginPath();
      context.arc(x, y, comet.strong ? 2.8 : 1.9, 0, TAU);
      context.fill();
    }
  }

  burst(x, y, count) {
    if (this.reduced) return;
    const limit = this.policy?.sparkLimit ?? 160;
    const available = Math.max(0, limit - this.sparks.length);
    for (let index = 0; index < Math.min(count, available); index += 1) {
      const angle = (index / count) * TAU + Math.random() * .4;
      const speed = 22 + Math.random() * 46;
      this.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1 });
    }
    if (this.sparks.length > limit) this.sparks.splice(0, this.sparks.length - limit);
  }

  paintSparks(context, delta) {
    for (let index = this.sparks.length - 1; index >= 0; index -= 1) {
      const spark = this.sparks[index];
      spark.life -= delta * 1.5;
      if (spark.life <= 0) {
        this.sparks.splice(index, 1);
        continue;
      }
      spark.x += spark.vx * delta;
      spark.y += spark.vy * delta;
      spark.vx *= .94;
      spark.vy *= .94;
      context.fillStyle = this.rgba(spark.life * .8, 40);
      context.beginPath();
      context.arc(spark.x, spark.y, spark.life * 1.9, 0, TAU);
      context.fill();
    }
  }

  paintNodes(context, delta) {
    this.nodes.forEach(node => {
      const done = node.settled;
      const radius = done ? 2.4 + node.pulse * 4.8 : 1.5;
      context.fillStyle = node.fixed
        ? `rgba(122,136,152,${.42 + node.glow * .3})`
        : done ? this.rgba(.72 + node.glow * .28) : 'rgba(150,163,178,.26)';
      context.beginPath();
      context.arc(node.x, node.y, radius, 0, TAU);
      context.fill();

      if (node.pulse > .04) {
        context.strokeStyle = this.rgba(node.pulse * .6);
        context.lineWidth = 1.1;
        context.beginPath();
        context.arc(node.x, node.y, 5 + (1 - node.pulse) * 22, 0, TAU);
        context.stroke();
      }
    });
    void delta;
  }

  paintWaves(context, centerX, centerY, size, delta) {
    for (let index = this.waves.length - 1; index >= 0; index -= 1) {
      const wave = this.waves[index];
      wave.radius += delta * size * 2.1;
      wave.life -= delta * .85;
      if (wave.life <= 0) {
        this.waves.splice(index, 1);
        continue;
      }
      context.strokeStyle = this.rgba(wave.life * (wave.strong ? .38 : .22));
      context.lineWidth = wave.strong ? 2.2 : 1.2;
      context.beginPath();
      context.arc(centerX, centerY, wave.radius, 0, TAU);
      context.stroke();
    }
  }

  paintCore(context, centerX, centerY, size, seconds) {
    const beat = this.reduced ? 0 : Math.sin(seconds * (2.2 + this.activity * 4)) * (.02 + this.activity * .05);
    const radius = size * (.24 + beat);
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius * 2.1);
    gradient.addColorStop(0, this.rgba(.42 + this.activity * .3));
    gradient.addColorStop(.55, this.rgba(.1));
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(centerX, centerY, radius * 2.1, 0, TAU);
    context.fill();

    if (this.reduced) return;
    context.save();
    context.translate(centerX, centerY);
    for (let arc = 0; arc < 3; arc += 1) {
      context.rotate(seconds * (.5 + arc * .35) * (arc % 2 ? -1 : 1));
      context.strokeStyle = this.rgba(.3 + this.activity * .25);
      context.lineWidth = 1.6 - arc * .35;
      context.beginPath();
      context.arc(0, 0, radius * (.72 + arc * .16), .5, .5 + 1.6);
      context.stroke();
    }
    context.restore();
  }

  /**
   * Qualitätsverlauf. Aufgetragen wird die Zahl der verbleibenden gelben
   * Hinweise; eine fallende Kurve bedeutet einen besser werdenden Plan.
   */
  paintHistory(context, width, height) {
    if (this.history.length < 2) return;
    const bottom = height - 12;
    const top = height - 58;
    const left = 18;
    const right = width - 18;
    const max = Math.max(...this.history, 1);
    const min = Math.min(...this.history, 0);
    const span = Math.max(1, max - min);

    context.beginPath();
    this.history.forEach((value, index) => {
      const x = left + (right - left) * (index / Math.max(1, this.history.length - 1));
      const y = top + (bottom - top) * ((value - min) / span);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = this.rgba(.6);
    context.lineWidth = 1.6;
    context.stroke();

    context.lineTo(right, bottom);
    context.lineTo(left, bottom);
    context.closePath();
    const fill = context.createLinearGradient(0, top, 0, bottom);
    fill.addColorStop(0, this.rgba(.18));
    fill.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = fill;
    context.fill();
  }

  stop() {
    this.active = false;
    this.observer?.disconnect();
    this.intersectionObserver?.disconnect();
    globalThis.document?.removeEventListener?.('visibilitychange', this.onVisibilityChange);
    globalThis.window?.removeEventListener?.('appsettingschange', this.onMotionChange);
    this.motionQuery?.removeEventListener?.('change', this.onMotionChange);
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.syncRenderState();
  }
}
