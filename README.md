# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.10.5`  
> **Regelwerk:** Eignungsregeln `v4.11`  
> **Auto-Plan:** Algorithmus `v10` — *Exact Boolean Rostering Core* (boolesches CP-SAT-Modell, lexikografische Leximin-Kaskade, Heuristik als Warmstart und Rückfallebene)  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Workers KV · lokale Browser-Sicherung

DienstplanRAD verbindet kontrollierbare manuelle Monatsplanung mit einer bestätigungspflichtigen automatischen Komplettierung offener **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben unveränderliche Fixpunkte. RBN und zweite RBN werden weiterhin manuell geplant.

---

## 1. Funktionsumfang

- tabellarische Monatsansicht mit BD, HG, RBN und zweiter RBN;
- regelgestützte Kandidatenlisten mit Grün/Gelb/Orange/Rot/Grau und vollständiger Begründung;
- Abwesenheiten, Dienstwünsche, Optionen, Notizen und revisionsfähige Ausnahmebestätigungen;
- Monatsstatistik, Sollvergleich, Wochenendäquivalente und offene Punkte;
- **ein Import für alle Dateien** — Excel-Mappen, PDF-Ausdrucke und
  JSON-Sicherungen über dieselbe Schaltfläche (siehe §5.2);
- Excel-/PDF-/JSON-Export — das PDF entsteht direkt als Datei
  `Dienstplan JJJJ-MM.pdf` und passt garantiert auf **eine** DIN-A4-Seite
  hochkant (siehe §5.1);
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

## 4. Auto-Plan v10 — Exact Boolean Rostering Core

### 4.1 Architektur

```text
Fixpunkte/Domänen · Fairness-Gedächtnis der Vormonate
  → Warmstart-Heuristik (v8.5-Pipeline, unverändert)
  → Modellbau: je Feld und zulässiger Person eine Binärvariable
  → lexikografische Kaskade: Stufe minimieren, Wert per Sperrschnitt
    festschreiben, Lösung als Hinweis in die nächste Stufe
  → Regelengine-Schlussaudit (einzige fachliche Wahrheitsquelle)
  → bei erreichter unterer Schranke: Optimalitätsnachweis je Stufe
  → bei Unlösbarkeit: Korrekturmengen-Diagnose in einem einzigen Lauf
  → ohne WebAssembly: die Heuristik trägt den Lauf vollständig allein
```

**Warum ein boolesches Modell.** Die Vorgängerfassung führte je offenem Feld
eine ganzzahlige Variable mit einem Personencode als Wert. In dieser Darstellung
ist „Person p hat höchstens vier Bereitschaftsdienste" linear **nicht**
ausdrückbar — die Summe von Personennummern ist keine Einsatzzahl. v10 stellt
deshalb je Paar aus Feld und zulässiger Person eine Binärvariable `y[f][p]` und
fordert `Σ_p y[f][p] = 1`. Erst damit werden Kardinalität, Fairness, Wünsche und
Stabilität überhaupt formulierbar. Auf derselben Instanz (30 Tage, 60 offene
Felder, 8 Personen) sinkt die Zahl der harten Bedingungen von 2.036 auf 684 und
die der Hilfsvariablen von 1.058 auf 47.

**Solver.** `cpsat-js` (Apache-2.0) läuft als WebAssembly im Browser, als
selbsttragendes Bündel unter `vendor/cpsat-js/dist/cpsat-portable.bundle.js`
(erzeugt über `npm run vendor:cpsat`). Der portable Build braucht **keine**
Cross-Origin-Isolation; `Cross-Origin-Embedder-Policy` entfällt dadurch und mit
ihr das Risiko, Fremdressourcen ohne CORP-Kopfzeile zu blockieren.

**Regelengine bleibt die einzige Wahrheitsquelle:** Jeder Vorschlag durchläuft
den vollständigen Schlussaudit der produktiven Engine; gewonnen wird
ausschließlich nach deren lexikografischer Zielordnung. Das Modell ist eine
Suchhilfe, kein zweites Regelwerk.

### 4.2 Ziele, Fairness und Erklärbarkeit

- **Lexikografisch statt gewichtet.** Gewichte über unvergleichbare Ziele sind
  Scheingenauigkeit — niemand kann angeben, wie viele Wunscherfüllungen eine
  Einheit Ungleichverteilung wert sind. Stattdessen wird stufenweise optimiert
  und jeder erreichte Wert festgeschrieben. Die **Rangfolge der Stufen ist im
  Studio frei sortierbar** und damit die ehrliche Form der Gewichtung.
- **Leximin über sortierte Lastvektoren.** Zuerst wird die Höchstlast gesenkt,
  dann die nächstniedrigere Stufe — umgesetzt über die Summe der Überschüsse
  oberhalb absteigender Schwellen, die lineare Form der geordneten
  Mittelwertbildung. Varianz und Summenstrafen tauschen eine sehr ungleiche
  Verteilung gegen viele kleine Abweichungen ein; Leximin tut das nicht.
- **Fairness über Monatsgrenzen.** Ein Fairness-Gedächtnis über bis zu sechs
  abgeschlossene Monate hebt den Startwert derjenigen an, die zuletzt über dem
  Mittel lagen — und entlastet sie damit in der Lastminimierung.
- **Minimal-Perturbation.** Als letzte Stufe wird die Abweichung vom
  Ausgangsvorschlag minimiert: Stabilität entscheidet Gleichstände, kostet aber
  nie Qualität.
- **Optimalitätsnachweis.** Trifft der Zielwert einer Stufe ihre bewiesene
  untere Schranke, ist sie beweisbar optimal. Das Ergebnis-Panel weist aus,
  wie viele Stufen den Nachweis erreicht haben.
- **Korrekturmengen-Diagnose.** Bei Unlösbarkeit wird jede relaxierbare
  Regelgruppe an ein Literal gebunden und die gewichtete Summe der eingehaltenen
  Gruppen maximiert. Ein einziger Lauf sagt, welche Regeln aufgegeben werden
  müssten, und liefert den zugehörigen Plan mit. Ausgewiesen wird ehrlich als
  „im Zeitbudget nachgewiesen", nicht als Minimum.
- **Reparaturlauf.** Nach einer manuellen Änderung wird ein Fenster um die
  Änderung geöffnet und alles außerhalb fixiert — exakt für das Fenster, und der
  Rest des Plans bleibt in Ruhe.
- **Verteilungskennzahlen.** Jain-Index und Gini-Koeffizient der Lastverteilung
  stehen an jedem Ergebnis, gleich ob es aus der exakten Suche oder aus der
  Heuristik stammt.
- **Determinismus.** Der Heuristik-Seed leitet sich aus Konfiguration und
  Monatszustand ab. Für die exakte Kaskade gilt: reproduzierbar, solange jede
  Stufe innerhalb ihres Budgets den Optimalitätsnachweis erreicht.

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

### 4.4 Gekoppelte Suchprofile

| Profil | Reparaturrunden | lokales Neuplanungsbudget | Late Acceptance | strikte Wellen | Rescue-Breite |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ausgewogen | 4 | 4.000 | 300 | 2 | 148 % |
| Intensiv | 6 | 6.500 | 500 | 3 | 180 % |
| Exhaustiv | 8 | 10.000 | 900 | 4 | 225 % |

Die Ableitung erfolgt in `deriveV85Tuning()`. Dadurch steuern die sichtbaren Felder tatsächlich den Solver und nicht nur die Darstellung.

### 4.5 Strikte Eskalation vor Rot

Jede Welle erhöht begrenzt:

- Beam-Breite;
- Kandidatenfächer;
- Budget des exakten Restbacktrackings.

`allowRedFallback`, `maxRedViolations` und `profileFilter` werden für sämtliche strikten Wellen hart auf Null-Rot gesetzt. Erst wenn reguläre Konstruktion und alle Wellen keine saubere Vollbelegung liefern, darf das Profil `confirmable-balanced` ausgeführt werden.

### 4.6 Adaptive Perfektion

Die v8-Basis bleibt erhalten und wird verpflichtend genutzt:

- acht Zerstörungsoperatoren;
- drei Wiederaufbauoperatoren einschließlich Regret-2;
- segmentweise adaptive Operatorgewichte;
- Late-Acceptance-Annahme;
- Luby-Neustarts;
- absteigende Nachbarschaften mit Einzelumsetzung, Paartausch, Rollentausch, Dreierkette, Tages- und Wochenendpaket;
- vollständiger Nachweis über Einzelumsetzungen, Paartausche und Tagespakete.

### 4.7 Parallelität

Die Zahl der Perfektionsstränge ist automatisch oder explizit einstellbar. Das effektive Worker-Budget bleibt das Minimum aus:

- verfügbaren logischen Kernen;
- reservierten UI-Kernen;
- Leistungsprofil;
- Gerätespeicher;
- Zahl offener Dienstfelder.

Die fachliche Regelberechnung bleibt in Web Workers identisch zur manuellen Bewertung. Es existiert keine vereinfachte zweite Regelengine.

### 4.8 Wahrheitsgetreue Laufanzeige

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

### 4.9 Auto-Plan Studio v10.5

**Sachgruppen statt Spaltenraster.** Alle Regler sind unabhängig von ihrer
Herkunft in aufklappbare Sachgruppen sortiert: *Ziele und ihre Reihenfolge*,
*Exakte Suche*, *Heuristik, Reparatur und Perfektion*, *Grenzen und Freigaben*,
*Darstellung des Laufs*. Die Gruppen sind voreingestellt offen — Einklappen ist
ein Angebot, keine Voreinstellung; der zuletzt gewählte Zustand wird lokal
gemerkt. Die Spaltenzahl folgt über Container-Abfragen dem tatsächlich
verfügbaren Platz, nicht der Fensterbreite.

**Kein Regler ohne Wirkung.** Entfallen sind die neun `cpSat*Weight`-Gewichte,
das nie umgesetzte Fairness-Profil, der beim portablen Build bedeutungslose
Worker-Regler sowie `infeasibilityMode` und `musAutoRelax`. Neu und nachweislich
wirksam:

| Regler | Wirkung |
| --- | --- |
| Rangfolge der Ziele | die lexikografische Priorität — ersetzt jede Gewichtung |
| Leximin-Tiefe | Ränge des sortierten Lastvektors, die exakt festgezurrt werden |
| HG-Gewicht in der Last | wie stark ein HG gegenüber einem BD als Belastung zählt |
| Fairness-Gedächtnis | Anzahl berücksichtigter Vormonate |
| Gewicht des Gedächtnisses | Wirkung der Vorlast auf den Startwert |
| Stabilität | Rang der Minimal-Perturbation in der Kaskade |
| Bei Unlösbarkeit | melden, Korrekturmenge anzeigen oder anwenden |
| Laufansicht | Kristallisation oder Orbit |

**Kein Feld ohne Erklärung.** Jedes Bedienelement trägt einen erklärenden
Tooltip. Wo eine frühere Fassung keinen hinterlegt hat, wird er aus Beschriftung
und Beschreibung gebildet — ein Feld ohne Erklärung gibt es nicht mehr.

### 4.10 Die Laufansicht „Kristallisation"

Die Ansicht zeigt nicht, *dass* gerechnet wird, sondern *was* gerechnet wird.
Vier Ebenen, alle aus echten Ereignissen des Laufs gespeist — nichts wird
interpoliert:

1. **Domänenfeld** — ein Raster aus Tagen und Rollen. Jede Zelle trägt anfangs
   ihre Kandidatenmenge als Fächer. Trifft eine Entscheidung ein, fallen die
   nicht gewählten Marken heraus und die gewählte rastet ein: Der Suchraum
   fällt sichtbar zusammen.
2. **Schranken-Schere** — der Zielwert der besten bekannten Lösung von oben, die
   bewiesene untere Schranke von unten. Die Fläche dazwischen ist genau das, was
   noch nicht bewiesen ist. Berühren sich beide, läuft **einmal** ein heller
   Puls über das gesamte Feld: die Kristallisation.
3. **Prioritätsleiter** — die lexikografischen Stufen als Sprossen. Eine gelöste
   Stufe schließt ihr Schloss und graviert ihren Wert ein; ein Konflikt bricht
   die Sprosse heraus.
4. **Lastwaage** — Balken je Person, aufsteigend sortiert. Leximin wird dadurch
   sichtbar, wie es arbeitet: Der kürzeste Balken hebt sich zuerst.

**Der Glanz folgt der Farbe.** Der Glow ist keine feste Größe: Wärme, Sättigung
und Helligkeit bestimmen Radius und Intensität. Ein warmer, satter Ton trägt
weiter als ein kühler, blasser; eine dunkle Farbe braucht mehr Radius, um
überhaupt zu leuchten, eine sehr helle würde sonst ausbrennen. Rote Warnungen
wirken dadurch heiß und drängend, grüne Bestätigungen ruhig, und die Monatsfarbe
bleibt in jedem Monat gleich präsent, ohne je zu schreien.

Bei `prefers-reduced-motion: reduce` entfallen Fächern und Puls; Raster, Kurven
und Balken bleiben als ruhige Zustandsanzeige. Die Orbit-Ansicht der früheren
Fassungen bleibt als Alternative wählbar.

### 4.11 Layout und Lesbarkeit als Testeigenschaft

Überlagerungsfreiheit und Lesekontrast sind keine Zusagen mehr, sondern geprüfte
Eigenschaften. `tests/e2e/layout-contrast-v10-5.spec.js` öffnet die Anwendung in
beiden Erscheinungsbildern bei 360, 768, 1024, 1440 und 1920 Pixeln — Arbeits-
fläche wie Studio — und prüft:

- **Überlauf:** Für jedes sichtbare Element, ob es innerhalb seines Elternrahmens
  liegt. Ein Element, das über seinen Rahmen hinausragt, lässt den Test fallen.
- **Kontrast:** Für jeden sichtbaren Textknoten das Verhältnis gegen den
  tatsächlich wirksamen Hintergrund — inklusive halbtransparenter Schichten —
  gegen die Schwellen der WCAG 2.1 Stufe AA (4,5:1, bei großer Schrift 3:1).

Der Test hat im Dunkelmodus 36 unlesbare Stellen aufgedeckt: fest verdrahtete
weiße Flächen aus einer Zeit ohne Dunkelmodus und die kräftige Monatsfarbe als
Schriftfarbe auf dunklem Grund — gemessene 1,3:1. Beides ist behoben; beide
Erscheinungsbilder sind bei allen fünf Breiten grün.

#### Der Layoutvertrag der drei Studiozustände

Diese erste Prüfung sah den Dialog allerdings nur im Parameterzustand — und
genau deshalb blieb unbemerkt, dass die Ergebnisansicht jede Karte auf 22 Pixel
zusammenquetschte und der fertige Monatsvorschlag unerreichbar war.
`tests/e2e/studio-layout-v10-5.spec.js` schließt diese Lücke: Er durchläuft
**Parameter, Lauf und Ergebnis** in beiden Erscheinungsbildern und prüft drei
Zusagen.

- **Nichts verschwindet.** Kein Kasten, der seinen Inhalt beschneidet, darf mehr
  Inhalt haben, als er zeigt. Zonen mit eigener Bildlaufleiste sind ausgenommen —
  dort ist der Inhalt erreichbar. Absolut positioniertes Dekor zählt nicht mit.
- **Nichts überlagert sich.** Keine zwei im Fluss stehenden Geschwister dürfen
  sich schneiden.
- **Alles bleibt lesbar,** gemessen gegen den tatsächlich wirksamen Hintergrund.

Daraus folgt der Vertrag, an dem sich die Layoutschicht ausrichtet: `min-width: 0`
gilt überall, `min-height: 0` **ausschließlich** für Zonen, die ihren Überlauf
selbst scrollen. Die automatische Mindesthöhe ist der einzige Mechanismus, der
eine Karte davor bewahrt, unter ihren Inhalt zusammenzufallen; wer sie pauschal
abschaltet, macht Inhalte unerreichbar statt sie unterzubringen.

## 5. PDF-Ausgabe

### 5.1 Ein Monat, eine Seite — als Datei, nicht als Druckauftrag

„PDF exportieren" schreibt die Datei selbst und bietet sie zum Herunterladen
an. Der frühere Weg über `window.print()` lieferte kein verlässliches
Ergebnis: Papierformat, Ränder, Kopf- und Fußzeilen und selbst die Frage, ob
Hintergrundflächen überhaupt gedruckt werden, hingen an den Einstellungen des
Druckdialogs, und den Dateinamen aus dem Dokumenttitel übernahm nicht jeder
Browser. Erzeugt wird jetzt immer dasselbe Blatt: **A4 hochkant, eine Seite**,
Datei­name immer `Dienstplan JJJJ-MM.pdf`.

Das Blatt trägt in dieser Reihenfolge:

1. **Kopf:** links zweizeilig „Bereitschaftsdienstplan" über „Monat JJJJ",
   rechts auf derselben Höhe die Bezeichnung des Monatskontrasts
   (etwa „Monatskontrast · Festival Fuchsia").
2. **Planungstabelle** mit allen Spalten: Tag, Wochentag, BD, HG, RBN, 2. RBN —
   samt Monatsfarbe, Wochenend- und Feiertagsflächen und der Feiertagszeile
   unter dem Wochentag.
3. **Statistik** darunter, bewusst reduziert auf Mitarbeitende, BD und HG,
   abgeschlossen von der Zeile „Offen".

**Wie das Dokument entsteht.** `js/pdf-document.js` ist ein minimaler
PDF-Schreiber: Rechtecke, Linien, Plaketten und Text in Helvetica und
Helvetica-Bold, Koordinaten in Millimetern mit Ursprung oben links. Mehr
braucht dieses Blatt nicht, und die Standardschriften bringt jeder Betrachter
mit — es wird deshalb weder eine Schrift eingebettet noch eine Fremdbibliothek
ausgeliefert. `js/pdf-export.js` setzt darauf das Satzbild und leitet die
Farben aus demselben Monatsprofil ab wie die Oberfläche
(`colorProfileForDate` → `spectrumVariables`). Damit ist der Export unabhängig
davon, wo der Farbverlauf auf dem Bildschirm gerade steht: Er trägt immer die
Zielfarbe des Monats, nie einen Zwischenton.

Beide Module kennen kein DOM. Der Inhalt des Blattes und das erzeugte PDF sind
deshalb in Node prüfbar — `tests/pdf-export.test.js`.

**Höhenbudget statt fester Zeilenhöhen.** Feste Zeilenhöhen in Millimetern sind
für genau einen Fall gerechnet und laufen in jedem anderen über: Mit zwölf statt
acht Mitarbeitenden brauchte ein 31-Tage-Monat 289 mm und riss auf eine zweite
Seite. Stattdessen steht je Block ein festes Budget (172 mm für den Plan, 44 mm
für die Statistik), und die Zeilenhöhe ergibt sich als Budget geteilt durch die
tatsächliche Zeilenzahl, gedeckelt auf das gewohnte Satzbild. Die Gesamthöhe ist
damit von der Zahl der Tage und der Mitarbeitenden unabhängig.

**Der Druckdialog bleibt bestehen.** Wer die Seite mit Strg+P ausgibt, bekommt
weiterhin das druckoptimierte Blatt aus `@media print` in `styles.css` — dieselbe
Regel, ein Monat auf eine Seite, mit Reserve für die von Chrome voreingestellten
Kopf- und Fußzeilen. `tests/e2e/print-single-page.spec.js` prüft beides: den
Seitenbaum des über den Druckweg erzeugten PDF für die teuersten Monate und den
Download der Schaltfläche samt Dateinamen und Inhalt.

### 5.2 Ein Import für alle Dateien

Wer eine Datei hat, will sie importieren — und nicht zuvor entscheiden, welcher
Knopf für sie zuständig ist. Die frühere Trennung in „Excel importieren“ und
„JSON laden“ ist deshalb einer einzigen Schaltfläche gewichen. Die Endung und,
wo sie lügt, die Dateisignatur entscheiden über den Weg.

| Datei | Inhalt | Übernommen wird |
|---|---|---|
| Jahresmappe `.xlsx` | zwölf Monatsblätter, Personen in Zeilen, Tage in Spalten | BD, HG und Abwesenheiten |
| Monatsplan `.xlsx` | Tag, Wochentag, BD, HG, RBN, 2. RBN | alle vier Felder |
| Monatsplan `.pdf` | derselbe Plan als Ausdruck | alle vier Felder |
| Neuroradiologie-Hintergrunddienstplan `.pdf`/`.xlsx` | Datum, Wochentag, 1. Dienst, 2. Dienst | **nur** 1. und 2. RBN |
| Sicherung `.json` | vollständiger Stand | Gesamtwiederherstellung |

**Beide Bibliotheken liegen im Repository und werden erst bei Bedarf geladen.**
Die Tabellenbibliothek hing zuvor als blockierendes `<script>` im Seitenkopf —
950 Kilobyte bei jedem Aufruf, für einen Vorgang, der die Ausnahme ist. Damit
entfällt zugleich ein Fehlerfall, den Nutzende nicht beheben konnten: Die
Meldung „Excel-Bibliothek noch nicht geladen" trat auf, während die Seite noch
lud.

**Wie ein PDF zur Tabelle wird.** Ein PDF kennt keine Tabellen, sondern
Zeichenfolgen mit Koordinaten. `js/pdf-import.js` baut daraus wieder Zeilen und
Spalten: Zeilen aus gleicher Grundlinie, Spalten aus wiederkehrenden
*Mittelpunkten*. Die linke Kante taugt dafür nicht — bei zentriertem Zelltext
wandert sie mit der Wortlänge, und ein kurzer Wochentag landet in der
Nachbarspalte. Beide Schwellen (Zeilentoleranz, Spaltenabstand) leiten sich aus
den Daten ab, nicht aus geratenen Konstanten.

Das Auslesen selbst übernimmt **pdf.js aus dem Repository** (`vendor/pdfjs/`,
Apache-2.0, 1,7 MB) — dieselbe Regel wie beim CP-SAT-WebAssembly: Was
ausgeliefert wird, liegt im Repository; das Netz ist nur die Rückfallebene. Ein
Import darf nicht daran scheitern, dass ein fremder Dienst gerade nicht
erreichbar ist. Geladen wird erst beim ersten PDF, nicht beim Start.
`npm run vendor:libs` holt beide Bibliotheken in der Fassung, die der Quelltext
festlegt — pdf.js aus `js/pdf-import.js`, SheetJS aus `js/xlsx-engine.js`.

Die Rekonstruktion dagegen ist reine Rechnerei und deshalb in Node prüfbar:
`tests/pdf-import.test.js` arbeitet mit den echten Textelementen zweier realer
Ausdrucke.

**Der Neuroradiologieplan** trägt nur die beiden Rufbereitschaften; BD und HG
kommen darin nicht vor und bleiben beim Import unangetastet. Sein Kopf nennt
den Monat als „Juli 26“ — zweistellig und damit für die Jahreserkennung
unbrauchbar. Verlässlich ist die Datumsspalte, und genau daraus kommt der Monat.

Am Verhalten nach dem Lesen ändert sich nichts: Derselbe Vorabbericht, dieselbe
Rückfrage vor dem Ersetzen bestehender Werte, dieselbe atomare Übernahme.

## 6. Performance für Windows 11 und Chrome

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

## 7. Einstellungen und Persistenz

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

## 8. Datenhaltung und Cloudflare

- **Pages:** statische Anwendung;
- **Pages Functions:** Bootstrap, Monatsdaten, Personal, RBN-Namen, Einstellungen, Import/Export;
- **Workers KV:** gemeinsame Persistenz mit versionierten Datenobjekten;
- **Browser:** Offline-Fallback und ausstehende lokale Änderungen.

KV besitzt Eventual Consistency. Die Anwendung verwendet deshalb Revisionsstände, Dirty-Marker und server-first Wiederabgleich; konkurrierende Änderungen dürfen nicht stillschweigend als identisch behandelt werden.

---

## 9. Lokale Entwicklung

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

## 10. Tests

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
- Monatsplanung, Picker, Batch-Verwaltung und PDF-Ausgabe;
- Toolbar über zahlreiche Fensterbreiten ohne Überlagerung oder Horizontal-Scroll;
- Auto-Plan Studio, Vorschlagstabelle und Abbruchpfade;
- Theme-Persistenz;
- Entfernung des Legacy-Bewegungsmodus;
- tastaturfähige Rich Tooltips;
- Übertragung des Exhaustiv-Profils in reale Laufparameter.

---

## 11. Projektstruktur v10.5

```text
js/auto-plan-model.js              Boolean-One-Hot-Modell (solverfrei, in Node testbar)
js/auto-plan-solver.js             Brücke zur CP-SAT-WebAssembly-Bindung
js/auto-planner-v10.js             lexikografische Kaskade, Leximin, MCS-Diagnose, Reparatur
js/auto-plan-crystallize.js        Kristallisations-Animation mit farbabhängigem Glow
js/auto-plan-studio-v10.js         Studio v10.5: Akkordeon, Stufenrangfolge, Tooltips
js/auto-plan-studio-v9.js          Regler der Vorgängerstufe, Exaktheitsnachweis
js/auto-planner-v8-5.js            Heuristik: Warmstart, Rückfallebene, Phasenvertrag
js/auto-plan-studio-v8-5.js        Profile, Phasentheater und Ergebnisprotokoll
js/app-theme-v8-5.js               persistenter Hell-/Dunkelcontroller (Start: hell)
js/rich-tooltip-v8-5.js            zentrale ARIA-Tooltips
js/ui-v8-5.js                      Command-Bar-, Bootstrap- und Performance-Integration
app-v8-5.css                       adaptive Farb- und Oberflächentoken
toolbar-v8-5.css                   rechter Theme-/Einstellungsblock
auto-plan-studio-v8-5.css          v8.5-Studiozustände
auto-plan-studio-v9.css            Modal-Fit-Layout, kollabierbare Sektion, Animation
auto-plan-studio-v10.css           Akkordeon, Laufansicht, Überlaufhärtung, Dark-Mode
vendor/cpsat-js/                   lokal ausgelieferter CP-SAT-Solver (portable, Apache-2.0)
vendor/pdfjs/                      lokal ausgeliefertes pdf.js für den PDF-Import (Apache-2.0)
vendor/sheetjs/                    lokal ausgelieferte Tabellenbibliothek (Apache-2.0)
_headers                           Cache- und Sicherheitskopfzeilen (bewusst ohne COEP)
tests/auto-plan-v8-5.test.js       Solver- und Integrationsverträge
tests/auto-plan-v10.test.js        Modell-, Kaskaden-, Leximin- und Kennzahlenverträge
tests/e2e/v8-5-shell.spec.js       Browser-, Bootstrap- und Observer-Regressionen
tests/e2e/layout-contrast-v10-5.spec.js  Überlappungsfreiheit und WCAG-AA-Kontrast
tests/e2e/studio-layout-v10-5.spec.js    Layoutvertrag der drei Studiozustände
tests/e2e/print-single-page.spec.js      Ein Monat, eine A4-Seite (gemessen am PDF)
js/pdf-document.js                       minimaler PDF-Schreiber (Flächen, Linien, Text)
js/pdf-export.js                         Satzbild des Monatsblatts und Download
js/file-import.js                        ein Eingang für Excel, PDF und JSON
js/pdf-import.js                         Textpositionen zu Tabellenzeilen (pdf.js)
tests/e2e/helpers/contrast.js            gemeinsame WCAG-Kontrastmessung
```

`js/auto-planner-v9.js` und `js/auto-plan-cp-sat.js` sind in v10.5 entfallen:
Die alte Bindung erkannte den Solver am bloßen Vorhandensein zweier Namen und
wählte deshalb stets die falsche; der exakte Pfad lief in der Auslieferung nie.
Modell, Brücke und Orchestrierung sind seither drei getrennte Module.

---

## 12. Release 0.9.1

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

### Regelwerk v4.11

- **Neue Regel „Der Tag nach einem BD ist dienstfrei":** Wer Bereitschaftsdienst
  getragen hat, ist am Folgetag für keinen weiteren Dienst verfügbar. Für den
  Bereitschaftsdienst selbst galt das bereits als harte Sperre („BD bereits am
  Vortag"); für den Hintergrunddienst fehlte die Entsprechung — er war lediglich
  orange, wenn er *vor* einem eigenen BD lag, aber ungeprüft *danach*.
  Der Hintergrunddienst am Folgetag ist damit rot und nicht wählbar.
- **Ausnahme Wochenende:** Samstag und Sonntag bleibt der Hintergrunddienst
  unmittelbar nach einem Bereitschaftsdienst zulässig. Genau darauf beruht die
  Wochenendbündelung (Fr-BD · Sa-HG und Sa-BD · So-HG). Der **Freitag zählt
  dabei nicht als Wochenende**: Ein Donnerstags-BD lässt den Freitag ebenso
  dienstfrei wie jeden anderen Werktag.
- Die Regel gilt an beiden Orten, an denen sie gelten muss: in der Regelengine,
  die verbindlich entscheidet, und als harte Bedingung im Booleschen Modell
  (`bdhg_*`, Gruppe „Ruhezeit nach Bereitschaftsdienst"). Fehlte sie im Modell,
  schlüge das Schlussaudit jeden Vorschlag zurück, ohne dass die Suche wüsste,
  warum. `tests/rest-day-after-bd.test.js` prüft beide Seiten.

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

## 13. Release 0.9.0

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

## 14. Grenzen

- Eine vollständige Null-Rot-Belegung kann mathematisch unmöglich sein.
- Die Zertifizierung beweist lokale Optimalität für die vollständig geprüften
  Nachbarschaften; bei CP-SAT-OPTIMAL zusätzlich globale Optimalität des
  Modells. Da das CP-Modell eine Suchhilfe der Regelengine ist, bleibt der
  fachliche Schlussaudit die maßgebliche Instanz.
- Mehr Zeit und mehr Worker erhöhen die Suchtiefe, garantieren aber keinen
  globalen Optimalitätsbeweis der Regelengine.
- RBN und zweite RBN bleiben manuell.
