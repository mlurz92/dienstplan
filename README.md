# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.9.1`  
> **Regelwerk:** Eignungsregeln `v4.10`  
> **Auto-Plan:** Algorithmus `v9` — *Hybrid Exact Observatory* (CP-SAT-Kern, Heuristik-Fallback)  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Workers KV · lokale Browser-Sicherung

DienstplanRAD verbindet kontrollierbare manuelle Monatsplanung mit einer bestätigungspflichtigen automatischen Komplettierung offener **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben unveränderliche Fixpunkte. RBN und zweite RBN werden weiterhin manuell geplant.

---

## 1. Funktionsumfang

- tabellarische Monatsansicht mit BD, HG, RBN und zweiter RBN;
- regelgestützte Kandidatenlisten mit Grün/Gelb/Orange/Rot/Grau und vollständiger Begründung;
- Abwesenheiten, Dienstwünsche, Optionen, Notizen und revisionsfähige Ausnahmebestätigungen;
- Monatsstatistik, Sollvergleich, Wochenendäquivalente und offene Punkte;
- Excel-/JSON-Import, Excel-/PDF-/JSON-Export;
- server-first Synchronisierung mit lokaler Offline-Sicherung;
- Auto-Plan Studio für Konfiguration, laufende Beobachtung, vollständige Vorschlagsprüfung und atomare Übernahme.

## 2. Leitprinzipien

1. Die produktive Regelengine ist die einzige fachliche Wahrheitsquelle.
2. Auto-Plan verändert ausschließlich zuvor leere BD-/HG-Felder des sichtbaren Monats.
3. Fixpunkte, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
4. Graue beziehungsweise technisch nicht wählbare Besetzungen sind in jeder Stufe ausgeschlossen.
5. Personengebundene BD-, HG- und Gesamtobergrenzen gelten in Konstruktion, Rescue, Reparatur und Perfektion.
6. Rote Abweichungen sind ausschließlich der letzte, ausdrücklich freigegebene Fallback.
7. Bis zur bewussten Übernahme erfolgt keine Mutation des Monatsplans.
8. Vor der Übernahme wird der vollständige Vorschlag erneut gegen das aktuelle Regelwerk auditiert.

---

## 3. Command Bar und Erscheinungsbild

### 3.1 Pictogrammbasierte Befehlsleiste

Die Werkzeugleiste ist semantisch in **Planung**, **Daten** und **Ausgabe** gegliedert. Jede Aktion besitzt ein SVG-Pictogramm. Beschriftungen werden nur gezeigt, wenn die gemessene Breite dies zulässt.

Dichtestufen:

1. Gruppenüberschriften und Beschriftungen;
2. ohne Gruppenüberschriften;
3. Beschriftungen nur für primäre Planungsaktionen;
4. reine Symbole;
5. Überlaufmenü für Daten- und Ausgabeaktionen.

Die Dichte wird anhand der realen Containerbreite bestimmt, nicht anhand starrer Viewport-Schwellen. **Theme-Schalter und Zahnrad** bilden einen dauerhaft erreichbaren rechten Befehlsblock und wandern nicht in das Überlaufmenü.

### 3.2 Hell-/Dunkelmodus

Der Schalter wechselt direkt zwischen `light` und `dark` und trägt ausschließlich das
Sonnen- beziehungsweise Mondpiktogramm – ohne sichtbare Beschriftung. Die Anwendung
startet standardmäßig im hellen Erscheinungsbild; eine ausdrücklich gespeicherte
Auswahl bleibt erhalten. Die Auswahl wird lokal gespeichert und vor Abschluss des
Anwendungs-Bootstraps angewendet, damit kein Farbblitz entsteht. Im Dunkelmodus
werden die Farbtoken der gesamten Anwendung kohärent auf die dunkle Palette
abgebildet – Tabellen, Badges, Picker, Dialoge, Einstellungen und Formulare
besitzen damit durchgehend lesbare Kontraste.

Die Monatskontrastfarbe bleibt in beiden Modi die Akzentquelle für:

- Fokusindikatoren;
- Glasränder und Flächentönungen;
- Wochenend-/Feiertagsabstufungen;
- Auto-Plan-Fortschritt;
- Status- und Interaktionszustände.

Der frühere anwendungsspezifische Modus **„Reduzierte Bewegung“** ist aus Einstellungen, gespeicherten UI-Zuständen und Root-Klassen entfernt. Animationen bleiben Bestandteil der Anwendung.

### 3.3 Erklärende Tooltips

`js/rich-tooltip-v8-5.js` vereinheitlicht die zuvor verteilten nativen `title`-Hinweise:

- Maus und Tastaturfokus;
- `role="tooltip"`;
- Verknüpfung über `aria-describedby`;
- Schließen mit `Escape`;
- automatische Positionierung ober- oder unterhalb des Auslösers;
- native `title`-Fallbacks, falls Rich Tooltips deaktiviert sind.

### 3.4 Bootstrap- und Observer-Stabilität

Die v8.5-Oberflächenschicht arbeitet strikt idempotent. Spät eingefügte Bedienelemente werden nur dann erneut synchronisiert, wenn die Mutation tatsächlich die Command Bar betrifft. Bereits korrekte Beschriftungen, ARIA-Attribute und Tooltip-Daten werden nicht erneut geschrieben.

Damit ist die beim ursprünglichen v8.5-Release entstandene Rückkopplung beseitigt: Der globale `MutationObserver` reagierte auf beliebige neue DOM-Knoten, setzte danach die unveränderten `.tool-label`-Texte erneut über `textContent` und erzeugte dadurch selbst die nächste `childList`-Mutation. Die Microtask-Kette verhinderte den Abschluss des `load`-Ereignisses und ließ die Anwendung beim Start einfrieren. Zusätzlich sind UI-Installation, Scroll-Policy und Rich-Tooltip-Attributpflege gegen Mehrfachinstallation beziehungsweise redundante Mutationen abgesichert.

---

## 4. Auto-Plan v9

### 4.1 Hybride exakte Architektur

```text
Fixpunkte/Domänen
  → Warmstart-Heuristik (v8.5-Pipeline, unverändert)
  → CP-SAT-Modellbau (Variablen, Klauseln, phasenweise Zielkomponenten)
  → lexikografische exakte Suche (Maximin-Fairness zuerst, dann weiche Ziele)
  → Regelengine-Schlussaudit (einzige fachliche Wahrheitsquelle)
  → bei OPTIMAL: beweisbare untere Schranke und Zertifizierung
  → bei INFEASIBLE: MUS-artige Ursachenanalyse, optional Relaxierung
  → sonst: bewährte Null-Rot-Intensivierung, Reparatur und ALNS-Perfektion
```

v9.5 übersetzt den Monatszustand in ein lineares Constraint-Modell und löst es
mit **Googles OR-Tools CP-SAT**, das als WebAssembly direkt im Browser läuft.
Der Single-Thread-Solver `cpsat-js` (MIT) wird seit v9.5 **lokal unter
`vendor/cpsat-js` ausgeliefert** (offline-fähig, ohne CDN-Laufzeitrisiko,
keine Cross-Origin-Isolation nötig); `or-tools-wasm` (Apache-2.0) und der
CDN-Weg bleiben als Fallback erhalten. Kann keine Bindung geladen werden
(älterer Browser, fehlende COOP/COEP-Isolation), bleibt die v8.5-Heuristik
vollständig erhalten und übernimmt.

**Regelengine bleibt die einzige Wahrheitsquelle:** Jeder CP-SAT-Vorschlag
durchläuft den vollständigen Schlussaudit der produktiven Engine; gewonnen wird
ausschließlich nach deren lexikografischer Zielordnung. Das CP-Modell ist eine
Suchhilfe, kein zweites Regelwerk.

### 4.2 Exakte Suche und Erklärbarkeit

- **Lexikografische Phasen:** Maximin-Fairness zuerst, danach Wünsche,
  BD-Soll, Wochenend- und Samstagslast in der Reihenfolge des
  Optimierungsschwerpunkts; erreichte Werte werden phasenweise fixiert.
  Seit v9.5 folgen am Ende der Kette drei zusätzliche Vermeidungsziele:
  **Wochenendkette** (Fr-BD · Sa frei · So-BD, v4.10 – möglichst vermeiden),
  **CT-Leitung** (M1 – keine selbst erzeugte Becker-FZA, wenn Martin fehlt)
  und **Minimal-Perturbation** (Abweichung vom Heuristik-Vorschlag).
- **Modellvollständigkeit:** Das CP-Modell kennt seit v9.5 die fachlichen
  Kernregeln als Constraints, die früher nur das Schlussaudit sah: Becker-FZA
  wird **nach jedem BD** (Werktag wie Wochenende) am nächsten regulären
  Werktag abgeleitet und sperrt dort BD und HG; die CT-Leitungsdeckung (M1)
  und die Wochenendkette (v4.10) fließen als weiche Ziele ein.
- **Optimalitätsnachweis:** `OPTIMAL` liefert eine echte untere Schranke und
  zertifiziert den Plan – der erste beweisbare Optimalitätsbeweis des Projekts.
- **Echte MUS-Konfliktanalyse:** Bei Unzulässigkeit wird seit v9.5 eine
  zweistufige Löschdiagnose gefahren (Gruppen- und Constraint-Ebene) und die
  **kleinste nachgewiesene Konfliktmenge (MUS)** benannt – statt der früheren
  gierigen Aktivierung. Auf Wunsch (`infeasibilityMode: 'relax'` oder
  `musAutoRelax`) werden genau diese Gruppen aufgeweicht und im Ergebnis
  ausgewiesen.
- **Determinismus:** Alle Zufallsströme (CP-SAT-Seed, Heuristik-Seed) leiten
  sich aus Konfiguration und Monatszustand ab; identische Eingaben ergeben
  identische Pläne.
- **Warmstart:** Das Heuristik-Ergebnis dient als Lösungshinweis (Hint) und
  prunt die exakte Suche.
- **Stabilität:** `protectBaseline` (Standard an) hält bestehende Belegungen;
  manuelle Edits bleiben beim Re-Planen erhalten.

### 4.3 Verbindliche v8.5-Pipeline (Fallback und Warmstart)

```text
Fixpunkte/Domänen
  → striktes Konstruktionsportfolio
  → profilabhängige Null-Rot-Intensivierung
  → optionaler Minimal-Rot-Fallback nur nach ausgeschöpfter strikter Suche
  → iterative Tausch- und lokale Reparatur
  → diversifizierte ALNS-Perfektion
  → vollständige Zertifizierung
```

Die v8.5-Profile (Ausgewogen/Intensiv/Exhaustiv), die strikte Eskalation vor
Rot und die verbindliche Perfektion bleiben unverändert bestehen und werden
weiterhin über `deriveV85Tuning()` in echte Solverfelder übersetzt.

### 4.2 Gekoppelte Suchprofile

| Profil | Reparaturrunden | lokales Neuplanungsbudget | Late Acceptance | strikte Wellen | Rescue-Breite |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ausgewogen | 4 | 4.000 | 300 | 2 | 148 % |
| Intensiv | 6 | 6.500 | 500 | 3 | 180 % |
| Exhaustiv | 8 | 10.000 | 900 | 4 | 225 % |

Die Ableitung erfolgt in `deriveV85Tuning()`. Dadurch steuern die sichtbaren Felder tatsächlich den Solver und nicht nur die Darstellung.

### 4.3 Strikte Eskalation vor Rot

Jede Welle erhöht begrenzt:

- Beam-Breite;
- Kandidatenfächer;
- Budget des exakten Restbacktrackings.

`allowRedFallback`, `maxRedViolations` und `profileFilter` werden für sämtliche strikten Wellen hart auf Null-Rot gesetzt. Erst wenn reguläre Konstruktion und alle Wellen keine saubere Vollbelegung liefern, darf das Profil `confirmable-balanced` ausgeführt werden.

### 4.4 Adaptive Perfektion

Die v8-Basis bleibt erhalten und wird verpflichtend genutzt:

- acht Zerstörungsoperatoren;
- drei Wiederaufbauoperatoren einschließlich Regret-2;
- segmentweise adaptive Operatorgewichte;
- Late-Acceptance-Annahme;
- Luby-Neustarts;
- absteigende Nachbarschaften mit Einzelumsetzung, Paartausch, Rollentausch, Dreierkette, Tages- und Wochenendpaket;
- vollständiger Nachweis über Einzelumsetzungen, Paartausche und Tagespakete.

### 4.5 Parallelität

Die Zahl der Perfektionsstränge ist automatisch oder explizit einstellbar. Das effektive Worker-Budget bleibt das Minimum aus:

- verfügbaren logischen Kernen;
- reservierten UI-Kernen;
- Leistungsprofil;
- Gerätespeicher;
- Zahl offener Dienstfelder.

Die fachliche Regelberechnung bleibt in Web Workers identisch zur manuellen Bewertung. Es existiert keine vereinfachte zweite Regelengine.

### 4.6 Wahrheitsgetreue Laufanzeige

Das Studio zeigt getrennt:

- Fixpunkt-/Domänenanalyse;
- Constraint-Konstruktion;
- aktuelle Null-Rot-Welle mit Beam- und Backtrackingwerten;
- Reparatur;
- Perfektionsstränge;
- Zertifizierung;
- reale Verbesserungen und geprüfte Zustände.

Die Ergebnisansicht protokolliert zusätzliche Wellen, Knoten, Rescue-Breite, Reparaturprofil und gegebenenfalls den nachgelagerten Fallback.

---

## 5. Performance für Windows 11 und Chrome

- rechenintensive Konstruktion und Perfektion in Modul-Web-Workern;
- reservierte UI-Kerne für Eingaben, Fortschritt und Animation;
- `requestAnimationFrame()` für visuelle Aktualisierungen;
- passive Scroll-Listener;
- reduzierte Backdrop-Filter-Kosten während aktiven Scrollens;
- `content-visibility: auto` für nachgelagerte Statistik- und Ergebnisbereiche;
- `contain` für große, unabhängige Layout-/Paint-Bereiche;
- compositorfreundliche Animationen über `transform` und `opacity`;
- keine dauerhaften `will-change`-Flächen;
- idempotente, zielgerichtete DOM-Beobachter ohne selbst erzeugte Mutation-Schleifen;
- vollständiger funktionaler Fallback ohne View-Transition-API.

---

## 6. Einstellungen und Persistenz

Gespeichert und über den Bootstrap-Pfad synchronisiert werden unter anderem:

- Informationsdichte;
- Monatsfarbsystem und Wochenendhervorhebung;
- atmosphärischer Hintergrund;
- Autosave-Verzögerung;
- Algorithmus-Kommentar und Studio-Visualisierung;
- Leistungsprofil, Suchintensität, Optimierungsfokus und Zeitbudget;
- Parallelitätslimit, Portfolio-Diversität, Rot-Obergrenze und Zertifizierungsrunden;
- v9: Solver-Backend, Exaktheitsmodus, CP-SAT-Zeitbudget und -Worker,
  Warmstart, Fairness-Profil, Determinismus, Infeasibility-Modus,
  Reparatur-nach-Änderung und Erklärungstiefe.

Das Hell-/Dunkelschema wird bewusst lokal vor dem Server-Bootstrap geladen
und startet standardmäßig im **hellen** Erscheinungsbild. Die
Auto-Plan-Studiokopplung wird ebenfalls lokal gesichert; die resultierenden
Solverfelder werden bei jedem Lauf erneut in die Laufkonfiguration übertragen.

---

## 7. Datenhaltung und Cloudflare

- **Pages:** statische Anwendung;
- **Pages Functions:** Bootstrap, Monatsdaten, Personal, RBN-Namen, Einstellungen, Import/Export;
- **Workers KV:** gemeinsame Persistenz mit versionierten Datenobjekten;
- **Browser:** Offline-Fallback und ausstehende lokale Änderungen.

KV besitzt Eventual Consistency. Die Anwendung verwendet deshalb Revisionsstände, Dirty-Marker und server-first Wiederabgleich; konkurrierende Änderungen dürfen nicht stillschweigend als identisch behandelt werden.

---

## 8. Lokale Entwicklung

Voraussetzungen: Node.js 24, npm.

```bash
npm ci
npm run check
npm test
npm run test:e2e
```

Vollständiges Gate:

```bash
npm run verify
```

Cloudflare Pages wird aus dem Repository-Root gebaut. Das KV-Binding lautet `DIENSTPLAN_KV`.

---

## 9. Tests

### Modultests

- Regelengine und Regelberichte;
- Imports/Exports und Persistenz;
- Toolbar-Dichtestufen;
- Auto-Plan-Invarianten, Fixpunktschutz und Zielordnung;
- Worker-Budget und Portfoliovergleich;
- v8.5-Phasenvertrag, Profilableitung und Fallback-Reihenfolge;
- v9: CP-SAT-Modellbau, Konfigurationsfelder, Relaxations-Diagnose,
  Fallback-Pipeline und Exaktheitsnachweis (`tests/auto-plan-v9.test.js`);
- v9.5: Modellkodierung von Becker-FZA, CT-Leitung und Wochenendkette,
  Perturbations-Ziel und MUS-fähige Diagnose ohne Solver
  (zusätzliche Tests in `tests/auto-plan-v9.test.js`).

### Browsertests

- vollständiger Abschluss des Browser-`load`-Ereignisses und responsiver Event Loop nach späten DOM-Einbauten;
- Monatsplanung, Picker, Batch-Verwaltung und Druck;
- Toolbar über zahlreiche Fensterbreiten ohne Überlagerung oder Horizontal-Scroll;
- Auto-Plan Studio, Vorschlagstabelle und Abbruchpfade;
- Theme-Persistenz;
- Entfernung des Legacy-Bewegungsmodus;
- tastaturfähige Rich Tooltips;
- Übertragung des Exhaustiv-Profils in reale Laufparameter.

---

## 10. Projektstruktur v9

```text
js/auto-planner-v9.js         hybride exakte Orchestrierung (CP-SAT + Fallback)
js/auto-plan-cp-sat.js        CP-SAT-Modellbau, Solver-Loader, Phasen, echte MUS-Diagnose
js/auto-plan-studio-v9.js     v9-Regler, Tooltips (Katalog + Fallback), Layout, Exaktheitsnachweis
js/auto-planner-v8-5.js       strikte Eskalation und verbindlicher Phasenvertrag
js/auto-plan-studio-v8-5.js   Profile, Phasentheater und Ergebnisprotokoll
js/app-theme-v8-5.js          persistenter Hell-/Dunkelcontroller (Start: hell)
js/rich-tooltip-v8-5.js       zentrale ARIA-Tooltips
js/ui-v8-5.js                 Command-Bar-, Bootstrap- und Performance-Integration
app-v8-5.css                  adaptive Farb- und Oberflächentoken
toolbar-v8-5.css              rechter Theme-/Einstellungsblock
auto-plan-studio-v8-5.css     v8.5-Studiozustände
auto-plan-studio-v9.css       Modal-Fit-Layout, kollabierbare v9-Sektion, Dark-Mode, Animation
vendor/cpsat-js/              lokal ausgelieferter CP-SAT-Solver (portable, MIT)
_headers                      COOP/COEP für multithreaded WebAssembly
tests/auto-plan-v8-5.test.js  Solver- und Integrationsverträge
tests/auto-plan-v9.test.js    CP-SAT-Modell-, MUS- und v9-Verträge
tests/e2e/v8-5-shell.spec.js  Browser-, Bootstrap- und Observer-Regressionen
```

---

## 11. Release 0.9.1

### Auto-Plan v9.5 („Correct Engine“)

- **Solver lokal ausgeliefert:** `cpsat-js` (portable, MIT) liegt unter
  `vendor/cpsat-js` und wird zuerst geladen; `or-tools-wasm` und der CDN-Weg
  bleiben als Fallback. Keine CDN-Laufzeitabhängigkeit, offline-fähig.
- **Modellvollständigkeit:** Becker-FZA wird nun **nach jedem BD** am nächsten
  regulären Werktag abgeleitet (nicht mehr nur nach Samstags-BD) und sperrt
  dort BD und HG im CP-Modell. CT-Leitung (M1) und Wochenendkette (v4.10,
  Fr-BD · Sa frei · So-BD) sind als weiche Vermeidungsziele im Modell.
- **Echte MUS:** Zweistufige Löschdiagnose (Gruppen- und Constraint-Ebene)
  benennt die kleinste nachgewiesene Konfliktmenge; Relaxierung arbeitet
  gezielt auf dieser Menge (`musAutoRelax`).
- **Minimal-Perturbation:** `protectBaseline` (Standard an) plus
  Perturbations-Gewicht halten bestehende Belegungen und manuelle Edits beim
  Re-Planen stabil.
- **Neue Studio-Regler:** Fairness-Gewicht, Stabilität (Änderungen
  minimieren), Minimal-Perturbation-Gewicht, Relaxationstiefe und
  „MUS automatisch relaxieren“ – alle mit erklärenden Tooltips; jede
  Studio-Einstellung trägt jetzt eine Erklärung (Katalog + Fallback).
- **Studio-Layout:** v9-Regler in einer **einklappbaren Sektion**
  („v9 · Exakte Engine“); der Dialog passt vollständig in den Viewport, nur
  innere Bereiche scrollen, das Algorithmus-Kommentar-Fenster scrollt intern
  und wächst nicht mehr.
- **Animation:** Der Suchkern ändert seinen **Glow je nach Ereignisfarbe**
  (rot/orange/gelb/grün) – Ereignisse mit `level` lassen die Szene in der
  passenden Farbe aufleuchten.
- **Dark-Mode-Kontraste:** Monatsplakette, Plan-Tabelle (Zellen, sticky Kopf,
  Fokus), offene Punkte, Dialogköpfe und Reiter werden im Dunkelmodus auf
  lesbare Kontraste gehoben; Überläufe in Kopfleiste, Dialogköpfen,
  Einstellungs-Reitern und Dropdown-Menüs sind behoben.
- **Korrigierte Becker-FZA-Ableitung** in `rules-core.js` wirkt konsistent in
  Audit, Statistik und Modell.

### Regelwerk v4.10

- **Neue Regel Fr-BD · Sa frei · So-BD:** Hat dieselbe Person am Freitag BD,
  ist sie am Samstag vollständig frei (kein BD, kein HG, kein RBN) und trägt
  am Sonntag erneut BD, sind beide BD-Zellen rot und **besonders
  bestätigungspflichtig** (spezieller Bestätigungstyp mit begründendem
  Kommentar). Die Prüfung erfolgt symmetrisch; graue Sperren bleiben absolut.

### Personal

- **Prof. Schäfer entfernt:** Der ausschließlich in der Abwesenheitsliste
  geführte, in keiner Rolle setzbare Eintrag ist aus dem Standard-Personalstamm
  entfernt. Gespeicherte Stände, Server-Bootstraps und Sicherungen werden beim
  Einlesen bereinigt (`RETIRED_STAFF_IDS`); historische Monatseinträge bleiben
  als externe Fixpunkte lesbar.

### Einstellungsmenü

- Der Auto-Plan-Reiter heißt jetzt **„Auto-Plan v9“** und bietet zusätzlich:
  Solver-Backend, CP-SAT-Zeitbudget, CP-SAT-Worker, Warmstart, Fairness-Profil,
  Infeasibility-Modus, Erklärungstiefe, Determinismus und
  Reparatur-nach-Änderung – alle Werte fließen in die Laufkonfiguration.

### Oberfläche und UX

- **Sichtbare v9-Bezeichnungen überall:** Ribbon, Engine-Badge, Guardrail,
  Phasentheater und Tooltips heben die Engine vollständig auf v9.
- **Studio-Layout neu:** Die Konfiguration ist zweispaltig (Parameter links,
  Obergrenzen rechts mit eigenem Scrollbereich); das Phasentheater zeigt alle
  **acht** Stufen vollständig; das Modal passt ohne eigenen Scroll in den
  Viewport; nur innere Bereiche scrollen.
- **Dunkelmodus-Kohärenz:** Farbtoken werden global auf die dunkle Palette
  abgebildet; Tabellen, Chips, Picker, Dialoge, Einstellungen, Formulare und
  die Command Bar sind durchgehend kontraststark lesbar.
- **Theme-Umschalter rein bildlich** (Sonne/Mond ohne Text).
- **Beruhigte Animationen:** Kometen, Wellen, Funken, Drift und Phasenpuls
  laufen langsamer und weicher; bei „Bewegung reduzieren“ werden sie
  vollständig angehalten.
- **Exakte Phasen sichtbar:** CP-SAT läuft auch in den Modul-Workern; die
  Laufansicht durchläuft alle acht Phasen mit sichtbarem Pacing und meldet
  Perfektionsbeweis beziehungsweise Zertifizierung.

### BugHunt

- 402 Modultests und 41 Browsertests grün; E2E-Verträge auf den v9-Stand
  gehoben (Revision, Ribbon-Identität, Scroll-Vertrag des Studios).

## 12. Release 0.9.0

### Neu

- **Hybride exakte Engine v9:** CP-SAT (WebAssembly) als Lösungskern mit
  Warmstart-Hint und vollständigem Heuristik-Fallback;
- **lexikografische exakte Suche:** Maximin-Fairness zuerst, dann die weichen
  Ziele in der Reihenfolge des Optimierungsschwerpunkts;
- **Optimalitätsnachweis:** OPTIMAL-Status mit beweisbarer unterer Schranke
  und Zertifizierung des Plans;
- **MUS-artige Ursachenanalyse** bei Unzulässigkeit, optional mit
  schrittweiser Relaxierung von Constraint-Gruppen;
- **Determinismus:** abgeleitete Seeds für CP-SAT und Heuristik;
- **Exaktheitsnachweis-Panel** im Studio mit Status, Schranke, Phasenspur
  und Konfliktursachen;
- **zehn neue Studio-Regler** (Solver-Backend, Exaktheit, CP-SAT-Zeitbudget
  und -Worker, Warmstart, Fairness-Profil, Determinismus, Infeasibility-Modus,
  Reparatur-nach-Änderung, Erklärungstiefe) mit erklärenden Tooltips;
- **erklärende Tooltips an jeder Stelle** des Studios (inklusive Ergebnis-
  und Laufansicht);
- **Layout:** Der Studio-Dialog passt vollständig in den Viewport; nur innere
  Bereiche scrollen. Das Algorithmus-Kommentar-Fenster wächst nicht mehr,
  sondern scrollt intern;
- **Dark-Mode-Kontraste** für Badges, Tabellen, Karten und Modals;
- **Start im hellen Erscheinungsbild**; der Theme-Umschalter ist ein reines
  Sonnen-/Mond-Piktogramm;
- **COOP/COEP-Header** in `_headers` für multithreaded WebAssembly;
- **Animations-Politur:** Suchstrahl-Sheen, Phasenpuls und gleitende
  Logzeilen.

### Behoben und gehärtet

- v9 erhält den vollständigen öffentlichen Vertrag der Engine
  (Konfiguration, Fingerprints, Übernahmeprüfung, Heuristik-Parameter);
- der Heuristik-Fallback meldet Abschlüsse genau einmal;
- die v9-Konfigurationsfelder sind fingerprint-stabil und idempotent
  normalisiert;
- CP-SAT-Ergebnisse durchlaufen immer den Regelengine-Schlussaudit;
- fehlende Solver-Bindung (kein WASM/COOP-COEP) degradiert kontrolliert auf
  die v8.5-Heuristik.

---

## 12. Grenzen

- Eine vollständige Null-Rot-Belegung kann mathematisch unmöglich sein.
- Die Zertifizierung beweist lokale Optimalität für die vollständig geprüften
  Nachbarschaften; bei CP-SAT-OPTIMAL zusätzlich globale Optimalität des
  Modells. Da das CP-Modell eine Suchhilfe der Regelengine ist, bleibt der
  fachliche Schlussaudit die maßgebliche Instanz.
- Mehr Zeit und mehr Worker erhöhen die Suchtiefe, garantieren aber keinen
  globalen Optimalitätsbeweis der Regelengine.
- RBN und zweite RBN bleiben manuell.
