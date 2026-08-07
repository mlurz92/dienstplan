/**
 * Billige Pracht — die Effektbausteine der Laufansichten.
 *
 * WARUM DIESES MODUL EXISTIERT
 *
 * Die erste Fassung der Ansichten kaufte ihren Glanz mit `shadowBlur`. Das ist
 * die teuerste Einstellung des 2D-Kontexts: Der Browser rendert die Form in eine
 * Zwischenfläche, unschärft sie und setzt sie zurück — je Element, je Bild. Bei
 * zweiundsechzig Feldern, zwanzig Zeilen und einem Partikelstrom sind das
 * tausende Weichzeichnungen pro Sekunde für einen Fortschrittsbalken.
 *
 * Dieselbe Optik kostet fast nichts, wenn der Schein **einmal** gezeichnet und
 * danach nur noch kopiert wird: Ein vorgerendertes Verlaufsplättchen, additiv
 * gemischt (`lighter`), ist ein reiner Kopiervorgang — die Sache, für die
 * Grafikhardware gebaut ist. Die Sprites liegen nach Farbton und Größe in
 * Stufen vor; benachbarte Töne teilen sich eines, weil das Auge den Unterschied
 * im Schein ohnehin nicht sieht.
 *
 * Dazu kommen zwei Vorräte statt Neuanlagen: Partikel und Ringe werden aus
 * einem Pool geholt und zurückgegeben. Kein `new` im Bild heißt keine
 * Aufräumpausen mitten in der Animation.
 *
 * Alles hier ist **budgetfähig**: Jede Zeichenfunktion nimmt einen
 * Detailfaktor zwischen null und eins entgegen und darf bei knappem Budget
 * weniger, aber nie etwas anderes zeigen.
 *
 * Ohne Leinwandfabrik — etwa in den Modultests unter Node — fallen die Sprites
 * still aus und die Aufrufer zeichnen ohne Schein weiter. Eine Ansicht darf an
 * fehlender Grafik nicht scheitern.
 *
 * WARUM KEINE FREMDE BIBLIOTHEK
 *
 * Für bewegte Grafik liegt der Griff zu PixiJS, three.js oder einer
 * Partikelbibliothek nahe. Für diesen Zweck wäre er falsch:
 *
 *   Gewicht    Ein WebGL-Renderer wiegt vierhundert Kilobyte und mehr. Er müsste
 *              nach den Regeln dieses Projekts ins Repository und würde für eine
 *              Fortschrittsanzeige mehr Code mitbringen als die Regelengine hat.
 *   Verbrauch  Ein zweiter Renderer belegt Grafikspeicher und einen eigenen
 *              Kontext — neben der Anwendung, die daneben weiterläuft, und dem
 *              CP-SAT-Kern, der die Rechenzeit tatsächlich braucht. Die Vorgabe
 *              lautete ausdrücklich: nicht übermäßig verausgaben.
 *   Wirkung    Der Engpass war nie die Zeichenleistung, sondern eine einzelne
 *              teure Einstellung, die je Element gesetzt wurde. Gegen sie hilft
 *              kein anderer Renderer, sondern ein anderes Vorgehen — genau das
 *              steht hier, in rund dreihundert Zeilen ohne Abhängigkeit.
 *
 * Bliebe es bei einer Fläche, auf der zehntausend Elemente gleichzeitig bewegt
 * werden müssen, wäre die Abwägung eine andere. Bei zweiundsechzig Feldern,
 * zwanzig Zeilen und einem Tropfenstrom ist sie es nicht.
 */

import { TAU, clamp, hsl } from './auto-plan-visual-kit.js?v=20260806.1';

/* Farbtöne werden in Stufen von 12° zusammengefasst: 30 Sprites decken den
   ganzen Kreis ab, und kein Auge sieht im weichen Schein 6° Unterschied. */
const HUE_STEP = 12;
/* Vier Größenstufen genügen; dazwischen wird beim Zeichnen skaliert. */
const SPRITE_SIZES = Object.freeze([16, 32, 64, 128]);

function createCanvas(width, height) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(width, height);
  // `globalThis.document`, nicht `document`: Der Fragezeichenoperator schützt
  // vor einem Wert, der null ist — nicht vor einem Bezeichner, den es gar nicht
  // gibt. In Node und in einem Web Worker wirft der bloße Name.
  if (typeof globalThis.document?.createElement === 'function') {
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

/**
 * Vorrat vorgerenderter Scheinplättchen.
 *
 * Ein Plättchen ist ein radialer Verlauf von der vollen Farbe in der Mitte auf
 * völlige Durchsichtigkeit am Rand. Additiv aufgetragen ergibt das denselben
 * Eindruck wie ein Weichzeichner, kostet aber nur eine Kopie.
 */
export class GlowAtlas {
  constructor() {
    this.cache = new Map();
    this.available = true;
  }

  key(hue, size) {
    return `${Math.round(hue / HUE_STEP) * HUE_STEP}|${size}`;
  }

  /** Nächstgrößere vorhandene Stufe — lieber verkleinern als vergrößern. */
  sizeFor(radius) {
    const needed = Math.max(2, radius * 2);
    return SPRITE_SIZES.find(size => size >= needed) || SPRITE_SIZES.at(-1);
  }

  sprite(hue, size) {
    const key = this.key(hue, size);
    const known = this.cache.get(key);
    if (known !== undefined) return known;
    const canvas = this.available ? createCanvas(size, size) : null;
    if (!canvas) {
      this.available = false;
      this.cache.set(key, null);
      return null;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx?.createRadialGradient) {
      this.cache.set(key, null);
      return null;
    }
    const middle = size / 2;
    const gradient = ctx.createRadialGradient(middle, middle, 0, middle, middle, middle);
    const tone = { h: Math.round(hue / HUE_STEP) * HUE_STEP, s: 0.85, l: 0.6 };
    // Drei Stützstellen statt zwei: Der Kern bleibt dicht, der Abfall wird
    // weich. Ein linearer Verlauf sähe aus wie ein Aufkleber.
    gradient.addColorStop(0, hsl(tone, 1));
    gradient.addColorStop(0.35, hsl(tone, 0.42));
    gradient.addColorStop(1, hsl(tone, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    this.cache.set(key, canvas);
    return canvas;
  }

  /**
   * Trägt Schein an einer Stelle auf. `strength` steuert die Deckkraft, nicht
   * die Größe — so bleibt der Radius eine Aussage über die Bedeutung und die
   * Stärke eine über die Energie.
   */
  paint(ctx, hue, x, y, radius, strength = 1) {
    if (radius <= 0 || strength <= 0) return false;
    const sprite = this.sprite(hue, this.sizeFor(radius));
    if (!sprite) return false;
    const previous = ctx.globalCompositeOperation;
    const alpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(strength, 0, 1);
    ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = previous;
    return true;
  }
}

/**
 * Vorrat für Partikel.
 *
 * Feste Größe, feste Felder, kein Wachstum: Ein voller Pool verwirft die
 * älteste Spur, statt Speicher nachzufordern. Damit ist die Obergrenze der
 * Kosten schon beim Bau bekannt und nicht erst im schlechtesten Bild.
 */
export class ParticlePool {
  constructor(capacity = 220) {
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, () => ({
      alive: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, decay: 1, hue: 0, size: 1, drag: 1
    }));
    this.cursor = 0;
    this.live = 0;
  }

  /** Holt den nächsten freien Platz; ist keiner frei, wird der älteste geerbt. */
  emit(properties) {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    if (!item.alive) this.live += 1;
    Object.assign(item, { alive: true, life: 1, decay: 1, drag: 1, size: 1 }, properties);
    return item;
  }

  step(delta) {
    if (!this.live) return;
    let live = 0;
    for (const item of this.items) {
      if (!item.alive) continue;
      item.life -= delta * item.decay;
      if (item.life <= 0) {
        item.alive = false;
        continue;
      }
      item.x += item.vx * delta;
      item.y += item.vy * delta;
      if (item.drag !== 1) {
        item.vx *= item.drag;
        item.vy *= item.drag;
      }
      live += 1;
    }
    this.live = live;
  }

  /** Zeichnet höchstens `limit` lebende Partikel — die Bremse des Budgets. */
  paint(ctx, atlas, limit = Infinity, scale = 1) {
    if (!this.live) return;
    let drawn = 0;
    for (const item of this.items) {
      if (!item.alive) continue;
      if (drawn >= limit) return;
      atlas.paint(ctx, item.hue, item.x, item.y, item.size * scale, item.life * 0.8);
      drawn += 1;
    }
  }

  clear() {
    for (const item of this.items) item.alive = false;
    this.live = 0;
  }
}

/**
 * Vorrat für Ringe — die Druckwelle einer Entscheidung.
 *
 * Ein Ring ist billiger als ein Partikelschwarm und liest sich deutlicher: Er
 * sagt „hier ist gerade etwas eingerastet", ohne die Fläche zuzumüllen.
 */
export class RipplePool {
  constructor(capacity = 24) {
    this.capacity = capacity;
    this.items = Array.from({ length: capacity }, () => ({ alive: false, x: 0, y: 0, r: 0, grow: 1, life: 0, hue: 0, width: 1 }));
    this.cursor = 0;
    this.live = 0;
  }

  emit(properties) {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    if (!item.alive) this.live += 1;
    Object.assign(item, { alive: true, life: 1, r: 0, grow: 60, width: 1.5 }, properties);
    return item;
  }

  step(delta) {
    if (!this.live) return;
    let live = 0;
    for (const item of this.items) {
      if (!item.alive) continue;
      item.life -= delta * 1.6;
      item.r += item.grow * delta;
      if (item.life <= 0) {
        item.alive = false;
        continue;
      }
      live += 1;
    }
    this.live = live;
  }

  paint(ctx, limit = Infinity) {
    if (!this.live) return;
    let drawn = 0;
    for (const item of this.items) {
      if (!item.alive) continue;
      if (drawn >= limit) return;
      ctx.strokeStyle = hsl({ h: item.hue, s: 0.6, l: 0.58 }, item.life * 0.5);
      ctx.lineWidth = item.width * item.life;
      ctx.beginPath();
      ctx.arc(item.x, item.y, Math.max(0.5, item.r), 0, TAU);
      ctx.stroke();
      drawn += 1;
    }
  }

  clear() {
    for (const item of this.items) item.alive = false;
    this.live = 0;
  }
}

/* Beschleunigungskurven. Sie sind der Unterschied zwischen „bewegt sich" und
   „hat Gewicht": Ein Knoten, der leicht überschwingt, wirkt eingerastet; einer,
   der linear wächst, wirkt gezeichnet. */
export const ease = Object.freeze({
  outCubic: t => 1 - Math.pow(1 - clamp(t, 0, 1), 3),
  inOutSine: t => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2,
  /** Überschwingt einmal und kommt zurück — das „Einrasten". */
  outBack: t => {
    const x = clamp(t, 0, 1);
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
  },
  /** Zwei gedämpfte Schwingungen; für Wasser und Fäden. */
  wobble: (t, cycles = 2) => Math.sin(clamp(t, 0, 1) * Math.PI * cycles) * (1 - clamp(t, 0, 1))
});

/**
 * Wiederholbares Rauschen ohne Bibliothek.
 *
 * `Math.random()` wäre in einer Animation ein Fehler: Dasselbe Element flackerte
 * in jedem Bild anders. Diese Funktion liefert zu gleichen Argumenten immer
 * denselben Wert und erlaubt damit ruhige, aber unregelmäßige Bewegung.
 */
export function hashNoise(index, time, scale = 1) {
  const x = Math.sin(index * 127.1 + time * scale) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

export const VISUAL_EFFECTS_VERSION = '20260806.1';
