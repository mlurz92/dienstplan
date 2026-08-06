# DienstplanRAD

Regelgestützter Dienstplaner für die Radiologie. Reines ES-Modul-Frontend ohne
Build-Schritt, Auslieferung über Cloudflare Pages, Speicher über Cloudflare KV.

## Befehle

| Zweck | Befehl | Dauer |
|---|---|---|
| Syntaxprüfung aller Module | `npm run check` | ~5 s |
| Unit-Tests | `npm test` | ~70 s |
| Einzelne Unit-Datei | `node --test tests/<datei>.test.js` | 1–25 s |
| Browsertests vollständig | `npm run test:e2e` | ~4 min |
| Einzelne Browserdatei | `npx playwright test tests/e2e/<datei>.spec.js` | 2–30 s |
| Alles | `npm run verify` | ~5,5 min |

In dieser Umgebung braucht Playwright den vorinstallierten Browser:
`PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium-1194/chrome-linux/chrome`

## Testdisziplin — das Wichtigste in dieser Datei

Die vollständige Suite kostet Rechenzeit und Nutzungskontingent. **Sie gehört
nicht nach jede Änderung.** Maßgeblich ist, was die Änderung berühren kann:

| Geändert | Zu fahren |
|---|---|
| Nur Kommentare, README, Changelog | nichts |
| Eine CSS-Datei | die ein bis zwei Browsertests, die genau diese Fläche prüfen |
| Regelengine (`js/rules*.js`) | `npm test` |
| Dateiimport (`js/*-import.js`) | `node --test tests/pdf-import.test.js tests/file-import.test.js tests/excel-import.test.js` |
| Auto-Plan-Engine/Modell/Solver | `node --test tests/auto-plan-v10.test.js` und die betroffene Regeldatei |
| PDF-Export (`js/pdf-document.js`, `js/pdf-export.js`) | `node --test tests/pdf-export.test.js` |
| Druckausgabe (`styles.css` `@media print`) | `tests/e2e/print-single-page.spec.js` |
| Studio-Layout | `tests/e2e/studio-layout-v10-5.spec.js` |
| **Vor Commit und Merge** | `npm run check && npm test`, Browsertests nur für die berührten Flächen |
| **Vor einem Release** | `npm run verify` |

Zwei Regeln dazu:

- **Einmal messen genügt.** Wer eine Korrektur mit einem gezielten Test belegt
  hat, muss nicht anschließend die ganze Suite zur Bestätigung fahren.
- **Neue Tests sparsam.** Ein Test, der eine bereits geprüfte Zusage
  wiederholt, kostet dauerhaft Laufzeit und sagt nichts Neues. Vor jedem neuen
  Test die Frage: Welchen Fehler fängt er, den kein bestehender fängt?

## Konventionen

- Deutsch in Bezeichnern der Oberfläche, Kommentaren und Commit-Nachrichten.
- Kommentare erklären **warum**, nicht was. Ein Kommentar, der den Code
  wiederholt, wird gelöscht.
- ES-Module mit Versionsmarke im Bezeichner: `./modul.js?v=20260806.1`.
  Die Marke muss in allen Importen desselben Moduls gleich sein — sonst
  entstehen zwei Modulinstanzen mit getrenntem Zustand.
- Kein Build, kein Bundler. Fremde Bibliotheken, die ausgeliefert werden,
  liegen im Repository: CP-SAT-WebAssembly unter `vendor/cpsat-js/`, pdf.js
  unter `vendor/pdfjs/`, SheetJS unter `vendor/sheetjs/`
  (`npm run vendor:libs`). Ein CDN ist Rückfallebene, nie der einzige Weg.
  Fremde Bibliotheken werden bei Bedarf geladen, nicht im Startpfad.
- Neue Abhängigkeiten nur, wenn sie sowohl in `package.json` als auch in
  `package-lock.json` stehen — sonst scheitert `npm ci` in der CI.

## Grenzen

- Die **Regelengine entscheidet**, nicht das Optimierungsmodell. Jede neue
  fachliche Regel gehört an beide Orte: nach `js/rules-evaluation*.js` und als
  harte Bedingung nach `js/auto-plan-model.js`. Fehlt sie im Modell, baut die
  exakte Suche Vorschläge, die das Schlussaudit anschließend verwirft.
- Der **Druck passt auf eine A4-Seite hochkant** — ohne Ausnahme. Höhen im
  Druck leiten sich aus einem Budget geteilt durch die tatsächliche Zeilenzahl
  ab (`--print-plan-rows`, `--print-stat-rows` aus `syncPrintMetrics`), nie aus
  festen Millimeterwerten.
- **Layoutvertrag des Studios:** `min-width: 0` überall, `min-height: 0`
  ausschließlich für Zonen, die ihren Überlauf selbst scrollen. Pauschal
  gesetzt, lässt es Karten unter ihren Inhalt zusammenfallen.
- Keine Geheimnisse, keine `.env`-Dateien, keine Schlüssel im Repository.

## Aufbau

```
js/rules*.js              Regelwerk — die verbindliche Wahrheit
js/auto-plan-model.js     Boolesches Zuordnungsmodell (solverfrei, in Node testbar)
js/auto-plan-solver.js    Brücke zur CP-SAT-WebAssembly-Bindung
js/auto-planner-v10.js    lexikografische Kaskade, Leximin, Konfliktdiagnose
js/auto-plan-studio-*.js  Oberfläche des Studios, additiv geschichtet
js/app.js                 Monatsansicht, Rendering, Druckvorbereitung
js/pdf-document.js        minimaler PDF-Schreiber (Flächen, Linien, Text)
js/pdf-export.js          Satzbild des Monatsblatts, Direktdownload
js/file-import.js         ein Eingang für Excel, PDF und JSON
js/pdf-import.js          Textpositionen zu Tabellenzeilen (pdf.js)
functions/                Cloudflare Pages Functions (KV-Zugriff)
```
