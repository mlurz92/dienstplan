# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.8.5`  
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** Algorithmus `v8.5` — *Exhaustive Clean-Solution Observatory*  
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

Der Schalter wechselt direkt zwischen `light` und `dark`. Die Auswahl wird lokal gespeichert und vor Abschluss des Anwendungs-Bootstraps angewendet, damit kein Farbblitz entsteht.

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

## 4. Auto-Plan v8.5

### 4.1 Verbindliche Pipeline

```text
Fixpunkte/Domänen
  → striktes Konstruktionsportfolio
  → profilabhängige Null-Rot-Intensivierung
  → optionaler Minimal-Rot-Fallback nur nach ausgeschöpfter strikter Suche
  → iterative Tausch- und lokale Reparatur
  → diversifizierte ALNS-Perfektion
  → vollständige Zertifizierung
```

Perfektion und Zertifizierung sind in v8.5 verbindlich. Ein Lauf kann sie nicht mehr über eine Studio-Checkbox deaktivieren.

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
- Parallelitätslimit, Portfolio-Diversität, Rot-Obergrenze und Zertifizierungsrunden.

Das Hell-/Dunkelschema wird bewusst lokal vor dem Server-Bootstrap geladen. Die Auto-Plan-v8.5-Studiokopplung wird ebenfalls lokal gesichert; die resultierenden Solverfelder werden bei jedem Lauf erneut in die Laufkonfiguration übertragen.

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
- v8.5-Phasenvertrag, Profilableitung und Fallback-Reihenfolge.

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

## 10. Projektstruktur v8.5

```text
js/auto-planner-v8-5.js       strikte Eskalation und verbindlicher Phasenvertrag
js/auto-plan-studio-v8-5.js   Profile, Phasentheater und Ergebnisprotokoll
js/app-theme-v8-5.js          persistenter Hell-/Dunkelcontroller
js/rich-tooltip-v8-5.js       zentrale ARIA-Tooltips
js/ui-v8-5.js                 Command-Bar-, Bootstrap- und Performance-Integration
app-v8-5.css                  adaptive Farb- und Oberflächentoken
toolbar-v8-5.css              rechter Theme-/Einstellungsblock
auto-plan-studio-v8-5.css     v8.5-Studiozustände
tests/auto-plan-v8-5.test.js  Solver- und Integrationsverträge
tests/e2e/v8-5-shell.spec.js  Browser-, Bootstrap- und Observer-Regressionen
```

---

## 11. Release 0.8.5

### Neu

- monatsfarbabhängiger Hell-/Dunkelmodus in der Befehlsleiste;
- kurze Beschriftungen mit Pictogrammen und zentralen Rich Tooltips;
- gekoppelte Null-Rot-Profile;
- mehrstufige strikte Intensivierung;
- separate v8.5-Phasen- und Wellenanzeige;
- profilabhängige Parallelitäts- und Diversitätssteuerung.

### Behoben und gehärtet

- **Start-Freeze nach v8.5-Integration:** selbstverstärkende `MutationObserver`-/`textContent`-Rückkopplung entfernt;
- UI- und Tooltip-Synchronisierung idempotent sowie gegen Mehrfachinstallation geschützt;
- sichtbare Profile und Solverparameter sind direkt gekoppelt;
- Minimal-Rot-Fallback erst nach strikter Eskalation;
- Perfektion/Zertifizierung nicht mehr versehentlich deaktivierbar;
- Legacy-Modus „Reduzierte Bewegung“ entfernt;
- Toolbar-Hilfsaktionen bleiben gemeinsam am rechten Rand;
- zusätzliche Modul- und Browserregressionen.

---

## 12. Grenzen

- Eine vollständige Null-Rot-Belegung kann mathematisch unmöglich sein.
- Die Zertifizierung beweist lokale Optimalität für die vollständig geprüften Nachbarschaften, nicht globale Optimalität des gesamten kombinatorischen Problems.
- Mehr Zeit und mehr Worker erhöhen die Suchtiefe, garantieren aber keinen globalen Optimalitätsbeweis.
- RBN und zweite RBN bleiben manuell.
