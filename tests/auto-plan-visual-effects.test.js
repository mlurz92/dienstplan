import test from 'node:test';
import assert from 'node:assert/strict';

import { GlowAtlas, ParticlePool, RipplePool, ease, hashNoise } from '../js/auto-plan-visual-effects.js';

/**
 * Die Effektbausteine haben genau zwei Zusagen, die man ihnen nicht ansieht:
 * Sie wachsen nicht, und sie scheitern nicht an fehlender Grafik. Beides fällt
 * im Betrieb erst spät auf — als langsam steigender Speicherverbrauch über
 * einen langen Lauf, oder als schwarze Fläche auf einem Gerät ohne Offscreen.
 */

test('Partikelvorrat wächst nicht über seine Kapazität', () => {
  const pool = new ParticlePool(8);
  for (let index = 0; index < 500; index += 1) pool.emit({ x: index, y: 0, hue: 10 });
  assert.equal(pool.items.length, 8, 'der Vorrat bleibt so groß, wie er gebaut wurde');
  assert.ok(pool.live <= 8);

  // Ausgelaufene Partikel geben ihren Platz zurück, statt liegen zu bleiben.
  pool.step(2);
  assert.equal(pool.live, 0);
});

test('Ringvorrat verhält sich ebenso und lässt sich leeren', () => {
  const pool = new RipplePool(4);
  for (let index = 0; index < 40; index += 1) pool.emit({ x: 0, y: 0, hue: 200 });
  assert.equal(pool.items.length, 4);
  assert.equal(pool.live, 4);
  pool.clear();
  assert.equal(pool.live, 0);
});

test('ohne Leinwandfabrik fällt der Schein still aus', () => {
  // In Node gibt es weder OffscreenCanvas noch document.createElement. Ein
  // Aufrufer darf das nicht merken müssen — er zeichnet dann eben ohne Schein.
  const atlas = new GlowAtlas();
  const calls = [];
  const context = { drawImage: (...args) => calls.push(args) };
  assert.equal(atlas.paint(context, 120, 10, 10, 6, 0.8), false);
  assert.equal(calls.length, 0);
});

test('Kurven und Rauschen sind wiederholbar und begrenzt', () => {
  // Ein Überschwingen, das nicht über eins hinausginge, wäre keines.
  assert.ok(ease.outBack(0.7) > 1, 'outBack schwingt über');
  assert.equal(ease.outCubic(0), 0);
  assert.equal(ease.outCubic(1), 1);
  // Wiederholbarkeit ist der ganze Grund, kein Math.random zu verwenden:
  // Dieselbe Marke muss in jedem Bild denselben Platz haben.
  assert.equal(hashNoise(3, 1.5), hashNoise(3, 1.5));
  assert.ok(Math.abs(hashNoise(9, 0.25)) <= 1);
});
