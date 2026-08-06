/**
 * Vertragsprüfung des IONOS-Backends.
 *
 * Geprüft wird, was kein anderer Test prüfen kann: dass die PHP-Fassung unter
 * `server/ionos/api/` genau denselben HTTP-Vertrag bedient wie die
 * Cloudflare-Functions — gleiche Pfade, gleiche Antwortfelder, gleiche
 * Statuscodes — und dass ein Monatsdatensatz die Ablage formgleich wieder
 * verlässt. Ein Fehler hier bedeutet Datenverlust beim Umzug; er ist von der
 * Oberfläche aus nicht zu sehen.
 *
 * Der Lauf braucht `php` mit `pdo_sqlite`. MySQL ist dafür nicht nötig: Die
 * Ablage benutzt PDO, geprüft wird die Logik davor. Fehlt PHP, wird der Test
 * übersprungen statt falschen Alarm zu geben.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, copyFile, writeFile, rm } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEmptyMonth, normalizeMonthData, DEFAULT_STAFF } from '../js/defaults.js';

const phpAvailable = spawnSync('php', ['-v'], { encoding: 'utf8' }).status === 0;

const ROUTER = `<?php
// Ersetzt im Test, was auf dem Webspace die .htaccess-Regel erledigt.
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (str_starts_with($path, '/api/')) { require __DIR__ . '/api/index.php'; return true; }
return false;
`;

async function startServer() {
  const root = await mkdtemp(join(tmpdir(), 'dienstplan-ionos-'));
  await mkdir(join(root, 'api'));
  const source = new URL('../server/ionos/api/', import.meta.url);
  for (const file of ['index.php', 'store.php']) {
    await copyFile(new URL(file, source), join(root, 'api', file));
  }
  await writeFile(join(root, 'api', 'config.php'), `<?php return [
    'dsn' => 'sqlite:${join(root, 'kv.sqlite')}',
    'user' => null,
    'password' => null,
    'maxBodyBytes' => 4194304
  ];\n`);
  await writeFile(join(root, 'router.php'), ROUTER);

  const port = 8100 + Math.floor(Math.random() * 800);
  const server = spawn('php', ['-S', `127.0.0.1:${port}`, join(root, 'router.php')], {
    cwd: root,
    stdio: ['ignore', 'ignore', 'pipe']
  });
  const diagnostics = [];
  server.stderr.on('data', chunk => diagnostics.push(String(chunk)));

  const base = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const probe = await fetch(`${base}/api/bootstrap`);
      if (probe.ok) break;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return {
    base,
    diagnostics,
    async stop() {
      server.kill('SIGKILL');
      await rm(root, { recursive: true, force: true });
    }
  };
}

async function call(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  return { status: response.status, body };
}

test('das IONOS-Backend bedient den API-Vertrag der Cloudflare-Functions', { skip: !phpAvailable && 'php nicht verfügbar' }, async t => {
  const server = await startServer();
  t.after(() => server.stop());
  const { base } = server;

  await t.test('leerer Bestand antwortet mit null statt mit Vorgaben', async () => {
    // Die Vorgaben stehen in `js/defaults.js` und werden im Client eingesetzt.
    // Der Server darf sie NICHT kennen, sonst gibt es zwei Wahrheiten.
    const bootstrap = await call(base, '/api/bootstrap');
    assert.equal(bootstrap.status, 200);
    assert.deepEqual(bootstrap.body, { ok: true, settings: null, staff: null, rbnNames: null });

    const month = await call(base, '/api/month/2026/09');
    assert.deepEqual(month.body, { ok: true, month: null });
  });

  await t.test('ein Monat kommt formgleich zurück', async () => {
    const written = normalizeMonthData(2026, 9, {
      ...createEmptyMonth(2026, 9),
      days: { ...createEmptyMonth(2026, 9).days, '2026-09-01': { bd: 'ls', hg: 'sf', rbn1: '', rbn2: '', notes: 'Probe' } },
      absences: { ls: { '2026-09-05': 'U' } },
      revision: 3
    });
    const put = await call(base, '/api/month/2026/09', { method: 'PUT', body: JSON.stringify(written) });
    assert.equal(put.status, 200);
    assert.deepEqual(put.body.month, written);

    const read = await call(base, '/api/month/2026/09');
    assert.deepEqual(read.body.month, written, 'die Ablage darf die Form nicht verändern');
    // Leere Karten müssen Objekte bleiben. Mit assoziativer JSON-Dekodierung
    // in PHP würde `{}` als `[]` zurückkommen — genau der stille Formverlust,
    // den dieser Test verhindert.
    assert.deepEqual(read.body.month.options, {});
  });

  await t.test('Personal und RBN-Namen werden geschrieben und gelesen', async () => {
    const staff = await call(base, '/api/staff', { method: 'PUT', body: JSON.stringify(DEFAULT_STAFF) });
    assert.equal(staff.status, 200);
    assert.equal((await call(base, '/api/staff')).body.staff.length, DEFAULT_STAFF.length);

    // Beide historischen Körperformen bleiben zulässig.
    assert.deepEqual((await call(base, '/api/rbn-names', { method: 'PUT', body: JSON.stringify(['Dr. A']) })).body.rbnNames, ['Dr. A']);
    assert.deepEqual((await call(base, '/api/rbn-names', { method: 'PUT', body: JSON.stringify({ rbnNames: ['Dr. B'] }) })).body.rbnNames, ['Dr. B']);
  });

  await t.test('unbrauchbare Eingaben werden abgewiesen, nicht gespeichert', async () => {
    assert.equal((await call(base, '/api/settings', { method: 'PUT', body: '{kaputt' })).status, 400);
    assert.equal((await call(base, '/api/settings', { method: 'PUT', body: '[]' })).status, 400);
    assert.equal((await call(base, '/api/staff', { method: 'PUT', body: '{}' })).status, 400);
    assert.equal((await call(base, '/api/staff', { method: 'PUT', body: '[]' })).status, 400);
    assert.equal((await call(base, '/api/month/1999/01', { method: 'GET' })).status, 400);
    assert.equal((await call(base, '/api/month/2026/13', { method: 'GET' })).status, 400);
    assert.equal((await call(base, '/api/month/2026/09', { method: 'DELETE' })).status, 405);
    assert.equal((await call(base, '/api/gibtsnicht')).status, 404);
    // Der abgewiesene Versuch darf den Bestand nicht angetastet haben.
    assert.equal((await call(base, '/api/staff')).body.staff.length, DEFAULT_STAFF.length);
  });

  await t.test('Export und Import bilden den vollständigen Bestand ab', async () => {
    const exported = await call(base, '/api/export');
    assert.equal(exported.status, 200);
    assert.deepEqual(exported.body.months.map(entry => entry[0]), ['2026-09']);

    const payload = {
      settings: { appearance: { theme: 'dark' } },
      staff: DEFAULT_STAFF,
      rbnNames: ['Dr. C'],
      months: [['2026-10', normalizeMonthData(2026, 10, createEmptyMonth(2026, 10))]]
    };
    const imported = await call(base, '/api/import', { method: 'POST', body: JSON.stringify(payload) });
    assert.deepEqual(imported.body, { ok: true, importedMonths: 1 });

    const after = await call(base, '/api/export');
    assert.deepEqual(after.body.months.map(entry => entry[0]), ['2026-09', '2026-10']);
    assert.deepEqual(after.body.rbnNames, ['Dr. C']);

    // Ein fehlerhafter Monat in der Sicherung verwirft den GANZEN Import.
    const broken = await call(base, '/api/import', {
      method: 'POST',
      body: JSON.stringify({ rbnNames: ['Dr. D'], months: [['2026-11', 'kein Objekt']] })
    });
    assert.equal(broken.status, 400);
    assert.deepEqual((await call(base, '/api/export')).body.rbnNames, ['Dr. C'], 'nichts darf teilweise geschrieben worden sein');
  });
});
