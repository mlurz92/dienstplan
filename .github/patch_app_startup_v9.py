from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path: Path, old: str, new: str) -> None:
    content = path.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one patch anchor, found {count}: {old!r}")
    path.write_text(content.replace(old, new), encoding="utf-8")


app = ROOT / "js/app.js"
replace_once(
    app,
    "window.addEventListener('DOMContentLoaded', init);\nwindow.addEventListener('beforeunload', () => {",
    """let startupPromise = null;

/**
 * Startet die Hauptanwendung genau einmal – unabhängig davon, ob dieses Modul
 * vor oder nach DOMContentLoaded ausgewertet wird. Statische ES-Module können
 * durch ihren Abhängigkeitsgraphen später als erwartet zur Ausführung kommen;
 * ein ausschließlich registrierter Event-Listener würde das bereits
 * abgeschlossene Ereignis dann verpassen und die Oberfläche bei „Lädt …“
 * belassen.
 */
function startApplication() {
  if (startupPromise) return startupPromise;
  startupPromise = Promise.resolve()
    .then(() => init())
    .catch(error => {
      const health = window.__dienstplanStartupHealth;
      if (health?.report) health.report(error, 'app-init');
      else setTimeout(() => { throw error; }, 0);
    });
  return startupPromise;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApplication, { once: true });
} else {
  startApplication();
}

window.addEventListener('beforeunload', () => {""",
)

helper = ROOT / "tests/e2e/open-app.js"
helper.write_text(
    """import { expect } from '@playwright/test';

/**
 * Navigiert bis zur DOM-Bereitschaft und wartet danach auf den fachlichen
 * Startvertrag der Anwendung. Das vollständige `load`-Ereignis ist kein
 * belastbares Bereitschaftssignal für eine modulare App mit externen und
 * optionalen Ressourcen.
 */
export async function openApp(page, { timeout = 30_000 } = {}) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#monthSelect option')).toHaveCount(12, { timeout });
  await expect(page.locator('#yearSelect option').first()).toBeAttached({ timeout });
  await expect(page.locator('#planTableBody tr').first()).toBeAttached({ timeout });
  await expect(page.locator('#saveStatus')).not.toHaveText(/^Lädt(?: …)?$/, { timeout });
  await expect(page.locator('#startupFailureV9')).toHaveCount(0);
}
""",
    encoding="utf-8",
)

expected_specs = [
    "app.spec.js",
    "bughunt.spec.js",
    "batch.spec.js",
    "color-director.spec.js",
    "print-export.spec.js",
    "toolbar-density.spec.js",
    "v8-5-shell.spec.js",
    "picker.spec.js",
    "auto-plan.spec.js",
    "month-view-transition.spec.js",
    "auto-plan-table-v2.spec.js",
    "month-transition-stability.spec.js",
]

replacements = 0
for name in expected_specs:
    path = ROOT / "tests/e2e" / name
    content = path.read_text(encoding="utf-8")
    count = content.count("await page.goto('/');")
    if count < 1:
        raise RuntimeError(f"{path}: no default load-wait navigation found")
    content = content.replace("await page.goto('/');", "await openApp(page);")
    if "from './open-app.js'" not in content:
        first_line_end = content.find("\n")
        if first_line_end < 0 or not content.startswith("import "):
            raise RuntimeError(f"{path}: expected import as first line")
        content = (
            content[: first_line_end + 1]
            + "import { openApp } from './open-app.js';\n"
            + content[first_line_end + 1 :]
        )
    path.write_text(content, encoding="utf-8")
    replacements += count

if replacements < len(expected_specs):
    raise RuntimeError(f"expected at least {len(expected_specs)} navigations, replaced {replacements}")

entry_test = ROOT / "tests/startup-entry-v9.test.js"
entry_test.write_text(
    """import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Hauptentrypoint startet vor und nach DOMContentLoaded genau einmal', async () => {
  const app = await read('../js/app.js');
  assert.doesNotMatch(app, /window\.addEventListener\('DOMContentLoaded',\s*init\)/);
  assert.match(app, /let startupPromise = null/);
  assert.match(app, /if \(startupPromise\) return startupPromise/);
  assert.match(app, /document\.readyState === 'loading'/);
  assert.match(app, /document\.addEventListener\('DOMContentLoaded', startApplication, \{ once: true \}\)/);
  assert.match(app, /else \{\s*startApplication\(\);\s*\}/s);
  assert.match(app, /__dienstplanStartupHealth/);
  assert.match(app, /'app-init'/);
});

test('E2E-Bereitschaft folgt dem App-Vertrag statt dem vollständigen load-Ereignis', async () => {
  const helper = await read('../tests/e2e/open-app.js');
  assert.match(helper, /waitUntil: 'domcontentloaded'/);
  assert.match(helper, /#monthSelect option/);
  assert.match(helper, /#planTableBody tr/);
  assert.match(helper, /#saveStatus/);
  assert.match(helper, /#startupFailureV9/);
});
""",
    encoding="utf-8",
)

(ROOT / ".github/patch_app_startup_v9.py").unlink()
(ROOT / ".github/workflows/patch-app-startup-v9.yml").unlink()
