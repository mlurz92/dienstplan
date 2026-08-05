# Dienstplanrad 0.9.5 – Auto-Plan Engine v9.5

## Release-Ziel

Version 0.9.5 ersetzt die fehleranfällige numerische Personenindex-Modellierung durch ein korrektes binäres Slot-Person-Modell. Die produktive Regelengine bleibt die abschließende Autorität; CP-SAT, Constraint-LNS und die lokale v8.5-Heuristik bilden eine gestufte, ausfallsichere Suchpipeline.

## Technische Kerneigenschaften

- eine Boolean-Variable je offenem Dienstfeld und zulässiger Person;
- exakte Coverage-, Qualifikations-, Fixpunkt- und personenbezogene Obergrenzen;
- strikt lexikografische Zielphasen ohne Vermischung fachlicher Prioritäten;
- `FEASIBLE` wird niemals als Optimalitätsnachweis dargestellt;
- v8.5 als deterministischer Warmstart und vollständiger lokaler Fallback;
- constraint-gesteuerte LNS-Nachbarschaften für Wochenenden, Lastspitzen und Konfliktreparatur;
- vollständiger Schlussaudit mit der produktiven Regelengine vor Anzeige und Übernahme;
- bestätigungspflichtige rote Ausnahmen bleiben sichtbar und werden nicht beschönigt;
- Freitag-BD · Samstag frei · Sonntag-BD wird explizit vermieden;
- feste Studio-Geometrie mit internen Scrollbereichen und festem Kommentarfenster;
- Light Mode als Standard, kontraststarker Dark Mode, rein pictografischer Theme-Schalter;
- View-Transition-Snapshots sind pointer-transparent, sodass Navigation und Auto-Plan auch während des Monatswechsels bedienbar bleiben;
- vollständige Tastatur-, Tooltip-, Layout- und Browserregressionen.

## Solver-Laufzeit

Der Browser lädt zuerst die lokale, gleichoriginige Brücke `vendor/or-tools-wasm/cp-sat.js`. Sie exportiert die exakt gepinnte freie Version `or-tools-wasm@0.9.1`. Schlägt Selbsttest oder Laden fehl, folgt `cpsat-js@1.0.0`; danach übernimmt die vollständig lokale v8.5-Heuristik. Es gibt keine kostenpflichtige Solver- oder Serverabhängigkeit.

## Installation und Prüfung

```bash
npm ci
npm run check
npm run build
npm test
npx playwright install chromium
npm run test:e2e
```

## Cloudflare Pages

- Build-Befehl: `npm run build`
- Ausgabeverzeichnis: Repository-Root
- Node.js: 24
- Functions werden über `_routes.json` auf API- und Worker-Routen begrenzt.
- `_headers` setzt die für multithreaded WASM erforderlichen Isolationsheader.

## GitHub-Upload

Den vollständigen Inhalt des ZIP-Archivs in die Wurzel eines leeren oder bestehenden Repositorys kopieren. Nicht zusätzlich einen übergeordneten Ordner hochladen. Anschließend lokal oder per GitHub Actions die oben genannten Prüfungen ausführen.

## Bewusste Grenzen

Eine fachlich konfliktfreie Vollbelegung kann mathematisch unmöglich sein. In diesem Fall liefert die Engine nur nach ausdrücklich erlaubtem Minimal-Rot-Fallback einen bestätigungspflichtigen Vorschlag. Ein CP-SAT-Nachweis gilt für das v9.5-Modell; der produktive Endaudit bleibt entscheidend.
