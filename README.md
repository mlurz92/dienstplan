# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.9.5`  
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** Algorithmus `v9.5` — *Correct Boolean Matheuristic Observatory*  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Workers KV · Browser-Worker

DienstplanRAD verbindet kontrollierbare manuelle Monatsplanung mit einer bestätigungspflichtigen automatischen Komplettierung offener **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben unveränderliche Fixpunkte. RBN und zweite RBN werden weiterhin manuell geplant.

---

## 1. Funktionsumfang

- tabellarische Monatsansicht mit BD, HG, erster und zweiter RBN;
- regelgestützte Kandidatenlisten mit Grün, Gelb, Orange, Rot und Grau;
- vollständig begründete Empfehlungen und Konflikte;
- Abwesenheiten, Dienstwünsche, Optionen, Notizen und Ausnahmebestätigungen;
- Monatsstatistik, Sollvergleich, Wochenendäquivalente und offene Punkte;
- Excel-/JSON-Import sowie Excel-/PDF-/JSON-Export;
- server-first Synchronisierung mit lokaler Browser-Sicherung;
- Auto-Plan Studio für Konfiguration, Live-Beobachtung, Vorschlagsprüfung und atomare Übernahme;
- Auto-Plan v9.5 mit korrektem Boolean-CP-SAT-Modell, v8.5-Warmstart, Constraint-LNS und Regelengine-Schlussaudit.

## 2. Unveränderliche Planungsgrundsätze

1. Die produktive Regelengine ist die einzige fachliche Wahrheitsquelle.
2. Auto-Plan verändert ausschließlich zuvor leere BD-/HG-Felder des sichtbaren Monats.
3. Bereits gesetzte BD/HG, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
4. Graue beziehungsweise technisch nicht wählbare Besetzungen sind in jeder Stufe ausgeschlossen.
5. Personengebundene BD-, HG- und Gesamtobergrenzen gelten in Konstruktion, exakter Suche, LNS, Reparatur und Schlussaudit.
6. Rote Abweichungen sind ausschließlich als ausdrücklich freigegebener und anschließend bestätigungspflichtiger Fallback zulässig.
7. Bis zur bewussten Übernahme erfolgt keine Mutation des Monatsplans.
8. Vor der Übernahme wird der vollständige Vorschlag erneut gegen den dann aktuellen Monatszustand auditiert.
9. `FEASIBLE` bedeutet ausschließlich „zulässige Lösung gefunden“ und niemals „Optimalität nachgewiesen“.
10. Ein v9.5-Modellnachweis gilt nur, wenn jede ausgeführte lexikografische Phase `OPTIMAL` ist und der Regelengine-Audit bestanden wurde.

---

## 3. Auto-Plan v9.5

### 3.1 Warum v9.5 erforderlich ist

Die v9 verwendete pro offenem Dienstfeld eine ganzzahlige Variable, deren Zahlenwert eine Person repräsentierte. Für einfache Gleichheits- und Ungleichheitsregeln war das verwendbar. Personenbezogene Summen wie BD-Obergrenze, Sollabweichung, Wunscherfüllung oder Wochenendlast dürfen jedoch nicht die numerischen Personenkennungen summieren.

v9.5 ersetzt dieses Modell vollständig durch **Boolean-Zuordnungsvariablen**:

```text
x[Datum, Rolle, Person] = 1
⇔
Person übernimmt das BD- oder HG-Feld
```

Dadurch zählen Obergrenzen, Ziele und Belastungen ausschließlich die Zuordnungen der betreffenden Person. Personalreihenfolge und interne Kennungen besitzen keine mathematische Bedeutung mehr.

### 3.2 Verbindliche Pipeline

```text
Fixpunkte und Regelzustand
  → v8.5-Heuristikportfolio als schneller regelgeprüfter Warmstart
  → solverunabhängiges Boolean-Modell
  → strikte lexikografische CP-SAT-Phasen
  → constraint-gesteuerte Large-Neighborhood Search
  → vollständiger Regelengine-Schlussaudit
  → Schwerpunktalternativen
  → ehrlicher Nachweisstatus
```

Die Pipeline ist bewusst hybrid:

- **v8.5** liefert schnell einen vollständigen Incumbent und bleibt vollständiger Fallback;
- **CP-SAT v9.5** löst das mathematisch korrekte Boolean-Modell;
- **Constraint-LNS** optimiert gezielt schwierige Teilbereiche;
- **Regelengine-Audit** entscheidet letztlich nach der produktiven Zielordnung;
- **Alternativen** zeigen nachvollziehbare Schwerpunktvarianten, ohne Sicherheitsziele zu umgehen.

### 3.3 Boolean-Modell

Für jedes offene Dienstfeld und jede tatsächlich wählbare Person wird eine Binärvariable erzeugt. Nicht qualifizierte, inaktive oder technisch gesperrte Personen erhalten keine Variable.

Abgebildet werden unter anderem:

- genau eine Person je offenem BD-/HG-Feld;
- keine gleichzeitige BD-/HG-Zuweisung derselben Person am selben Tag;
- keine direkt aufeinanderfolgenden BD;
- kein eigener HG Montag bis Donnerstag vor eigenem BD am Folgetag;
- Aktivität, Qualifikation und Abwesenheit über die produktive Kandidatenbewertung;
- personengebundene BD-, HG- und Gesamtobergrenzen;
- BD-Sollabweichung je Person;
- maximale und gesamte Sollabweichung;
- Spannweite der kombinierten Belastung;
- Spannweite der Wochenendbelastung;
- echte Wunscherfüllungsindikatoren;
- positive Regel-Empfehlungen;
- weiche Vermeidung der Kombination **Freitag-BD · Samstag frei · Sonntag-BD** derselben Person.

Jede Nebenbedingung besitzt eine stabile technische Kennung und einen fachlichen Erklärungstext. Das Modell kann ohne konkrete Solverbibliothek aufgebaut, fingerprinted und in Node getestet werden.

### 3.4 Lexikografische Zielordnung

Die v9.5-Phasen werden nacheinander optimiert. Ein optimaler Wert wird für folgende Phasen als Gleichheit fixiert.

Standardreihenfolge:

1. bestätigbare rote Ausnahmen;
2. orange Hinweise;
3. gelbe Hinweise;
4. maximale BD-Sollabweichung;
5. gesamte BD-Sollabweichung;
6. geteilte Freitag-/Sonntag-BD-Wochenenden;
7. Spannweite der kombinierten Belastung;
8. Spannweite der Wochenendbelastung;
9. nicht erfüllte Wünsche;
10. positive Regel-Empfehlungen.

Der sichtbare Optimierungsschwerpunkt kann die Reihenfolge der nachrangigen Ziele verändern. Die Sicherheitsziele bleiben unverändert vorrangig.

### 3.5 Nachweisstatus

v9.5 unterscheidet ausdrücklich:

| Status | Bedeutung |
| --- | --- |
| `MODEL_OPTIMAL_AUDITED` | Alle ausgeführten Modellphasen waren `OPTIMAL`, alle früheren Werte wurden fixiert, Regelengine-Audit bestanden, keine rote Ausnahme. |
| `BEST_FOUND_FEASIBLE` | Zulässiger und regelgeprüfter Stand, aber kein vollständiger Optimalitätsnachweis. |
| `HEURISTIC_WON_RULE_OBJECTIVE` | Das v8.5-Ergebnis war nach produktiver Regelengine besser als der exakte Modellkandidat. |
| `MODEL_OPTIMAL_AUDIT_NOT_CLEAN` | Modellstatus optimal, aber der produktive Audit erlaubt keine Zertifizierung. |
| `SOLVER_UNAVAILABLE_FALLBACK` | WASM-Solver nicht verfügbar oder bewusst deaktiviert; v8.5 lieferte den Vorschlag. |

Der Begriff „optimal“ bezieht sich ausschließlich auf das versionierte v9.5-Boolean-Modell. Die produktive Regelengine bleibt die fachlich maßgebliche Instanz.

### 3.6 Constraint-LNS

Nach der globalen CP-SAT-Suche löst v9.5 gezielt große Nachbarschaften neu. Der überwiegende Teil des Plans wird fixiert, ein fachlich relevanter Ausschnitt freigegeben und erneut lexikografisch gelöst.

Operatoren:

- geteilte Freitag-/Sonntag-Wochenenden;
- über- oder unterbelastete Personen;
- zusammengehörige Wochenendblöcke;
- deterministisch diversifizierte Zufallsnachbarschaften.

Nur objektiv bessere, vollständig auditable Monatsstände werden übernommen. Anzahl der Runden und typische Nachbarschaftsgröße sind im Studio einstellbar.

### 3.7 Schwerpunktalternativen

Zusätzlich zum Hauptvorschlag können bis zu drei weitere regelgeprüfte Varianten erzeugt werden:

- Wünsche priorisiert;
- Wochenenden priorisiert;
- Belastung priorisiert.

Jede Variante zeigt Fairness, Wunscherfüllung, Wochenendvarianz, Hinweise und Zahl der Änderungen. Doppelte Belegungen werden anhand des Zuordnungsfingerprints entfernt.

### 3.8 Konfliktdiagnose

Bei nachgewiesener Unzulässigkeit prüft v9.5, welche Regelgruppen zur Unzulässigkeit beitragen. Das Ergebnis wird bewusst als **Konfliktkern-Annäherung** bezeichnet, solange die verwendete Browserbindung keinen mathematisch minimalen Kern nachweist.

Angezeigt werden:

- betroffene Regelgruppen;
- konkrete Constraint-IDs;
- fachliche Erklärungstexte;
- strukturelle Widersprüche, die bereits ohne Suche feststehen.

### 3.9 Solver und Fallback

Ladereihenfolge:

1. lokales `/vendor/or-tools-wasm/cp-sat/index.js`, sofern beim Deployment bereitgestellt;
2. versionsfixiertes `or-tools-wasm@0.9.1`;
3. versionsfixiertes `cpsat-js@1.0.0` als Single-Thread-Fallback;
4. vollständige v8.5-Heuristik ohne WASM.

Nach dem Laden führt v9.5 einen kleinen Solver-Selbsttest aus. Eine Bindung wird erst verwendet, wenn sie eine bekannte Binärinstanz korrekt löst.

Die Anwendung bleibt daher auch bei gesperrtem CDN, fehlender Cross-Origin-Isolation, nicht unterstütztem WebAssembly oder Solverfehler vollständig funktionsfähig.

---

## 4. v8.5-Warmstart und Heuristikfallback

Die bewährte v8.5-Pipeline bleibt unverändert verfügbar:

```text
Fixpunkte/Domänen
  → striktes Konstruktionsportfolio
  → profilabhängige Null-Rot-Intensivierung
  → Minimal-Rot-Fallback erst nach ausgeschöpfter strikter Suche
  → iterative Einzel-, Tausch-, Ketten- und lokale Reparatur
  → adaptive ALNS-Perfektion
  → vollständige lokale Nachbarschaftsprüfung
```

Gekoppelte Profile:

| Profil | Reparaturrunden | lokales Neuplanungsbudget | Late Acceptance | strikte Wellen | Rescue-Breite |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ausgewogen | 4 | 4.000 | 300 | 2 | 148 % |
| Intensiv | 6 | 6.500 | 500 | 3 | 180 % |
| Exhaustiv | 8 | 10.000 | 900 | 4 | 225 % |

Im Workerportfolio laufen mehrere Heuristikvarianten. Nur der führende Perfektionsstrang startet den globalen mehrthreadigen CP-SAT-v9.5-Pfad. Dadurch werden keine verschachtelten Solverportfolios erzeugt und das zentrale CPU-Budget bleibt kontrollierbar.

---

## 5. Auto-Plan Studio

### 5.1 Basis- und Expertenparameter

Das bestehende Studio bleibt kompatibel und wurde additiv um v9.5 ergänzt.

Wesentliche v9/v9.5-Felder:

- Solverbackend;
- strikter Modellnachweis oder bester gefundener Stand;
- CP-SAT-Gesamtbudget;
- Solverthreads;
- Heuristik-Warmstart;
- Fairnessprofil;
- deterministische beziehungsweise variable Suche;
- Konfliktdiagnose;
- Reparatur nach manueller Änderung;
- lokale Erklärungstiefe;
- LNS-Runden;
- LNS-Nachbarschaftsgröße;
- Zahl der Vorschlagsvarianten;
- Gewicht der Split-Wochenend-Vermeidung;
- optionales technisches Solverprotokoll;
- personengebundene BD-, HG- und Gesamtobergrenzen.

Sämtliche Erklärungen entstehen lokal aus Regel-, Modell- und Solvertelemetrie. Die frühere optionale LLM-Erklärung wurde entfernt; v9.5 benötigt keinen kostenpflichtigen KI-Dienst.

### 5.2 Tooltips und Tastaturbedienung

`js/rich-tooltip-v8-5.js` stellt zentral bereit:

- Maus und Tastaturfokus;
- `role="tooltip"`;
- Verknüpfung über `aria-describedby`;
- Schließen mit `Escape`;
- automatische Positionierung innerhalb des Viewports;
- native `title`-Fallbacks bei deaktivierten Rich Tooltips.

Die v9.5-Schicht versieht explizit oder abgeleitet unter anderem folgende Elemente mit Erklärungen:

- alle Formularfelder, Regler, Ausgaben und Schaltflächen;
- Phasen- und Fortschrittsanzeige;
- Laufmetriken und Algorithmus-Kommentar;
- Tabellenüberschriften, Statusbadges und Zuordnungszellen;
- Nachweisstatus, Zielphasen, LNS-Runden und Konfliktkern;
- Vorschlagsalternativen und Übernahmestatus.

### 5.3 Modal-Fit-Layout

Das Studio-Modal selbst scrollt nicht. Es besteht aus:

```text
fester Kopf
  → intern scrollender aktiver Arbeitsbereich
  → feste Fußleiste
```

Intern scrollen ausschließlich:

- Konfiguration;
- Laufansicht;
- Ergebnis;
- Algorithmus-Kommentar;
- breite Tabellen bei kleinen Viewports horizontal.

Das Kommentarfenster besitzt eine feste, viewportabhängig begrenzte Höhe und wächst nicht mit neuen Einträgen. `min-width: 0`, `min-height: 0`, responsive Grids und explizite Überlaufcontainer verhindern abgeschnittene oder überlagerte Elemente.

Unter 760 px wird das Layout einspaltig, unter 420 px nutzt das Studio die gesamte dynamische Viewportfläche.

### 5.4 Algorithmusanimation

Die Animation reagiert auf reale Phasenereignisse:

- Warmstart: klassisches Suchportfolio;
- Modellbau: bewegtes Constraint-Raster;
- CP-SAT: pulsierender exakter Suchorbit;
- LNS: expandierende Nachbarschaftswellen;
- Audit/Nachweis: grüner Prüf- und Zertifizierungsimpuls;
- Fortschrittsstreifen und gleitend eintreffende Kommentarzeilen.

Animiert werden ausschließlich compositorfreundliche Eigenschaften wie `transform` und `opacity`. Die Animation beeinflusst weder Solverzustand noch Zielordnung.

### 5.5 Hell-/Dunkelmodus

- Standardstart ist **Light Mode**, sofern kein gespeicherter Nutzerwunsch existiert.
- Der Command-Bar-Umschalter besteht ausschließlich aus Sonne beziehungsweise Mond; die Bezeichnung bleibt nur für assistive Technologien erhalten.
- Monatsfarben bleiben Akzentquelle.
- Dark Mode verwendet solide kontrastreiche Flächen für Eingaben, Badges, Modals, Zuordnungszellen und Tabellen.
- Statusfarben besitzen eigene Vorder-/Hintergrundpaare für Grün, Gelb, Orange, Rot und Grau.
- `prefers-contrast: more` und Forced Colors werden berücksichtigt.

Der frühere anwendungsspezifische Modus „Reduzierte Bewegung“ bleibt entfernt.

---

## 6. Ausführung und Performance

- rechenintensive Konstruktion und Perfektion laufen in Modul-Web-Workern;
- das Workerportfolio reserviert Prozessorkapazität für Oberfläche und Browser;
- nur ein führender Strang führt den globalen v9.5-CP-SAT-Pfad aus;
- bei Cross-Origin-Isolation sind adaptiv bis zu vier Solverthreads möglich;
- ohne Isolation wird CP-SAT auf einen Thread begrenzt;
- harte Cancellation erfolgt durch Terminierung des betreffenden Workers;
- visuelle Aktualisierungen verwenden `requestAnimationFrame()` beziehungsweise echte Fortschrittsereignisse;
- Regelbewertungen, Zählwerke und Fingerprints werden wiederverwendet;
- DOM-Beobachter arbeiten idempotent und reagieren nur auf relevante Änderungen;
- große Tabellen und Ergebnisbereiche verwenden kontrolliertes Containment und interne Scrollcontainer.

Die GPU wird nicht als Solver verwendet: Das Regelwerk ist verzweigungsreich, objektbasiert und muss mit der produktiven JavaScript-Regelengine identisch bleiben.

---

## 7. Datenhaltung und Cloudflare

### 7.1 Architektur

- **Cloudflare Pages:** statische Anwendung, CSS, JavaScript, Icons und optionale WASM-Assets;
- **Pages Functions:** Bootstrap, Monatsdaten, Personal, RBN-Namen, Einstellungen, Import/Export und Service Worker;
- **Workers KV:** gemeinsame persistente Datenstände;
- **Browser:** lokale Sicherung, ausstehende Änderungen und Studiokonfiguration;
- **Web Worker:** sämtliche rechenintensive Auto-Plan-Suche.

`_routes.json` begrenzt Pages-Functions-Aufrufe auf `/api/*` und `/sw.js`. Statische JavaScript-, CSS-, JSON-, Icon- und Vendor-Assets lösen keine Function-Invocation aus.

### 7.2 KV-Konsistenz

Workers KV ist eventual consistent. Deshalb verwendet die Anwendung:

- Revisionsstände;
- server-first Laden;
- Dirty-Marker für lokale Änderungen;
- Wiederabgleich vor beziehungsweise nach Schreibvorgängen;
- atomare Übernahme des vollständigen bestätigten Monats statt Speicherung einzelner Solveriterationen.

Zwischenlösungen, Suchbaum, LNS-Runden und Fortschrittslogs werden nicht in KV geschrieben.

Für echte kollaborative Gleichzeitigkeit mit streng atomarem Read-Modify-Write wäre zukünftig ein Durable Object oder eine transaktionale Datenbank erforderlich. Der aktuelle KV-Betrieb ist auf seltene bestätigte Monatswrites ausgelegt.

### 7.3 Sicherheits- und Cacheheader

`_headers` setzt unter anderem:

- `X-Frame-Options: SAMEORIGIN`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- restriktive `Permissions-Policy`;
- `Cross-Origin-Opener-Policy: same-origin`;
- `Cross-Origin-Embedder-Policy: require-corp`.

Vendorassets können langfristig immutable gecacht werden; Anwendungsmodule bleiben revalidierbar.

---

## 8. Import, Export und Sicherung

Unterstützt werden:

- Import des Jahresplaners beziehungsweise kompatibler Excel-Daten;
- JSON-Import und -Export vollständiger Anwendungsdaten;
- Excel-Export des Monatsplans und der Statistik;
- PDF-/Druckausgabe;
- Browser-Sicherung bei vorübergehend nicht erreichbarem Backend;
- serverseitiger Export-/Importpfad über Pages Functions.

Vor Importen werden Daten normalisiert und validiert. Bestehende Fixpunkte und Revisionsinformationen bleiben Bestandteil des Monatsobjekts.

---

## 9. Lokale Entwicklung

Voraussetzungen:

- Node.js 24;
- npm;
- für Browsertests ein von Playwright installierter Chromium-Browser.

```bash
npm ci
npm run check
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

Vollständiges Gate:

```bash
npm run verify
```

Gezielte v9.5-Prüfungen:

```bash
npm run test:v9.5
npm run test:e2e:v9.5
npm run verify:v9.5
```

Cloudflare Pages wird aus dem Repository-Root gebaut. Das KV-Binding lautet `DIENSTPLAN_KV`.

---

## 10. Tests

### 10.1 Modultests

- Regelengine und Regelberichte;
- Imports, Exporte und Persistenz;
- Toolbar-Dichtestufen;
- Fixpunktschutz, Grenzen und Zielordnung;
- Workerbudget und Portfoliovergleich;
- v8.5-Phasenvertrag und Fallback-Reihenfolge;
- v9-Kompatibilitätsverträge;
- v9.5-Boolean-Variablen und Coverage;
- personengebundene Grenzterme;
- Invarianz gegenüber Personalreihenfolge;
- Wunscherfüllungsvariablen;
- Freitag-/Sonntag-Split-Wochenende;
- strikte Unterscheidung `FEASIBLE`/`OPTIMAL`;
- vollständige phasenweise Zertifizierung;
- Solverparameter und versionsfixierte Loaderreihenfolge;
- Studio-, Tooltip-, CSS- und Importverträge.

### 10.2 Browsertests

- vollständiger Abschluss des Browser-`load`-Ereignisses;
- responsiver Event Loop nach späten DOM-Einbauten;
- Monatsplanung, Picker, Batch-Verwaltung und Druck;
- Toolbar ohne Überlagerungen oder Horizontal-Scroll;
- Auto-Plan Studio und Vorschlagstabelle;
- Abbruch- und Fallbackpfade;
- Theme-Persistenz;
- standardmäßiger Light Mode;
- rein pictografischer Theme-Umschalter;
- tastaturfähige Rich Tooltips;
- v9.5-Modal-Fit bei 340 px;
- keine Feldüberlagerungen;
- feste Höhe und internes Scrollen des Kommentarfensters;
- interne Ergebnisnavigation ohne Modal-Scroll;
- Dark-Mode-Kontrastmessungen für Eingaben, Tabellen, Badges und Zuordnungszellen.

### 10.3 CI

GitHub Actions führt aus:

```text
npm ci
npm run check
npm test
Playwright Chromium installieren
npm run test:e2e
Diagnostikartefakte sichern
```

Ein Release darf erst nach vollständig grünem Gate und kontrolliertem PR-Diff nach `main` übernommen werden.

---

## 11. Projektstruktur v9.5

```text
js/auto-planner.js              öffentlicher Einstiegspunkt auf v9.5
js/auto-planner-v9-5.js         hybride Orchestrierung und Nachweisstatus
js/auto-plan-model-v9-5.js      solverunabhängiges Boolean-Zuordnungsmodell
js/auto-plan-solver-v9-5.js     CP-SAT-Adapter, Lexikografie, LNS, Diagnose
js/auto-planner-v9.js           Legacy-v9-Kompatibilitätsschicht
js/auto-plan-cp-sat.js          Legacy-v9-CP-SAT-Brücke
js/auto-planner-v8-5.js         Warmstart, Null-Rot-Eskalation und Fallback
js/auto-plan-runner.js          Workerportfolio und Ergebnisvergleich
js/auto-plan-worker.js          Konstruktion und Perfektion im Web Worker
js/auto-plan-studio-v9-5.js     Regler, Tooltips, Nachweis und Animation
js/auto-plan-studio-v9.js       kompatible v9-Studio-Grundschicht
js/auto-plan-studio-v8-5.js     Studio-Grundaufbau und Ergebnisdarstellung
auto-plan-studio-v9-5.css       Modal-Fit, Kontrast und Phasenanimation
auto-plan-studio-v9.css         kompatible v9-Stile
auto-plan-studio-v8-5.css       Studio-Basisstile
js/app-theme-v8-5.js            Light-/Dark-Controller, Standard Light
js/rich-tooltip-v8-5.js         zentrale ARIA-Rich-Tooltips
js/rules-evaluation-v2.js       HG-vor-BD und Split-Wochenendregel
_headers                         Security- und Cross-Origin-Header
_routes.json                     Pages-Functions-Routing
tests/auto-plan-v9-5.test.js    semantische v9.5-Modelltests
tests/e2e/auto-plan-v9-5.spec.js Layout-, Tooltip- und Kontrastregressionen
```

---

## 12. Release 0.9.5

### Neu

- korrektes Boolean-Zuordnungsmodell je Slot und Person;
- echte personengebundene Summen für Grenzen, Ziele und Belastung;
- strikte lexikografische CP-SAT-Suche;
- ehrliche Trennung zwischen zulässigem Stand und Modellnachweis;
- Solver-Selbsttest und versionsfixierte Loaderreihenfolge;
- constraint-gesteuerte LNS;
- bis zu vier Schwerpunktvorschläge;
- Konfliktkern-Annäherung mit konkreten Constraint-IDs;
- weiche Vermeidung von Freitag-BD · Samstag frei · Sonntag-BD;
- zusätzliche v9.5-Studioregler;
- vollständige Rich-Tooltip-Abdeckung;
- überarbeitete reale Phasenanimation;
- viewportfestes Modal mit ausschließlich internen Scrollbereichen;
- festes intern scrollendes Algorithmus-Kommentarfenster;
- kontrastreiche Dark-Mode-Flächen für Badges, Tabellen, Modals und Eingaben;
- Light Mode als Standard und Sonne-/Mond-Umschalter ohne sichtbare Schrift;
- `_routes.json` für kostenneutrale statische Pages-Assets;
- neue semantische und browserbasierte Regressionstests.

### Behoben und gehärtet

- numerische Personenindizes werden nicht mehr als Dienstanzahl summiert;
- Wunscherfüllung verwendet keine Abstände zwischen Personenkennungen;
- `FEASIBLE` kann keinen Optimalitätsnachweis mehr erzeugen;
- jede Zielphase muss für einen Nachweis `OPTIMAL` sein;
- der globale CP-SAT-Pfad wird nicht mehrfach verschachtelt in jedem Heuristikworker ausgeführt;
- `cpsat-js` verweist auf die tatsächlich unterstützte Version `1.0.0`;
- Paketmanifest und Lockdatei sind wieder `npm ci`-konsistent;
- Konfliktdiagnose behauptet keine unbelegte Minimalität;
- lange Studioinhalte erzeugen keine abgeschnittenen Fußleisten oder überlagerten Felder.

---

## 13. Grenzen und bewusste Entscheidungen

- Eine vollständige Null-Rot-Belegung kann fachlich oder mathematisch unmöglich sein.
- Ein Modellnachweis gilt für das versionierte v9.5-Boolean-Modell; der produktive Regelengine-Audit bleibt entscheidend.
- Mehr Zeit und mehr Threads erhöhen die Chance auf einen stärkeren Stand, garantieren bei `FEASIBLE` aber keine Optimalität.
- Die aktuelle Browser-Solverbindung ist eine Community-WASM-Bindung. Die Adapter- und Selbsttestschicht verhindert, dass eine inkompatible Bindung still verwendet wird.
- Ohne lokal bereitgestelltes Vendorartefakt benötigt der exakte Pfad Zugriff auf eine der versionsfixierten CDN-Quellen. Die Heuristik funktioniert vollständig offline beziehungsweise ohne Solver.
- KV bietet keine streng atomare globale Transaktion. Für seltene bestätigte Monatswrites mit Revisionsprüfung ist das akzeptabel; echte kollaborative Echtzeitbearbeitung würde eine stärker konsistente Speicherkomponente erfordern.
- RBN und zweite RBN bleiben manuell.

<!-- v95-toolchain -->
## 17. Build-, Typ- und Testwerkzeuge v9.5

Die Produktionsanwendung bleibt frameworkfrei. Ein schmaler, reproduzierbarer Build-Layer erzeugt ausschließlich deploybare Browser-Abhängigkeiten und prüft die typisierten Solvergrenzen.

| Baustein | Version | Aufgabe | Lizenz |
| --- | ---: | --- | --- |
| `or-tools-wasm` | `0.9.1` | primärer CP-SAT-WebAssembly-Kern im Modul-Worker | Apache-2.0 |
| `cpsat-js` | `1.0.0` | kostenfreier, einsträngiger CP-SAT-Laufzeitfallback | MIT |
| Vite | `8.1.5` | deterministischer ESM-Build für lokal ausgelieferten Vendorcode | MIT |
| TypeScript | `7.0.2` | strikte Typprüfung der Solver-, Zertifikat- und Vendorgrenzen | Apache-2.0 |
| `fast-check` | `4.9.0` | Property-Based Tests mathematischer Invarianten | MIT |
| Floating UI DOM | `1.8.0` | kollisionsfreie, viewportgebundene Rich-Tooltip-Positionierung | MIT |
| Playwright | `1.61.1` | Browser-, Layout-, Theme- und Workerregressionen | Apache-2.0 |

### Reproduzierbarer Build

```bash
npm ci
npm run build
```

`npm run build` führt nacheinander aus:

1. Tree-Shaking von Floating UI zu `vendor/floating-ui/floating-ui-dom.js`;
2. strikte TypeScript-Prüfung der Solver-API und Ergebnisverträge ohne Emit.

Der vollständige Browser-Build von `or-tools-wasm` enthält mehrere WASM-Laufzeitvarianten und überschreitet die 25-MiB-Grenze eines einzelnen Cloudflare-Pages-Assets. Der Worker lädt deshalb die exakt gepinnte freie Version `or-tools-wasm@0.9.1` über jsDelivr; bei Lade- oder Kompatibilitätsfehlern folgen `cpsat-js@1.0.0` und anschließend die vollständig lokale v8.5-Heuristik. Es gibt keine kostenpflichtige Solver- oder Serverabhängigkeit.

Für Cloudflare Pages lautet der Build-Befehl `npm run build`; das Ausgabeverzeichnis bleibt das Repository-Root.

### Qualitätsprüfungen

```bash
npm run check
npm run typecheck
npm test
npm run test:e2e
```

Die Property-Based Tests prüfen insbesondere:

- Unabhängigkeit des mathematischen Modells von der Personalreihenfolge;
- ausschließlich personenbezogene Summation von BD-Obergrenzen;
- binäre, linear gewichtete Split-Wochenendindikatoren;
- reproduzierbare Seeds und schrumpfbare Gegenbeispiele.

