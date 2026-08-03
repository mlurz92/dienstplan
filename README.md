# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.7.1`<br>
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** Algorithmus `v7.5` mit globaler Engpasssuche, wahrheitsgetreuem Portfoliofortschritt, inkrementellem Last-Ledger, adaptivem Worker-Portfolio, cost-aware ALNS, Null-Rot-Guardrail und Zertifizierung<br>
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD verbindet eine bewusst kontrollierbare manuelle Monatsplanung mit einer bestätigungspflichtigen automatischen Komplettierung aller offenen **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben unveränderliche Fixpunkte. RBN und zweite RBN werden nicht automatisch geplant.

---

## 1. Leitprinzipien

- Die produktive Regelengine ist die einzige fachliche Wahrheitsquelle.
- Auto-Plan verändert ausschließlich leere BD- und HG-Felder des sichtbaren Monats.
- Vorhandene BD/HG, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
- Während Konfiguration und Berechnung wird nichts in den sichtbaren oder gespeicherten Plan geschrieben.
- Erst **Vorschläge übernehmen** führt nach einem erneuten vollständigen Audit zu einer atomaren Monatsmutation.
- Graue beziehungsweise technisch nicht wählbare Besetzungen werden in keiner Suchstufe zugelassen.
- Harte personengebundene Laufobergrenzen gelten auch in jedem Fallback.
- Rote Abweichungen dürfen nur nach vollständig ausgeschöpfter strikter Suche und ausdrücklicher Freigabe erscheinen.
- Jede bestätigte rote Auto-Plan-Ausnahme wird revisionsfest protokolliert.

---

## 2. Funktionsumfang

### Monatsplanung

- tabellarische Monatsansicht mit BD, HG, RBN und zweiter RBN;
- regelgestützte Vorschlagslisten mit Grün/Gelb/Orange/Rot/Grau;
- vollständige Begründungen und Bestätigungspfad für rote Ausnahmen;
- Abwesenheiten, Dienstwünsche, Optionen und Freitextnotizen;
- Monatsstatistik, Sollvergleich und offene Punkte;
- Sachsen-Feiertage;
- Excel-, PDF- und JSON-Export;
- Excel- und JSON-Import;
- Cloud-Synchronisierung mit lokaler Fallback-Sicherung.

### Auto-Plan Studio

Das Studio besitzt drei getrennte Arbeitsphasen in einem einzigen durchgehend scrollbaren Dialog:

1. **Konfiguration**
2. **animierter Optimierungslauf**
3. **vollständige Prüfung und bewusste Übernahme**

Konfigurierbar sind:

- Leistungsprofil `Responsiv`, `Adaptiv` oder `Power`;
- Suchintensität `Standard`, `Tief` oder `Maximum`;
- Optimierungsschwerpunkt `Ausgewogen`, `Wünsche`, `Lastenausgleich` oder `Wochenenden`;
- Zeitrahmen der Perfektionsphase;
- iterative Reparaturrunden;
- lokales Neuplanungsbudget;
- Late-Acceptance-Fenster;
- Aktivierung der Perfektionsphase;
- Freigabe des Minimal-Rot-Fallbacks;
- maximale Zahl roter Vorschläge;
- maximale BD-, HG- und Gesamtzahl je Mitarbeitendem.

Alle Felder besitzen erklärende, tastaturfähige Tooltips. Die Mitarbeitendentabelle zeigt vorhandene Dienste und Laufobergrenzen gemeinsam. Die Konfiguration wird vor dem Start vollständig validiert.

Das Register **Ansicht** des Menübands enthält ein Zahnrad für das native Einstellungsmodal. Es verwaltet:

- Farbschema `Systemeinstellung`, `Hell` oder `Dunkel`;
- Informationsdichte und reduzierte Bewegung;
- erklärende Auto-Plan-Tooltips;
- Standard-Leistungsprofil, Suchintensität und Optimierungsfokus;
- Standard-Zeitbudget und optionale Zahl paralleler Suchläufe;
- Perfektionsphase, Rot-Fallback und Rot-Obergrenze.

Die Einstellungen verwenden Schema `v4`, werden lokal offlinefest gesichert, über den bestehenden Bootstrap-Pfad synchronisiert, in JSON-Sicherungen einbezogen und vor jeder Verwendung normalisiert. Ältere oder unvollständige Einstellungen werden defensiv ergänzt; unbekannte Theme-Werte fallen auf die Systemeinstellung zurück.

### Excel 365 Aero Workspace

Release 0.7.1 richtet die gesamte Arbeitsoberfläche an der aktuellen, dichten Informationsarchitektur von Microsoft 365 Excel aus und ergänzt sie um zurückhaltendes Aero Glass. DienstplanRAD bleibt ein eigenständiges Produkt ohne Verbindung zu Microsoft.

- Die grüne Titelleiste vereint App-Identität, Befehlssuche mit `Alt+Q`, Monatsnavigation, Speicherstatus und den Schalter zum Einklappen des Menübands.
- Sechs zugängliche Register – **Datei**, **Start**, **Planung**, **Auto-Plan**, **Daten** und **Ansicht** – ordnen jeden Produktbefehl genau einmal. `Strg+F1` klappt die Befehlsfläche ein; Pfeiltasten sowie `Pos1` und `Ende` navigieren innerhalb der Register.
- Die Befehlsfläche verwendet Excel-typische Symbol-/Beschriftungsgruppen. Import, Export, Monatsbearbeitung, Auto-Plan, Aktualisierung und Einstellungen bleiben anhand ihrer Aufgabe auffindbar.
- Eine Formelzeile zeigt den sichtbaren Monatskontext und bei Tastatur- oder Zeigerfokus die aktuell gewählte Tabellenzelle.
- Die Dienstplantabelle bleibt wie ein Arbeitsblatt vollständig deckend, präzise gerastert und auch im Dunkelmodus kontraststark. Transparenz und Unschärfe sind auf Titelbereich, Menüband und Dialograhmen begrenzt.
- Blattreiter führen direkt zu **Dienstplan**, **Statistik**, **Offene Punkte** und **Auto-Plan**; die Statusleiste hält Betriebs-, Accessibility- und Ansichtsstatus am Fensterrand sichtbar.
- `Systemeinstellung`, Hell und Dunkel teilen Struktur und Bedienlogik. Die lokale Präferenz wird vor dem ersten Paint gelesen; `color-scheme` und Browser-`theme-color` folgen dem aktiven Modus. Manifest und helle Browser-Chrome verwenden Office-Grün `#107c41`, die dunkle Browser-Chrome `#0a5f34`.
- Schmale Ansichten erhalten ein horizontal bedienbares Menüband, sticky Tag-/Wochentagsspalten und kartenförmige Statistik. Grobe Zeigegeräte erhalten mindestens 44 Pixel große Ziele.
- Picker, Sammeldialoge, Einstellungen und Auto-Plan Studio verwenden dieselbe Office-Hierarchie, semantische Statusfarben und deckende Inhaltsflächen.
- `prefers-reduced-motion`, `prefers-reduced-transparency`, `prefers-contrast` und Windows Forced Colors besitzen explizite Darstellungen. Dekorative Effekte laufen nicht dauerhaft.
- Die Druckansicht blendet Titelbereich, Menüband, Formelzeile, Blattreiter und Statusleiste aus; fachliche Monatsfarben bleiben unabhängig von den Bildschirm-Overrides.

---

## 3. Null-Rot-Guardrail v7.5

### 3.1 Eskalationsfolge

Der Algorithmus darf nicht unmittelbar von einer erfolglosen Standardsuche in rote Vorschläge wechseln.

```text
1. reguläre strikte Null-Rot-Suche
           │
           ├─ vollständig → iterative Reparatur und Perfektion
           │
           └─ nicht vollständig
                    │
                    ▼
2. adaptive Null-Rot-Rescue (aus v6 übernommen und in v7 beibehalten)
   - größerer Suchstrahl
   - breiterer Kandidatenfächer
   - höheres Backtracking-Budget
   - ausschließlich strikte Profile
                    │
                    ├─ vollständig → iterative Reparatur und Perfektion
                    │
                    └─ nicht vollständig
                             │
                             ├─ Fallback deaktiviert → keine Übernahme
                             └─ Fallback freigegeben
                                      │
                                      ▼
3. Minimal-Rot-Fallback als letzte Eskalation
```

Damit wird Rot nicht als Optimierungsabkürzung, sondern ausschließlich als nachgelagerte, bestätigungspflichtige Ausnahme behandelt.

### 3.2 Partielle Konfigurationen

`mergeAutoPlanRunConfig()` ergänzt partielle Integrations- oder Testkonfigurationen um sämtliche abgeleiteten Standardgrenzen. Relevant ist insbesondere:

- Personen ohne datumsabhängige HG-Qualifikation erhalten standardmäßig `maxHg = 0`;
- ein ausgelassener Wert (`undefined`) übernimmt den Standard;
- ein ausdrücklich gesetztes `null` hebt die zusätzliche Laufgrenze bewusst auf;
- bereits gesetzte Fixpunkte zählen auf jede Grenze;
- eine Grenze unterhalb des vorhandenen Bestands wird vor dem Lauf abgewiesen.

### 3.3 Ergebniskennzahlen

`metrics.zeroRedRescue` dokumentiert:

- ob die Rescue ausgeführt wurde;
- ob sie eine vollständige Null-Rot-Lösung fand;
- ihre Laufzeit;
- Zahl roter beziehungsweise offener Felder vor der Rescue.

Der Suchprofiltext weist die Rescue ebenfalls aus.

---

## 4. Algorithmusarchitektur v7.5

v7.5 bewahrt die fachliche Such- und Zielarchitektur von v7, härtet aber deren Ausführung, Fortschrittsmodell, Fehlerpfade und Beobachtbarkeit. Die Anzeige leitet ihren Stand ausschließlich aus echten Solver- und Portfolioereignissen ab; sie beeinflusst die fachliche Bewertung nicht.

### 4.1 Pipeline

```text
Ausgangsmonat
    │
    ├─ Constraint-Konstruktion (v7-Suchkern in v7.5)
    │   globale BD/HG-MRV · Beam Search · Forward Checking
    │   inkrementelles Belegungs-Ledger · strikte Profile
    │
    ├─ Null-Rot-Rescue v6
    │   verbreiterte Strict-Suche vor jedem Fallback
    │
    ├─ iterative Tauschreparatur
    │   Einzelumsetzung · Paartausch · Dreierkette · Tagespaket · lokale Neuplanung
    │
    ├─ Perfektionsphase (v7-Suchkern in v7.5)
    │   Adaptive Large Neighborhood Search
    │   cost-aware UCB-Operatorwahl · Ruin-and-Recreate
    │   Late Acceptance · absteigende Nachbarschaften
    │
    └─ Zertifizierung und Schlussaudit
        vollständige Einzelumsetzungen und Paartausche
```

### 4.2 Konstruktion

Die Konstruktion verarbeitet ausschließlich Slots, die im Ausgangsmonat leer waren. Anders als v6 trennt v7 die Rollen nicht mehr in „erst alle BD, dann alle HG“. Alle offenen BD- und HG-Felder konkurrieren gemeinsam um den nächsten Suchschritt. Das Feld mit der kleinsten echten Kandidatendomäne wird zuerst bearbeitet; Samstags-BD und Wochenendfelder entscheiden bei Gleichstand. Dadurch wird eine knappe HG-Ressource geschützt, bevor eine scheinbar leichte BD-Entscheidung sie verbraucht.

Für jeden Zwischenzustand werden:

- technisch nicht wählbare Kandidaten entfernt;
- strikte Profile zusätzlich von roten Kandidaten bereinigt;
- personengebundene Obergrenzen geprüft;
- die aktuell engsten Domänen bevorzugt;
- Kandidaten anhand Regelstufe, Empfehlungsvektor und Last sortiert;
- künftige Sackgassen durch Forward Checking verworfen;
- nur die besten entdoppelten Varianten im Suchstrahl behalten.

Jeder unveränderliche Suchknoten trägt zusätzlich ein **Assignment Ledger**. Die BD- und HG-Zahl jeder Person wird einmal aufgebaut und beim Erzeugen eines Nachfolgers inkrementell fortgeschrieben. Obergrenzen, BD-Sollanteile und kombinierte Lasten benötigen damit keine erneute Monatsabtastung pro Kandidat. Der Ledger ist nur eine Beschleunigungsstruktur; verbindliche Finalisten durchlaufen weiterhin die vollständige produktive Regelengine.

Die Zielordnung ist lexikografisch. Harte Kriterien dominieren jede weiche Qualität:

1. Laufobergrenzen
2. graue/nicht wählbare Einträge
3. offene Felder
4. Überschreitung der Rot-Obergrenze
5. rote Einträge
6. besonders bestätigungspflichtige rote Einträge
7. orange Einträge
8. gelbe Einträge
9. Schwerpunkt und Empfehlungsvektor
10. Wünsche
11. BD-Soll, Gesamtlast, AA-HG und Wochenenden

### 4.3 Iterative Reparatur

Nach der Konstruktion werden wiederholt geprüft:

- Einzelumsetzungen;
- Paartausche;
- Dreierketten;
- vollständige Tagespakete;
- lokale Neuplanung auffälliger Tage.

Jede Änderung muss die vollständige produktive Regelbewertung überstehen und die lexikografische Zielordnung verbessern.

### 4.4 Perfektionsphase

Die adaptive Large Neighborhood Search entfernt gezielt einen Ausschnitt der selbst geplanten Dienste und baut ihn neu auf. Verwendet werden unter anderem:

- Zufallsfelder;
- schwächste Zellen;
- Tagesfenster;
- Wochenenden;
- Personallast;
- verwandte Felder;
- Rollenblöcke;
- Sollabweichungen.

Late Acceptance erlaubt kontrollierte Zwischenverschlechterungen, während der beste gefundene Zustand separat geschützt bleibt. Die Ausschnittsgröße reagiert auf verbleibende Zeit und Stagnation.

v7 ersetzt die rein gewichtete Roulette-Auswahl der Zerstöroperatoren durch eine **cost-aware Upper-Confidence-Bound-Auswahl**:

1. jeder Operator wird mindestens einmal erprobt;
2. Qualitätsgewinn wird gegen seine tatsächlich benötigte Rechenzeit normalisiert;
3. ein Explorationsbonus hält selten verwendete Operatoren erreichbar;
4. erfolgreiche Operatoren erhalten keine pauschale Belohnung, sondern müssen ihren Aufwand im aktuellen Monat rechtfertigen;
5. Nutzung, Reward, Kosten und Reward pro Sekunde werden als Lauftelemetrie ausgegeben.

Das Lernen ist online, deterministisch seedbar und benötigt weder Trainingsdaten noch ein zweites Regelmodell.

### 4.5 Zertifizierung

Am Ende werden sämtliche Einzelumsetzungen und sämtliche Paartausche ohne Suchabkürzung geprüft. Findet sich keine Verbesserung, ist der Plan bezüglich dieser Nachbarschaften lokal optimal. Ein Zeitlimit kann einen vollständigen Nachweis verhindern; der Vorschlag bleibt dennoch vollständig regelgeprüft.

### 4.6 Fixpunktschutz

Fixpunkte sind mehrfach abgesichert:

1. Sie erscheinen nicht in der Slotliste.
2. Der Optimierer akzeptiert Änderungen nur für bekannte offene Slots.
3. Vor und nach der Perfektionsphase wird der Ausgangsmonat gegen das Ergebnis geprüft.
4. Die Übernahme lehnt zwischenzeitlich belegte Felder ab.
5. Vor dem Schreiben läuft ein vollständiger erneuter Audit.

---

## 5. Adaptive Mehrkern-Ausführung und Lebenszyklus

Der Auto-Plan läuft in Modul-Web-Workern.

- v7 berechnet vor jedem Lauf einen erklärbaren Ausführungsplan aus offenen Feldern, logischen Kernen, gemeldetem Gerätespeicher, Leistungsprofil und optionalem Nutzerlimit;
- auf speicherarmen Geräten werden Profile geordnet im selben Worker wiederverwendet;
- auf leistungsfähigen Geräten laufen unterschiedliche Suchprofile und deterministisch diversifizierte Perfektionsläufe parallel;
- ein abgestürzter Worker wird isoliert beendet und für den nächsten Portfolioauftrag frisch aufgebaut;
- der bisherige Fallback-Strang führt zuerst die adaptive Strict-Rescue aus;
- mehrere Perfektionsläufe verbessern denselben Aufbau mit unterschiedlichen deterministischen Startwerten;
- der beste Lauf gewinnt anhand derselben Zielordnung, die auch intern optimiert wird;
- je nach Gerät bleiben ein oder zwei Kerne für Anzeige, Eingabe und Animation frei;
- ohne Worker-Unterstützung fällt die Anwendung auf den Anzeigestrang zurück.

v7.5 ergänzt einen expliziten Portfolio- und Dialoglebenszyklus:

- Aufbau und Perfektion besitzen getrennte Zähler für Gesamtzahl, aktive, abgeschlossene, abgebrochene und fehlgeschlagene Läufe;
- ein einzelner schneller Worker kann nicht mehr vorzeitig 100 Prozent für das Gesamtportfolio melden;
- genau ein terminales Gesamtereignis folgt erst, nachdem das relevante Portfolio beendet ist;
- interne Worker-Abbrüche, unbekannte Antworten, Laufzeitfehler und synchrone Übertragungsfehler werden beendet oder auf den sicheren Inline-Pfad zurückgeführt, statt einen Lauf offen zu lassen;
- die getesteten Terminalpfade für Erfolg, Dialogabbruch, Workerfehler und Übertragungsfehler räumen Worker, Abbruchlistener, Überleitungszeitgeber und Visualizer zuverlässig auf;
- eine Lauf-Epoche verhindert, dass ein verspätetes Ergebnis nach Abbruch oder Neustart in den Dialog geschrieben wird;
- die 620-ms-Ergebnisüberleitung ist abbrechbar und kann keinen geschlossenen Dialog wieder mit Inhalt befüllen.

Die produktive Regelengine wird nicht dupliziert. Worker und Hauptthread importieren dieselben Module.

Die Profile `Responsiv`, `Adaptiv` und `Power` begrenzen das Portfolio auf zwei, vier beziehungsweise sechs Worker. Diese Obergrenzen werden weiter durch Speicher und Problemgröße reduziert; `navigator.hardwareConcurrency` wird ausdrücklich nicht als absolute Freigabe interpretiert. Ein explizites Parallelitätslimit begrenzt die Perfektionsläufe zusätzlich.

---

## 6. Truthful Constraint Observatory und Animation

Die v7.5-Laufansicht trennt drei messbare Größen, die frühere Versionen zu einem scheinpräzisen Prozentwert vermischt haben:

1. **Arbeitsmenge:** tatsächlich bearbeitete Dienstfelder;
2. **Portfolio:** erfolgreiche, fehlgeschlagene und regelbedingt beendete Arbeitsstränge;
3. **Qualitätsgewinn:** tatsächlich übernommene Verbesserungen.

Der Gesamtfortschritt aggregiert alle bekannten Portfolioanteile innerhalb fester Phasenfenster. Er bleibt monoton, erreicht vor einem terminalen Gesamtereignis höchstens 99 Prozent und springt nicht auf den Stand des schnellsten Workers. Bei einem Wechsel von Aufbau zu Perfektion beginnen die Portfoliozähler neu, ohne dass der sichtbare Gesamtfortschritt zurückfällt. Eine Restzeit erscheint nur innerhalb einer zeitbudgetierten Phase, die selbst ein belastbares Restbudget liefert.

Die Canvas-Visualisierung bildet den tatsächlichen Lauf ab:

- jedes BD- und HG-Feld ist ein Knoten;
- Fixpunkte leuchten von Beginn an;
- neue Entscheidungen zünden Knoten und erzeugen Kometen sowie Druckwellen;
- Kopplungsfäden stellen zeitliche und rollenbezogene Beziehungen dar;
- Aktivität, Verbesserungen und Fortschritt steuern Energie und Bewegung;
- die Farbwelt wird aus der aktuellen Monatskontrastfarbe abgeleitet;
- der zentrale Fortschrittsring entspricht dem aggregierten, beobachteten Portfoliofortschritt;
- Knoten werden ausschließlich durch reale Feldereignisse gezündet und niemals aus dem Prozentwert als vermeintlich erledigt markiert;
- ein Phasenkommentar erklärt die aktuelle Rechenstufe;
- die Verlaufslinie visualisiert Qualitätsverbesserungen;
- `prefers-reduced-motion` wird respektiert;
- die App-Einstellung „Bewegung reduziert“ wirkt auch dann, wenn das Betriebssystem keine reduzierte Bewegung meldet;
- das Observatory, der Orbit und die monatlich eingefärbte Portfolio-Leiste visualisieren Engine, Worker-Plan und aktuelle Architektur;
- Ledger-Treffer, Worker-Aufteilung und lernende Operatoren erscheinen im Ergebnisbericht.

Die Zeichenlast passt sich der Umgebung an:

- volle Darstellung: maximal etwa 30 Bilder pro Sekunde;
- bei erhöhten gemessenen Framekosten: 20 Bilder pro Sekunde und höchstens 80 Partikel statt 160;
- bei hoher Belastung: 15 Bilder pro Sekunde, vereinfachte Details und höchstens 24 Partikel;
- außerhalb des sichtbaren Bereichs oder in einem Hintergrundtab: keine dauerhafte Bildfolge;
- bei Reduced Motion, nach Abschluss und im Ergebniszustand: nur eine ereignisgesteuerte Schlusszeichnung;
- bei nicht verfügbarem Canvas-2D-Kontext: inerte Zusatzdarstellung, während der Solver unverändert weiterarbeitet.

`ResizeObserver`, `IntersectionObserver`, Page Visibility, Media-Query- und Anwendungseinstellungs-Listener werden beim Beenden vollständig gelöst. Die begleitende CSS-Atmosphäre übernimmt dasselbe Voll-/Ausgewogen-/Sparbudget und stoppt gemeinsam mit der Canvas.

### Differenzierte Algorithmuskommentare

Die Klartextspur beschreibt nicht nur eine Phase, sondern die jeweils belegbaren Fakten:

- Analyse: Zahl der Aufbau- und Perfektionsstränge, UI-Kernreserve und Grund der Lastverteilung;
- Constraint-Suche: Rolle, Datum, Kandidatenzahl, Suchstrahl, geprüfte Zustände und bearbeitete Felder;
- Rescue und Minimal-Rot-Fallback: tatsächlicher Auslöser und Eskalationsgrund;
- Perfektion: Runde, Nachbarschaft, geprüfte Züge, Vollbewertungen, angenommene Züge und Restbudget;
- Verbesserung: kumulierter Zugewinn, Zugart, betroffene Tage und Rechenaufwand;
- Zertifizierung: vollständig geprüfte Nachbarschaft und Zugzahl;
- Abschluss: Belegung, Rot/Orange/Gelb, Fairness, Wunschquote, Suchzustände, Bewertungen, Laufzeit und Zertifizierungsstand.

Gleichartige Meldungen werden gedrosselt, Meilensteine und Portfolioabschlüsse entdoppelt. Kommentarbestandteile werden als Textknoten aufgebaut; Workertexte können daher kein HTML in die Oberfläche einschleusen.

Der v7-Guardrail macht zusätzlich sichtbar, dass der Minimal-Rot-Fallback erst nach der verbreiterten Strict-Rescue erreicht werden kann.

### App-Icon

Das App-Icon verbindet die Kalenderfläche der Monatsplanung mit dem konzentrischen Constraint-Netz der Auto-Plan-Animation. Zwölf farbige Außenknoten greifen das Monatsspektrum auf; Ringe, Kopplungslinien und der leuchtende Kern stehen für Suche, Propagation und Optimierung.

- `icons/icon.svg`: statisches Vektormaster für Markenbild und skalierbares Favicon;
- `icons/icon-animated.svg`: separate animierte Designvariante mit `prefers-reduced-motion`;
- `icons/icon-32.png`: Raster-Fallback für kleine Browserkontexte;
- `icons/icon-180.png`: Apple-Touch-Icon;
- `icons/icon-192.png` und `icons/icon-512.png`: installierbare PWA-Icons;
- `icons/icon-maskable-512.png`: vollflächige Maskable-Variante mit allen wesentlichen Formen innerhalb der sicheren Mittelzone.

Das Icon enthält keine Schrift. Die zentrale Metapher bleibt auch bei 32 Pixeln erkennbar; für Maskable-Kontexte wird nicht dieselbe transparente Datei wiederverwendet.

---

## 7. Accessibility

- semantischer Dialog mit Fokus-Rückgabe;
- vollständige Tastaturbedienung;
- kontraststabile, sichtbare Fokusindikatoren in Hell, Dunkel und Windows High Contrast;
- semantische Tabellenköpfe;
- ARIA-Live-Bereiche für Status und Algorithmuskommentar;
- programmatische Fortschrittssemantik mit `role="progressbar"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` und phasenbezogenem `aria-valuetext`;
- Tooltip-Container mit `role="tooltip"` und `aria-describedby`;
- Tooltips auf Hover und Fokus;
- Tooltip-Schließen mit `Escape`;
- hoverbare und ausreichend persistente Tooltip-Inhalte;
- Reduced-Motion- und Reduced-Transparency-Unterstützung;
- native HTML-Dialoge mit browserseitiger Inert-Schaltung und Fokus-Rückgabe;
- Forced-Colors- und erhöhte-Kontrast-Anpassungen;
- semantisches ARIA-Registermuster mit automatischer Aktivierung, roving `tabindex` und zugeordneten Registerflächen;
- sichtbare Fokusrahmen auch im Windows-Hochkontrastmodus;
- kompakte Titelleistensteuerungen ab 30 Pixeln, Menübandbefehle ab 36 Pixeln und mindestens 44 Pixel auf groben Zeigegeräten;
- horizontales Tabellenscrolling auf schmalen Ansichten mit dauerhaft sichtbaren Orientierungszellen;
- mobile Statistikkarten mit programmatisch erzeugten Feldbeschriftungen;
- ein gemeinsamer vertikaler Scrollbereich ohne unerreichbare Aktionsleisten.

---

## 8. Datenmodell und Persistenz

### Monat

Ein Monatsobjekt enthält unter anderem:

- `year`, `month`, `schemaVersion`, `revision`, `updatedAt`;
- Tagesdaten mit `bd`, `hg`, `rbn1`, `rbn2`, `notes`;
- `absences`;
- `preferences`;
- `options`;
- `overrideLog`;
- `importLog`.

Die globalen Einstellungen liegen getrennt vom Monatsobjekt unter `settings` (Schema `v4`) mit den Bereichen `appearance` und `autoPlan`. `appearance.theme` enthält `system`, `light` oder `dark`.

### Persistenz

- Cloudflare KV speichert Monats-, Personal- und Einstellungsdaten.
- Browser-Sicherung schützt vor vorübergehenden Netzwerkfehlern.
- Revisionen und Fingerprints erkennen veraltete oder manipulierte Planungsstände.
- Auto-Plan-Vorschläge werden erst nach erneutem Audit übernommen.
- KV ist eventual consistent; Schreib- und Konfliktlogik muss deshalb über Revisionen und explizite Neuladung abgesichert bleiben.

---

## 9. Projektstruktur

```text
index.html
styles.css
controls.css
transitions.css
workspace.css
auto-plan-studio.css
auto-plan-studio-v6.css
auto-plan-studio-v7.css
auto-plan-studio-v7-5.css
app-settings.css

icons/
  icon.svg
  icon-animated.svg
  icon-32.png
  icon-180.png
  icon-192.png
  icon-512.png
  icon-maskable-512.png

js/
  app.js
  app-settings.js
  state.js
  rules.js
  rules-core.js
  rules-evaluation*.js
  rules-reporting*.js
  defaults.js

  auto-planner.js
  auto-planner-engine.js
  auto-planner-v3.js
  auto-planner-v4.js
  auto-planner-v5.js
  auto-planner-v6.js
  auto-planner-v7.js
  auto-planner-v7-5.js
  auto-planner-optimizer.js

  auto-plan-runner.js
  auto-plan-worker.js
  auto-plan-ui.js
  auto-plan-studio-v5.js
  auto-plan-studio-v6.js
  auto-plan-studio-v7.js
  auto-plan-studio-v7-5.js
  auto-plan-guardrail.js
  auto-plan-tooltip.js
  auto-plan-visualizer.js
  auto-plan-animation-policy.js
  auto-plan-progress.js
  auto-plan-lifecycle.js
  auto-plan-commentary.js

functions/
  _utils.js
  api/
  sw.js.js

tests/
  *.test.js
  e2e/*.spec.js

docs/
  AUTO-PLAN-V6-RESEARCH-20260803.md
  AUTO-PLAN-V7-RESEARCH-20260803.md
  AUTO-PLAN-V7-5-RESEARCH-20260803.md
  auto-plan-v7-test-strategy.yml
  auto-plan-v7-5-test-strategy.yml
```

---

## 10. Lokale Entwicklung

### Voraussetzungen

- Node.js 18 oder neuer
- npm
- für Browsertests installierte Playwright-Browser

### Installation

```bash
npm ci
npx playwright install --with-deps chromium
```

### Syntaxprüfung

```bash
npm run check
```

### Modultests

```bash
npm test
```

### Browsertests

```bash
npm run test:e2e
```

### Vollständige Verifikation

```bash
npm run verify
```

Für eine lokale statische Vorschau kann ein beliebiger HTTP-Server im Repository-Wurzelverzeichnis verwendet werden. Direkter `file://`-Betrieb ist wegen ES-Modulen nicht vorgesehen.

---

## 11. Cloudflare-Betrieb

### Pages

- Build-Ausgabe: Repository-Wurzel
- Frontend: statische Dateien
- API: Pages Functions unter `functions/`

### KV

Der KV-Namespace muss entsprechend der Cloudflare-Konfiguration an die Functions gebunden werden. Umgebungen für Entwicklung, Preview und Produktion sollten getrennte Namespaces verwenden.

### Sicherheit

- keine Secrets im Repository;
- Eingabevalidierung in allen Functions;
- Größen- und Typgrenzen für Imports;
- CORS nur soweit erforderlich;
- konsistente Security Header;
- keine dynamische Codeausführung;
- keine zweite, abweichende Regelengine im Worker;
- Vorschlags- und Konfigurationsfingerprints vor der Übernahme.

---

## 12. Tests und Qualitätsgates

Die CI führt aus:

1. `npm ci`
2. Syntaxprüfung aller produktiven JavaScript-Dateien
3. Node-Test-Suite
4. Playwright-Browsertests

Für Release 0.7.1 wurden lokal **355/355 Node-Tests** und **52/52 Chromium-E2E-Szenarien** erfolgreich ausgeführt.

Neue v7.5-Regressionstests prüfen zusätzlich zu den v7-Gates insbesondere:

- vollständige, migrationssichere Settings-Defaults und strikte Validierung;
- adaptives Worker-Budget bei kleinem Speicher, großen Geräten und explizitem Limit;
- rollenübergreifende Fail-first-Auswahl;
- Belegungs-Ledger und v7-Telemetrie;
- cost-aware Operatorlernen einschließlich Exploration;
- Zahnrad, Modal, Fokus-Rückgabe, Persistenz und Studio-v7 im Browser;
- Erhalt abgeleiteter HG-Grenzen bei partiellen Konfigurationen;
- bewusste Aufhebung durch explizites `null`;
- ausschließlich strikte Profile in der Rescue;
- protokollierte Rescue vor einem Minimal-Rot-Fallback.
- monotonen, endlichen und nicht voreilenden Portfoliofortschritt über generierte Ereignisfolgen;
- den Phasenwechsel von Aufbau zu Perfektion ohne übernommene Portfoliozähler;
- exakt ein terminales Gesamtereignis nach Abschluss aller relevanten Arbeitsstränge;
- Worker-Abort, unbekannte Antworten, Übertragungsfehler und vollständige Listenerbereinigung;
- Abbruch vor und während der Ergebnisüberleitung sowie Schutz gegen verspätete Ergebnisse;
- Canvas-Budgets für volle, ausbalancierte, belastete, unsichtbare, reduzierte und beendete Zustände;
- fehlenden Canvas-Kontext als rein visuelles, nicht fachliches Degradationsszenario;
- differenzierte, kennzahlenbasierte und HTML-sichere Algorithmuskommentare;
- negative, gebrochene, nichtnumerische und unter Fixpunkten liegende Rohgrenzen;
- Fortschrittssemantik, Reduced Motion und Tooltip-Lebenszyklus im Browser;
- plattformneutrale Syntax-Gate-Pfade unter Windows und POSIX;
- identische Quelltextprüfungen bei LF- und CRLF-Zeilenenden.

Die Designsystem-Regressionen aus Release 0.7.1 prüfen darüber hinaus:

- Auswahl, Session-Erhalt und Normalisierung der drei Farbschemata;
- Theme-Wiederherstellung vor Abschluss eines künstlich verzögerten Bootstrap-Abrufs;
- eindeutige Zuordnung aller Befehle zu sechs Registerkarten und semantisch korrekte Registerflächen;
- Tastatursteuerung mit Pfeiltasten, `Pos1`, `Ende` und `Strg+F1`;
- Mindestgrößen der kompakten Titelleiste und der Menübandbefehle;
- statisches dekoratives Chrom und Reduced Motion;
- Textkontrast von mindestens 4,5:1 auf dunklen Monats-, Wochenend-, Sammeldialog- und Auto-Plan-Flächen;
- Betriebssystem-Dark-Mode sowie Forced-Colors-Grundzustand mit ausgeblendeter Dekoration und sichtbarem Tastaturfokus;
- auf App-Chrome beschränkte Transparenz bei vollständig deckendem Arbeitsblatt;
- sticky Orientierungszellen und kartenförmige Statistik auf schmalen Viewports;
- ausbruchfreie mobile Einstellungen mit eigenem scrollbaren Inhaltsbereich.

Ein Merge nach `main` ist nur nach erfolgreicher CI vorgesehen.

---

## 13. Grenzen

- Eine vollständige Null-Rot-Belegung kann mathematisch unmöglich sein, wenn Fixpunkte, Qualifikationen, Abwesenheiten und harte Obergrenzen gemeinsam keine zulässige Lösung erlauben.
- Der Auto-Plan verändert keine Fixpunkte und lockert keine harten Grenzen, um Vollständigkeit zu erzwingen.
- Die Zertifizierung beweist lokale Optimalität für die vollständig geprüften Nachbarschaften, nicht globale Optimalität des gesamten kombinatorischen Problems.
- Mehr Zeit und mehr Kerne erhöhen die Suchtiefe, garantieren aber bei einem NP-schweren Rostering-Problem keinen globalen Optimalitätsbeweis.
- RBN und zweite RBN bleiben manuell.

---

## 14. Recherche und Entscheidungsprotokoll

Die fachliche und technische Begründung der v7.5-Architektur einschließlich Suchfortschritt, Constraint-Programming, Rendering, Browser-Lebenszyklus und Accessibility steht in:

- [`docs/AUTO-PLAN-V7-5-RESEARCH-20260803.md`](docs/AUTO-PLAN-V7-5-RESEARCH-20260803.md)
- [`docs/auto-plan-v7-5-test-strategy.yml`](docs/auto-plan-v7-5-test-strategy.yml)
- [`docs/AUTO-PLAN-V7-RESEARCH-20260803.md`](docs/AUTO-PLAN-V7-RESEARCH-20260803.md)
- [`docs/auto-plan-v7-test-strategy.yml`](docs/auto-plan-v7-test-strategy.yml)
- [`docs/AUTO-PLAN-V6-RESEARCH-20260803.md`](docs/AUTO-PLAN-V6-RESEARCH-20260803.md)
- [`docs/AUTO-PLAN-RESEARCH-20260802.md`](docs/AUTO-PLAN-RESEARCH-20260802.md)
- [`docs/AUTO-PLAN-HARDENING-20260802.md`](docs/AUTO-PLAN-HARDENING-20260802.md)

---

## 15. Release 0.7.1 / Excel 365 Aero Workspace

- neue Office-Fensterhierarchie aus grüner Titelleiste, Befehlssuche, sechs Registern, Menüband, Formelzeile, deckendem Arbeitsblatt, Blattreitern und Statusleiste;
- vollständige Befehlszuordnung zu **Datei**, **Start**, **Planung**, **Auto-Plan**, **Daten** und **Ansicht**, ohne doppelte IDs oder veränderte Fachereignisse;
- Excel-typische Symbol-/Textbefehle, Gruppentitel und eigener hervorgehobener Auto-Plan-Einstieg;
- zugängliches Registermuster mit Pfeiltasten, `Pos1`, `Ende`, automatischer Aktivierung sowie `Strg+F1` zum Ein- und Ausklappen;
- Befehlssuche mit `Alt+Q`, kontextbezogene Formelzeile und direkt navigierbare Blattreiter;
- Aero Glass ausschließlich in App-Chrome und Dialograhmen; deckende, kontraststabile Dienstplan-, Statistik- und Auto-Plan-Flächen in Hell, Dunkel und Systemeinstellung;
- expliziter Windows-Forced-Colors-Fokus, Reduced Motion, Reduced Transparency, mobile Ribbon-Navigation und druckgerechtes Ausblenden sämtlicher Office-Chrome;
- Paketversion `0.7.1` und durchgängiger Browser-Release-Token `20260803.6` für Module, Styles und Manifest;
- zusätzliche Unit- und Chromium-Regressionen für Ribbon-Verträge, Themes, responsive Geometrie, Tastaturbedienung, Druck und Transparenzgrenzen.

### Historie 0.7.0 / Clinical Fluent Workspace

- vollständige Modernisierung von Hauptplan, damaliger Action Bar, Statistik, offenen Punkten, Picker, Sammeldialogen, Einstellungen und Auto-Plan Studio;
- semantische Zwei-Ebenen-Tokens und persistente Farbschemata `Systemeinstellung`, `Hell` und `Dunkel` im Settings-Schema v4;
- kontraststabile dunkle Monats-, Wochenend-, Feiertags-, Sammeldialog- und Auto-Plan-Flächen;
- responsive Diensttabelle, mobile Statistikkarten und viewport-sicheres Einstellungsmodal;
- Unterstützung für Reduced Motion, Reduced Transparency, erhöhten Kontrast und Windows Forced Colors;
- damalige Paketversion `0.7.0` und Browser-Release-Token `20260803.5`.

### Historie 0.6.5 / Auto-Plan v7.5

- neues **Truthful Constraint Observatory** mit Fortschrittsring, Arbeitsmenge, Portfoliozustand und Qualitätsgewinnen;
- monotones, portfolioaggregiertes Fortschrittsmodell mit 99-Prozent-Schranke bis zum echten Gesamtabschluss;
- Canvas-Animation mit 30/20/15-fps-Budgets, adaptiver Detail- und Partikeldichte sowie vollständiger Sichtbarkeits- und Reduced-Motion-Steuerung;
- explizites Stoppen der Canvas- und CSS-Animation nach Abschluss oder Dialogabbruch;
- ausschließlich ereignisbasierte Knotenzustände ohne aus Prozentwerten erfundene Felder;
- differenzierte Algorithmuskommentare für Kernverteilung, Engpässe, Perfektionsrunden, Bewertungen, Restbudget, Verbesserungen und Schlussqualität;
- HTML-sichere Kommentarwiedergabe über DOM-Textknoten;
- sicher abbrechbare Ergebnisüberleitung und Lauf-Epochen gegen späte Ergebniszustände;
- gehärtetes Workerprotokoll für interne Abbrüche, unbekannte Antworten, Laufzeit- und strukturierte Klonfehler;
- vollständiges Aufräumen von Workern, Zeitgebern, Frames, Beobachtern und Abbruchlistenern;
- strikt validierte negative, gebrochene und nichtnumerische Laufobergrenzen;
- sichere Standardgrenzen auch bei partieller Engine-Konfiguration;
- sofortiges Schließen sichtbarer Rich Tooltips nach Deaktivierung;
- v7.5-Identität in Planner, Studio, Einstellungen, damaliger Paketversion und vollständigem Browser-Modulgraphen;
- einheitlicher v7.5-Release-Token `20260803.4` im damaligen Browser-Modulgraphen;
- neue Unit-, Integrations-, Property- und Browserregressionen sowie ein dokumentiertes v7.5-Risikomodell.

### Historie 0.6.0 / Auto-Plan v7

- globale MRV-/Fail-first-Auswahl über BD und HG statt rollenweiser Konstruktion;
- inkrementelles Assignment Ledger für Obergrenzen und Lastanteile;
- cost-aware Online-Bandit für die ALNS-Operatorwahl;
- geräte-, speicher-, profil- und problemadaptives Worker-Portfolio mit UI-Reserve;
- drei Leistungsprofile sowie explizite Parallelitätsbegrenzung;
- neue v7-Lauftelemetrie für Ledger, Worker und Operatorlernen;
- v7-Portfolio-Leiste und monatlich eingefärbte, Reduced-Motion-sichere Orbit-Animation;
- neue App-Gruppe in der Action Bar mit Zahnrad und barrierearmem Einstellungsmodal;
- persistentes Settings-Schema v3 für Darstellung und Auto-Plan-Voreinstellungen;
- einheitlicher v7-Release-Token `20260803.3` im damaligen Browser-Modulgraphen;
- lokale v6/v7-Stressmessung: etwa `22,7 s → 1,7 s` sowie `45.288 → 9.738` Kandidatenbewertungen im dokumentierten strikten Leermonatsfall;
- vollständige Forschungs-, Architektur-, Test- und Betriebsdokumentation.

### Historie 0.5.1 / Auto-Plan v6

- Auto-Plan-Algorithmus v6;
- adaptive Null-Rot-Rescue vor jedem bestätigbaren Fallback;
- vollständige Standardgrenzen auch bei partiellen API-Konfigurationen;
- sichtbarer Null-Rot-Guardrail im Studio;
- phasenbezogene Klartextbeschreibung des Algorithmuslaufs;
- stärker in die Monatsfarbe integrierte Laufanimation;
- WCAG-orientierte Rich Tooltips;
- zusätzliche v6-Regressionsabdeckung;
- aktualisierte Architektur-, Betriebs- und Testdokumentation.
- neues Algorithmus-Spektrum-App-Icon als statische und bewegte SVG-Variante;
- vollständige 32/180/192/512-Pixel-Ableitungen und separates Maskable-PWA-Icon;
- plattformneutrale Qualitätsgates für Windows-, macOS- und Linux-Arbeitskopien;
- deterministische E2E-Synchronisation des Monatsfarbverlaufs über echte Start- und Abschlusszustände statt fester Wartezeit;
- einheitlicher Release-Token `20260803.2` im vollständigen Browser-Modulgraphen und ein Gate gegen künftige Teilversionen;
- GitHub-CI-Actions mit nativer Node-24-Laufzeit ohne Node-20-Abkündigungswarnung.
