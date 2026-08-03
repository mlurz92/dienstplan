# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – Kalendertabelle mit wechselnden Monatsfarben" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.4.0`  
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** parametrierbare globale BD/HG-Optimierung mit Null-Rot-Suche, Minimal-Rot-Fallback, Ruin-and-Recreate-Perfektionsphase und abschließender Optimalitätszertifizierung  
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt die bewusste manuelle Einzelplanung sowie eine bestätigungspflichtige automatische Komplettierung aller noch offenen **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)** des sichtbaren Monats. Bereits eingetragene Dienste bleiben unveränderliche Fixpunkte. RBN und zweite RBN werden nicht automatisch geplant.

---

## 1. Grundsätze

- Die bestehende Regelengine ist die einzige fachliche Wahrheitsquelle.
- Auto-Plan verändert ausschließlich leere BD- und HG-Felder des sichtbaren Monats.
- Vorhandene BD/HG, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
- Während Konfiguration und Berechnung wird nichts in den sichtbaren oder gespeicherten Plan geschrieben.
- Erst **Vorschläge übernehmen** führt nach erneutem vollständigem Audit eine atomare Monatsmutation aus.
- Graue beziehungsweise technisch nicht wählbare Besetzungen werden in keiner Suchstufe zugelassen.
- Rote, aber technisch bestätigbare Abweichungen dürfen nur in einem ausdrücklich zugelassenen Minimal-Rot-Fallback erscheinen.
- Jeder bestätigte rote Auto-Plan-Eintrag wird revisionsfest protokolliert.

---

## 2. Auto-Plan Studio

Der Auto-Plan startet nicht unmittelbar beim Öffnen. Das Studio besitzt drei klar getrennte Schritte:

1. **Konfiguration**
2. **animierter Optimierungslauf**
3. **vollständige tabellarische Prüfung und bewusste Übernahme**

Alle drei Abschnitte liegen in **einem gemeinsamen Arbeitsbereich** zwischen Kopf- und Fußleiste. Es gibt genau einen senkrechten Scrollbereich; jeder Abschnitt wächst darin frei. Verschachtelte Scrollboxen hatten zuvor dazu geführt, dass die unteren Zeilen der Mitarbeitendentabelle und die Freigabemeldung außerhalb des sichtbaren Bereichs lagen und sich nicht mehr bedienen ließen.

### 2.1 Verbindliche Konfiguration vor dem Start

Vor **Optimierung starten** können festgelegt werden:

- Suchintensität `Standard`, `Tief` oder `Maximum`;
- Optimierungsschwerpunkt `Ausgewogen`, `Wünsche`, `Lastenausgleich` oder `Wochenenden`;
- **Zeitrahmen der Perfektionsphase** von zehn Sekunden bis fünfzehn Minuten;
- Zahl iterativer Reparaturrunden;
- Budget der lokalen Neuplanung;
- **Late-Acceptance-Fenster** als Toleranz gegen lokale Optima;
- Ausführung der Perfektionsphase insgesamt;
- Zulassung des Minimal-Rot-Fallbacks;
- maximal zulässige Zahl roter Vorschläge;
- feste maximale BD-Zahl je Mitarbeitendem;
- feste maximale HG-Zahl je Mitarbeitendem;
- feste maximale Gesamtzahl `BD + HG` je Mitarbeitendem.

**Vorbelegte Obergrenzen.** Die Tabelle startet mit festgelegten Vorgaben:

| Person | BD max. | Person | BD max. |
|---|---|---|---|
| Dr. Lurz | 5 | Dr. Martin | 4 |
| Fr. Dalitz | 5 | Hr. El Houba | 4 |
| Dr. Polednia | 4 | Fr. Licenji | 4 |
| Dr. Becker | 3 | Hr. Sebastian | 4 |
| Fr. Hellmann | 2 | | |

Die HG-Obergrenze steht auf `0` für alle, die im gesamten Monat an keinem Tag HG-berechtigt sind – Assistenzärztinnen und Assistenzärzte planen keinen Hintergrunddienst. Abgeleitet wird das aus der datumsabhängigen Qualifikation und nicht aus einer festen Namensliste: Eine Beförderung hebt die Vorgabe von selbst wieder auf, wie bei Hr. El Houba ab dem 22.09.2026.

Liegt bereits mehr an, als eine Vorgabe zulässt, hebt sie sich auf den bestehenden Stand. Eine Vorgabe blockiert damit nie den Start; sichtbar und änderbar bleibt sie trotzdem. Ist im Personalstamm zusätzlich ein hartes Monatsmaximum hinterlegt, gilt der strengere Wert.

Der Zeitrahmen ist die wirksamste Stellgröße. Die Ruin-and-Recreate-Suche nutzt ihn vollständig aus; mehr Zeit führt zu besseren Plänen und macht den abschließenden Optimalitätsnachweis wahrscheinlicher. Die Suchintensität schlägt für Zeitrahmen, Reparaturrunden, Neuplanungsbudget und Late-Acceptance-Fenster passende Werte vor. Ein selbst eingetragener Wert bleibt dabei erhalten und wird durch einen späteren Wechsel der Intensität nicht überschrieben.

Die Tabelle der Obergrenzen führt jede planbare Person mit ihren bestehenden BD und HG sowie drei Eingabefeldern. Zwei Schaltflächen setzen alle Zeilen gemeinsam auf die Vorschlagswerte zurück oder leeren sämtliche Grenzen. Eine Zeile, deren Grenze eine bestehende Dienstzahl unterschreitet, wird hervorgehoben und blockiert den Start.

Die personengebundenen Obergrenzen sind **harte Laufbedingungen**. Sie können auch im Minimal-Rot-Fallback nicht überschritten werden. Bereits vorhandene Fixpunkte zählen mit. Eine Grenze unterhalb der bestehenden Dienstzahl blockiert den Start unmittelbar.

Personalstamm-Maxima bleiben zusätzlich wirksam. Für Personen ohne dauerhaft hinterlegtes Maximum wird ein editierbarer Laufwert angeboten. Leere HG- oder Gesamtfelder bedeuten keine zusätzliche Laufobergrenze.

Jedes Bedienelement, jede Tabellenüberschrift und jede Live-Kennzahl trägt einen erklärenden Tooltip. Die Konfiguration wird validiert, bevor der Startbutton aktiv bleibt. Laufparameter und Vorschläge sind fingerprintgeschützt; eine nachträgliche Manipulation wird beim Übernahmeaudit verworfen.

### 2.2 Laufansicht: Animation, Kommentar und Telemetrie

Die Laufansicht steht auf zwei Säulen: links die Animation, rechts die Kommentierung. Beide zeigen denselben Lauf, aber unterschiedliche Wahrheiten – die eine, *wie viel* gerechnet wird, die andere, *woran*.

**Animation.** Eine Canvas-Darstellung bildet den tatsächlichen Zustand der Suche ab und wirkt nicht nur beschäftigt:

- **Jedes Dienstfeld des Monats ist ein Knoten.** BD liegt auf der inneren, HG auf der äußeren Bahn. Fixpunkte leuchten von Beginn an ruhig, offene Felder bleiben dunkel.
- **Entscheidungen zünden.** Wird ein Feld belegt, fliegt ein Komet aus dem Kern dorthin, der Knoten flammt auf und eine Druckwelle läuft über die Bahnen.
- **Kopplungsfäden** verbinden benachbarte Tage sowie BD und HG desselben Tages – genau die Beziehungen, aus denen die fachlichen Kopplungsregeln entstehen. Auf ihnen wandern Signale, deren Dichte und Tempo der gemessenen Suchaktivität folgen.
- **Der Kern pulsiert** im Takt der Bewertungen. Die Farbwelt entsteht aus der Monatsakzentfarbe der Anwendung und wird je Phase nur verschoben, nie ersetzt – die Animation bleibt dadurch Teil derselben Oberfläche und wird kein fremder Fleck darin.
- **Eine Verlaufslinie** am unteren Rand zeichnet die Qualität mit: Jede Verbesserung senkt die Kurve sichtbar ab.

**Algorithmuskommentar.** Daneben läuft ein fortlaufender Klartextstrom mit Uhrzeit: welcher Meilenstein erreicht ist, welches Feld gerade belegt wurde und wie viele Personen dafür überhaupt in Frage kamen, welcher Ausschnitt neu aufgebaut wird, welche Verbesserung an welchen Tagen übernommen wurde, wie viele Züge der Optimalitätsnachweis bereits vollständig geprüft hat. Der Strom erfindet nichts: Jede Zeile entsteht aus einem tatsächlichen Fortschrittsereignis des Algorithmus. Aufbau und Drosselung sind in → 3.14 beschrieben.

Dazu kommen ein Phasenband mit sechs Stufen, ein Fortschrittsbalken, die verstrichene und die verbleibende Zeit sowie sechs Live-Kennzahlen: aktive Varianten, Kandidatendomänen, geprüfte Zustände, verworfene Zustände, gefundene Verbesserungen und Zahl der Felder. Jede trägt einen erklärenden Tooltip.

**Die Oberfläche bleibt während des gesamten Laufs bedienbar,** weil gerechnet wird, wo nichts zu zeichnen ist: in eigenen Arbeitssträngen (→ 3.13). Läuft die Rechnung ausnahmsweise im Anzeigestrang – etwa ohne Unterstützung für Arbeitsstränge –, geben die Rechenschleifen zeitgesteuert an den Browser ab, gemessen in vergangener Zeit statt in Schleifendurchläufen. Der Fortschrittsbalken läuft ausschließlich vorwärts; Stufenwechsel erzeugen keine Rücksprünge. Reduzierte Bewegung wird respektiert.

### 2.3 Monatsvorschlag wie die Diensttabelle

Die Vorschau verwendet eine semantische HTML-Tabelle mit **einer Zeile je Kalendertag**:

| Tag | Wochentag | BD | HG | Prüfung |
|---|---|---|---|---|

BD und HG desselben Tages stehen zusammen in einer Zeile. Jede Zelle zeigt:

- Person;
- `Fixpunkt`, `Auto-Plan` oder `offen`;
- Bewertungsstufe;
- vollständige Regelgründe als aufklappbaren Detailbereich.

Übernommen sind bewusst auch die Kleinigkeiten, an denen die Ansicht sonst fremd wirken würde: die Tagesnummer ohne führende Null, der ausgeschriebene Wochentag und dieselbe Unterscheidung von Samstag, Sonntag und Feiertag wie in der Diensttabelle. Die Spalten `RBN` und `2. RBN` entfallen, weil der Auto-Plan sie nicht plant; an ihre Stelle tritt die Prüfspalte. Die Tabellenköpfe bleiben beim Scrollen sichtbar. Zusätzlich werden vor der Übernahme angezeigt:

- verwendete Laufparameter;
- Such- und Reparaturtelemetrie;
- Fairnesskennzahl;
- erfüllte Wünsche;
- gelbe, orange und rote Hinweise;
- BD, HG, Gesamtlast und Wochenendäquivalente je Person;
- Vorher-Nachher-Vergleich;
- BD-Soll und die verwendeten individuellen Obergrenzen.

Zusätzlich weist eine Karte den **Gewinn durch die Perfektionsphase** aus: die Veränderung gegenüber dem Ergebnis unmittelbar nach Konstruktion und Tauschreparatur. Eine weitere Karte nennt den Stand des **Optimalitätsnachweises**.

Die Ergebnisansicht ist auch bei geringer Fensterhöhe vollständig erreichbar. Kopf- und Aktionsleiste bleiben stehen, die Tabellenköpfe haften am Arbeitsbereich, und auf schmalen Fenstern scrollen die Tabellen waagerecht statt Inhalte abzuschneiden.

---

## 3. Der Auto-Plan-Algorithmus vollständig

Dieses Kapitel beschreibt den Auto-Plan so genau, dass sein Verhalten ohne Blick in den Quelltext nachvollziehbar ist: jede Stufe, jede Reihenfolge, jede Konstante und jeder Abbruchgrund. Wo eine Zahl genannt wird, steht sie so im Code.

### 3.0 Aufbau des Laufs

Ein Lauf durchläuft vier Stufen. Jede erhält den Ausgangsmonat und die Belegung der vorigen Stufe; keine Stufe darf einen Fixpunkt verändern.

```
Ausgangsmonat (Baseline, unveränderlich)
        │
        ├─ Stufe 1  Konstruktion            Beam-Search mit Forward-Checking
        │            → vollständige, zulässige Erstbelegung
        │
        ├─ Stufe 2  Iterative Tauschreparatur
        │            → grobe Ausreißer geglättet
        │
        ├─ Stufe 3  Perfektion               Ruin-and-Recreate + Late Acceptance + Abstieg
        │            → globale Qualität, nutzt den gesamten Zeitrahmen
        │
        └─ Stufe 4  Zertifizierung           vollständige Prüfung zweier Nachbarschaften
                     → `zertifiziert` oder `zeitbegrenzt`
```

Die Stufen 1 und 2 liegen im Auftrag `construct` eines Arbeitsstrangs, die Stufen 3 und 4 im Auftrag `perfect`. Diese Trennung ist die Voraussetzung dafür, dass mehrere Kerne denselben Aufbau weiterverbessern können, ohne ihn mehrfach zu berechnen (→ 3.12).

### 3.1 Datenmodell eines Laufs

| Begriff | Bedeutung |
|---|---|
| **Baseline** | Tiefe Kopie des Ausgangsmonats zum Zeitpunkt des Starts. Sie wird nie verändert und ist die Referenz für „was war schon da". |
| **Fixpunkt** | Jedes BD- oder HG-Feld, das in der Baseline bereits belegt ist. Fixpunkte sind für alle Stufen unsichtbar-unveränderlich: Sie erscheinen in keiner Slotliste und keiner Zugmenge. |
| **Slot** | Ein Paar `{dateIso, role}` mit `role ∈ {bd, hg}`, dessen Baseline-Wert leer ist. Nur Slots dürfen belegt werden. |
| **Knoten** | Ein Zwischenzustand der Konstruktion: ein Monat plus die Mitschrift aller Bewertungen, die beim Setzen entstanden sind. |
| **Sandbox** | Ein simulierter Anwendungszustand `simulatedState(state, monthData)`, in dem der Kandidatenmonat den echten ersetzt. Nur darauf wird bewertet; der sichtbare Plan bleibt unberührt. |
| **Änderung** | Ein Tripel `{dateIso, role, staffId}`. Der Vorschlag ist die Liste aller Änderungen gegenüber der Baseline. |

`ROLE_ORDER` ist `['bd', 'hg']` — BD wird global vor HG geplant, damit HG bereits auf dem fertigen BD-Stand entschieden wird und Gegenposten sowie Wochenendkopplungen von Anfang an stimmen.

**Schutz der Fixpunkte.** Der Schutz ist dreifach ausgelegt und nicht bloß eine Konvention:

1. Die Slotliste enthält Fixpunkte gar nicht erst.
2. `PlanOptimizer.commit()` wirft eine Ausnahme, sobald ein Zug ein Feld beträfe, das nicht in der Slotmenge steht.
3. Nach der Perfektionsphase und erneut vor der Übernahme läuft `assertFixedAssignmentsUntouched(baseline, plannedMonth)` über den gesamten Monat.

### 3.2 Regelgebundene Kandidatenbewertung

Jede hypothetische Einteilung wird durch `evaluateCandidate({state, monthData, dateIso, role, staffId})` der bestehenden Regelengine bewertet. **Der Algorithmus besitzt keine vereinfachte Parallelregel.** Das ist keine Stilfrage: Eine zweite Fassung würde von der ersten abweichen, ohne dass es jemand bemerkt, und der Auto-Plan schlüge dann Dienste vor, die die Anwendung selbst als regelwidrig markiert.

Eine Bewertung liefert:

- **Stufe** `green` < `yellow` < `orange` < `red` < `gray` (`LEVEL_RANK` 0…4);
- **Wählbarkeit** `canSelect` und eine Auswahlpolitik `normal` / `standard` / `special` / `blocked`;
- **Begründungen** als Volltext, getrennt nach Konflikt, Bestätigung, Empfehlung und Hinweis;
- **Empfehlungsvektor** mit sechs Bahnen, in dieser Reihenfolge:

| Index | Bahn | Inhalt |
|---|---|---|
| 0 | `coupling` | deterministische Kopplungen, etwa Gegenposten und Wochenendbindungen |
| 1 | `wish` | erfüllte positive Dienstwünsche |
| 2 | `option` | erfüllte Optionen `BD möglich` / `HG möglich` |
| 3 | `monthly` | monatlicher Lastausgleich |
| 4 | `weekend` | Wochenend- und Samstagsrotation |
| 5 | `other` | sonstige positive Empfehlungen |

Absolut ausgeschlossen bleiben unter anderem: fehlende Qualifikation; nicht aktive oder nicht planbare Person; gleichzeitiger BD und HG derselben Person; unmittelbar aufeinanderfolgende eigene BD; unbekannte oder ungültige Personalwerte; Überschreitung einer konfigurierten BD-, HG- oder Gesamtobergrenze.

Diese Fälle werden nicht bestraft, sondern **aus der Kandidatenmenge entfernt**. Sie können in keiner Stufe und in keinem Zufallspfad auftauchen.

### 3.3 Kandidatenordnung

`createCandidateResolver` liefert für ein Slot die zulässigen Personen bereits sortiert. Die Sortierung ist lexikografisch über `candidateKey`:

**Strategie `balanced`** (Aufbau- und Rückfalllauf):

```
[ Stufe , −coupling , −wish , −option , −monthly , −weekend , −other ,
  Last , AA-HG-Zahl , bestehende HG , Stammreihenfolge ]
```

**Strategie `coverage`** (vertiefter Lauf): dieselben Größen, aber Last und Ausgleich rücken direkt hinter die Kopplung:

```
[ Stufe , −coupling , Last , AA-HG-Zahl , bestehende HG ,
  −wish , −option , −monthly , −weekend , −other , Stammreihenfolge ]
```

`Last` ist bei BD die bisherige BD-Zahl, bei HG die kombinierte BD+HG-Last. Die abschließende Stammreihenfolge macht die Ordnung total: Bei sonst gleichem Schlüssel entscheidet die Position im Personalstamm, nie der Zufall. Die Liste wird je Monatsobjekt und Slot in einer `WeakMap` zwischengespeichert.

### 3.4 Zielfunktion: der lexikografische Schlüssel

Alle Stufen vergleichen Pläne über **denselben** Vektor. Verglichen wird streng lexikografisch: Die erste Stelle mit einem Unterschied entscheidet, spätere Stellen können sie nie ausgleichen. Es gibt keine gewichtete Punktsumme, in der sich ein roter Dienst durch drei erfüllte Wünsche „aufwiegen" ließe.

Der Schlüssel eines Monats lautet vollständig:

| Position | Größe | Richtung |
|---|---|---|
| 1 | Zahl verletzter Laufobergrenzen | minimieren |
| 2 | Zahl grauer, technisch nicht wählbarer Zellen | minimieren |
| 3 | Zahl unbesetzter Felder | minimieren |
| 4 | Rot-Limit überschritten (0/1) | minimieren |
| 5 | Zahl roter Zellen | minimieren |
| 6 | Zahl besonders bestätigungspflichtiger roter Zellen | minimieren |
| 7 | Zahl oranger Zellen | minimieren |
| 8 | Zahl gelber Zellen | minimieren |
| 9…17 | **weicher Block**, Reihenfolge je Schwerpunkt (siehe unten) | |
| 18 | Summe Bahn `monthly` | maximieren |
| 19 | Summe Bahn `weekend` | maximieren |
| 20 | Summe Bahn `other` | maximieren |

Der weiche Block enthält immer dieselben neun Größen, nur in anderer Reihenfolge:

| Schwerpunkt | Reihenfolge des weichen Blocks |
|---|---|
| `Ausgewogen` | `coupling`↑, `wish`↑, `option`↑, erfüllte Wünsche↑, BD-Strafe↓, BD+HG-Varianz↓, AA-HG-Varianz↓, Wochenendvarianz↓, Samstagsvarianz↓ |
| `Wünsche` | erfüllte Wünsche↑, `coupling`↑, `wish`↑, `option`↑, dann Fairness wie oben |
| `Lastenausgleich` | BD-Strafe↓, BD+HG-Varianz↓, AA-HG-Varianz↓, erfüllte Wünsche↑, `coupling`↑, `wish`↑, `option`↑, Wochenendvarianz↓, Samstagsvarianz↓ |
| `Wochenenden` | Wochenendvarianz↓, Samstagsvarianz↓, erfüllte Wünsche↑, `coupling`↑, `wish`↑, `option`↑, dann Lastausgleich |

Daraus folgt unmittelbar: **Der Schwerpunkt ordnet nur weiche Ziele um.** Die Positionen 1 bis 8 stehen fest. Ein gelber Regelhinweis wiegt immer schwerer als jeder Wunsch — auch im Schwerpunkt `Wünsche`. Wer Wünsche über gelbe Hinweise stellen will, muss das im Regelwerk tun, nicht im Auto-Plan.

Die Fairnessgrößen im Einzelnen:

- **BD-Strafe** `Σ (BD − BD-Soll)²`, wobei ein Überhang zusätzlich mit `1,3` gewichtet wird. Zu viel wiegt damit schwerer als zu wenig.
- **BD+HG-Varianz** über den Kreis der im Monat an mindestens einem Tag HG-berechtigten Personen.
- **AA-HG-Varianz** über die Zahl der HG, die zu einem AA-BD gehalten werden.
- **Wochenendvarianz** über die Wochenendäquivalente aller planbaren Personen.
- **Samstagsvarianz** über die Zahl der Samstags-BD unter denen, die im Monat an mindestens einem Samstag BD-berechtigt sind.

Alle Vergleichsgruppen werden **datumsgenau** gebildet. Eine Beförderung mitten im Monat wird nicht auf den ganzen Monat hochgerechnet; wer erst ab dem 23. HG-berechtigt ist, steht auch erst ab dem 23. in der HG-Vergleichsgruppe.

**Fairnessindex.** Die Prozentzahl der Ergebnisansicht ist eine abgeleitete Anzeige, kein Optimierungsziel:

```
Index = clamp(0 … 100 , 100 − 1,35·BD-Strafe − 8·BD+HG-Varianz − 5·AA-HG-Varianz − 7·Wochenendvarianz)
```

Sie ist `0`, solange der Plan graue Zellen, offene Felder oder Obergrenzenverletzungen enthält.

### 3.5 Zulässigkeit und Suchmodi

Ein Plan heißt **zulässig**, wenn er keine Obergrenze verletzt, keine graue Zelle enthält und das konfigurierte Rot-Limit einhält. Zusätzlich gilt je nach Modus:

- **`strict`** — Null-Rot: keine einzige rote Zelle. Rote Kandidaten werden schon aus der Kandidatenmenge entfernt.
- **`confirmable`** — Minimal-Rot: rote, aber technisch bestätigbare Zellen sind erlaubt; ihre Zahl steht an Position 5 des Schlüssels und wird damit minimiert.

Unzulässige Zwischenzustände werden verworfen, nicht bestraft. Der Suchstrahl enthält zu keinem Zeitpunkt einen unzulässigen Knoten.

### 3.6 Stufe 1 — Konstruktion

Die Konstruktion ist eine Beam-Search mit Minimum-Remaining-Values-Auswahl und Forward-Checking.

**Slotauswahl (MRV).** Aus den verbleibenden Slots der aktuellen Rolle wird das Feld mit der **kleinsten Kandidatenmenge** gewählt. Bei Gleichstand entscheidet die Kritikalität, dann das Datum, dann die Rolle:

| Kritikalität | Slot |
|---|---|
| `0` | BD am Samstag |
| `1` | jeder Slot an Freitag oder Sonntag |
| `2` | alle übrigen |

Damit fällt zuerst die Entscheidung, die am wenigsten Alternativen hat und am meisten nachfolgende Kopplungen auslöst — das klassische Fail-First-Prinzip der Constraint-Programmierung.

**Expansion.** Jeder Knoten des Suchstrahls wird um bis zu `branch` beste Kandidaten des gewählten Slots erweitert.

**Beschneidung (`pruneBeam`), in genau dieser Reihenfolge:**

1. **Billiges Ranking.** Jeder erzeugte Nachfolger wird über die *Mitschrift* seiner bisherigen Setzungen bewertet, nicht über ein vollständiges Monatsaudit. Diese Mitschrift entsteht beim Setzen ohnehin und kostet keinen weiteren Regeldurchlauf.
2. **Zulässigkeitsfilter** nach 3.5.
3. **Entdopplung** über die Signatur der Belegung. Zwei Wege zur selben Belegung ergeben einen Knoten.
4. **Forward-Checking** — der teuerste Schritt und deshalb der letzte. Für die nächsten `lookahead` künftigen Slots wird geprüft, ob ihre Kandidatenmenge noch nicht leer ist. Ein Knoten mit leerer Folge-Domäne ist eine Sackgasse und wird verworfen; aus der Warteliste rückt begrenzt nach. Die Zahl der Prüfungen je Slot ist auf `width + min(width, 24)` gedeckelt.
5. **Endsortierung** und Kappen auf `width`.

Die Reihenfolge ist entscheidend für die Laufzeit: Vor der Umstellung lief das Forward-Checking auf allen erzeugten Nachfolgern statt nur auf denen, die überhaupt in den Suchstrahl passen.

**Exakte Restsuche.** Bleibt am Ende eines Laufs ein Feld offen, startet auf den besten acht Endknoten eine erschöpfende Tiefensuche, sofern höchstens `MAX_EXACT_REMAINING = 7` Felder offen sind. Sie ist durch ein Knotenbudget begrenzt (`exact`, siehe 3.7) und liefert für kleine Restprobleme ein exaktes Optimum.

**Auswahl des Ergebnisses.** Aus dem Suchstrahl werden die besten `EXACT_FINALISTS = 24` Knoten billig vorsortiert und nur diese vollständig bewertet. Bei Gleichstand entscheidet die Belegungssignatur — die Auswahl ist damit vollständig deterministisch.

**Fairness-Politur.** Anschließend laufen `polish`-Durchgänge (1 / 2 / 3 je Intensität): Jede selbst gesetzte Zelle wird gegen jede Alternative getestet, jeder Zug vollständig neu bewertet und nur bei strikt besserem Schlüssel übernommen.

**Schlussaudit.** Zum Abschluss wird der gesamte Monat vollständig auditiert. Dieses Audit meldet sich als eigene Phase — es gehört zum *Aufbau*, nicht zum Optimalitätsnachweis der Stufe 4.

### 3.7 Suchprofile und Rückfallkette

Ein Monat wird mit bis zu drei Profilen bearbeitet:

| Profil | Modus | Strategie | Suchstrahl | Verzweigung | Exaktbudget | Lookahead |
|---|---|---|---|---|---|---|
| `strict-balanced` — Null-Rot-Suche | `strict` | `balanced` | `max(8, beam)` | `max(4, branch)` | `max(800, 0,35·exact)` | `lookahead` |
| `strict-coverage` — Vertiefte Null-Rot-Suche | `strict` | `coverage` | `max(deepBeam, 2·beam)` | `max(deepBranch, branch+5)` | `max(3000, 0,8·exact)` | `lookahead + 1` |
| `confirmable-balanced` — Minimal-Rot-Suche | `confirmable` | `balanced` | `max(fallbackBeam, 3·beam)` | `max(fallbackBranch, branch+8)` | `max(6000, exact)` | `lookahead + 1` |

Die Grundwerte je Suchintensität:

| Intensität | `beam` | `branch` | `deepBeam` | `deepBranch` | `fallbackBeam` | `fallbackBranch` | `exact` | `lookahead` | `polish` |
|---|---|---|---|---|---|---|---|---|---|
| `Standard` | 10 | 5 | 18 | 7 | 24 | 9 | 3 200 | 3 | 1 |
| `Tief` | 16 | 6 | 28 | 9 | 36 | 11 | 9 000 | 4 | 2 |
| `Maximum` | 24 | 8 | 44 | 12 | 56 | 14 | 22 000 | 5 | 3 |

Das dritte Profil existiert nur, wenn der Minimal-Rot-Fallback zugelassen ist. Nacheinander ausgeführt bilden die Profile eine Kette: Das nächste startet nur, wenn das vorige keine vollständige zulässige Belegung fand. Auf mehreren Kernen laufen sie gleichzeitig (→ 3.12).

### 3.8 Stufe 2 — Iterative Tauschreparatur

Auf der Erstbelegung arbeiten pro Runde vier Schritte in fester Reihenfolge:

1. **Einzelumsetzungen** — eine Zelle auf eine andere Person.
2. **Paartausche und Dreierketten** — zwei beziehungsweise drei Zellen zyklisch.
3. **Tagespakete** — BD und HG desselben Tages gemeinsam.
4. **Lokale Neuplanung** — auffällige Tage werden vollständig verworfen und mit eigenem Knotenbudget neu durchsucht.

Jeder Nachbar wird vollständig neu bewertet. Übernommen wird nur, was den Schlüssel **strikt** verbessert und sämtliche harten Regeln sowie alle Laufobergrenzen einhält. Je Runde begrenzt ein Nachbarschaftsbudget die Suche (120 / 260 / 420 je Intensität). Bleiben zwei Runden hintereinander ohne Verbesserung, endet die Stufe vorzeitig.

Jeder der vier Schritte meldet seinen Beginn an die Oberfläche. Ohne diese Zwischenmeldungen schwieg die Anzeige bis zu 27 Sekunden am Stück, obwohl durchgehend gerechnet wurde.

### 3.9 Stufe 3 — Perfektion: Ruin and Recreate mit Late Acceptance

Hier entsteht die eigentliche Qualität. Der Aufbau folgt dem in der Personaleinsatzplanung etablierten Muster aus adaptiver Large-Neighborhood-Search (Ropke/Pisinger), Late-Acceptance-Hill-Climbing (Burke/Bykov) und absteigender Nachbarschaftssuche.

**Aufteilung des Zeitrahmens.** Aus dem konfigurierten Gesamtrahmen `T`:

```
Zertifizierungsreserve = min(30 s , max(4 s , 0,30·T))
Suchspanne             = max(0,50·T , T − Zertifizierungsreserve)
erster Abstieg endet   = min(0,45·T , Suchspanne)
```

Ohne diese Staffelung verbrauchte der erste vollständige Abstieg den gesamten Rahmen, und die Ruin-and-Recreate-Suche kam nie zum Zug — ein real aufgetretener Fehler, sichtbar an `Runden: 0` in der Telemetrie.

**Erster Abstieg.** Vor der eigentlichen Suche läuft ein vollständiger Abstieg mit Zugdeckel 20 000.

**Hauptschleife.** Je Runde:

1. **Operator wählen** — Roulette über die aktuellen Gewichte.
2. **Zerstören** — der Operator entfernt einen zusammenhängenden Ausschnitt der *selbst gesetzten* Dienste:

   | Operator | Ausschnitt |
   |---|---|
   | `zufallsfelder` | zufällig gezogene Dienstfelder |
   | `schwaechste-zellen` | die am schlechtesten bewerteten Zellen |
   | `tagesfenster` | ein zusammenhängender Kalenderabschnitt |
   | `wochenende` | ein vollständiges Freitag-bis-Sonntag-Paket |
   | `personenlast` | alle selbst gesetzten Dienste einer Person |
   | `verwandte-felder` | Felder ähnlicher Lage, Rolle und Besetzung |
   | `rollenblock` | eine Rolle innerhalb eines Kalenderfensters |
   | `sollabweichung` | die Dienste der Person mit dem größten Überhang |

3. **Neu aufbauen** — nach dem Prinzip des kleinsten Spielraums: zuerst das Feld mit den wenigsten wählbaren Personen. Die Reihenfolge bestimmt ein billiger Eignungsfilter *ohne* Regelauswertung; vollständig bewertet wird nur das jeweils gewählte Feld. Unter den besten Kandidaten wird rangverzerrt gezogen, damit derselbe Ausschnitt in verschiedenen Runden verschieden entsteht. Bleibt ein Feld ohne Kandidaten, scheitert der Aufbau und der Ausschnitt wird zurückgerollt.
4. **Annehmen** — Late-Acceptance-Hill-Climbing: Der neue Zustand wird übernommen, wenn er den aktuellen verbessert **oder** höchstens so schlecht ist wie der Zustand `L` Runden zuvor. `L` ist das Late-Acceptance-Fenster (150 / 400 / 800 je Intensität, einstellbar 10…5 000). Der Verlauf darf sich dadurch zeitweise verschlechtern und lokale Optima verlassen, ohne dass ein Temperaturplan abgestimmt werden müsste. Die beste je gesehene Belegung wird getrennt geführt; ein schlechter Zwischenzustand kann das Endergebnis nie verschlechtern.
5. **Belohnen** — der Operator erhält Punkte nach dem Ausgang der Runde:

   | Ausgang | Punkte |
   |---|---|
   | neuer globaler Bestwert | 33 |
   | verbessert den laufenden Zustand | 9 |
   | nur angenommen | 3 |
   | abgelehnt | 0 |

6. **Abstieg einschieben** — alle `descentInterval` Runden (25, bei `Standard` 40) läuft ein vollständiger Abstieg über sechs Nachbarschaften: Einzelumsetzung, Paartausch, Rollentausch am selben Tag, Dreierkette, Tagespaket, Wochenendpaket. Nach jeder Annahme beginnt die Reihenfolge von vorn — Variable Neighborhood Descent im engeren Sinn.

**Gewichtsanpassung.** Alle 50 Runden:

```
w ← max(0,05 , 0,8·w + 0,2·(erreichte Punkte / Einsätze))
```

Die Untergrenze `0,05` sorgt dafür, dass kein Operator vollständig verschwindet; ein Operator, der lange nutzlos war, kann nach einem Zustandswechsel wieder gebraucht werden.

**Größe des Ausschnitts.** Ropke und Pisinger empfehlen für ALNS merklich große Ausschnitte in der Größenordnung von zehn bis vierzig Prozent der Entscheidungsvariablen. Diese Empfehlung gilt für Probleme mit *billigem* Wiederaufbau; hier kostet jedes neu zu besetzende Feld eine vollständige Kandidatenbewertung. Der Anteil regelt sich deshalb selbst:

```
Spielraum  = clamp(0…1 , noch bezahlbare Runden / 260)
Obergrenze = 0,06 + (0,40 − 0,06) · Spielraum
Zuschlag   = min(0,15 , Stagnation / 1200)
Anteil     = 0,06 + Zufall · (Obergrenze − 0,06) + Zuschlag
Ausschnitt = clamp(2 … belegte−1 , round(belegte · Anteil))
```

„Noch bezahlbare Runden" wird ab der fünften Runde aus der **gemessenen** Rundendauer und der Restzeit der Suchspanne berechnet. Bei knappem Rahmen entstehen kleine, zahlreiche Ausschnitte, bei großzügigem Rahmen große und gründliche. Anhaltende Stagnation vergrößert den Ausschnitt zusätzlich — dann ist ein weiter Sprung mehr wert als viele kleine.

Die Zwischenstufe war eine gemessene Fehlentscheidung: Mit fest nach oben gezogenem Anteil (10–40 %) brachte ein 20-Sekunden-Rahmen überhaupt keinen Gewinn mehr, weil zu wenige Runden hineinpassten. Deshalb die Selbstregelung statt einer festen Zahl.

**Stagnation.** Bleibt die Suche `max(600, 20·Slotzahl)` Runden ohne neuen Bestwert, springt sie auf die beste bekannte Belegung zurück. Hilft auch das nicht, endet die Suchphase zugunsten der Zertifizierung.

**Prüfreihenfolge eines Zuges.** Ein Zug wird zuerst an den *veränderten* Zellen geprüft — Regelstufe, Wählbarkeit, Obergrenzen — und nur, wenn er das übersteht, vollständig bewertet. Die Obergrenzenprüfung zählt dabei den Zustand *nach* dem Zug; die frühere Fassung rechnete den bereits angewandten Zug doppelt gegen die Grenze und lehnte gültige Züge exakt an der Obergrenze ab.

### 3.10 Stufe 4 — Zertifizierung der Optimalität

Der Nachweis arbeitet anders als jede Suchstufe: Er bricht **nicht** bei der ersten Verbesserung ab, kennt innerhalb eines Durchgangs keine Abkürzung und keinen Zugdeckel. Geprüft werden

- **jede** Einzelumsetzung jedes selbst gesetzten Dienstfeldes auf **jede** dort wählbare Person und
- **jeder** Paartausch zweier selbst gesetzter Dienste — gleiche Rolle an verschiedenen Tagen sowie BD gegen HG am selben Tag.

Findet ein vollständiger Durchgang keine Verbesserung mehr, ist die Belegung bezüglich dieser beiden Nachbarschaften **beweisbar nicht mehr verbesserbar**; das Ergebnis wird als `zertifiziert` ausgewiesen. Findet der Durchgang noch Verbesserungen, werden sie übernommen und es folgt ein begrenzter Abstieg (Zugdeckel 8 000, höchstens `max(2 s, 0,1·T)`), danach ein neuer Durchgang — bis zu vier Anläufe mit je bis zu sechs internen Runden.

**Der Nachweis gilt nur für den Zustand, den er geprüft hat.** Wird nach einer bestandenen Zertifizierung noch einmal abgestiegen und dabei etwas verändert, ist der Nachweis verbraucht: Er beträfe eine Belegung, die gar nicht ausgeliefert wird. Ausgewiesen bleibt er dann nur, wenn der Abstieg nachweislich nichts mehr gefunden hat. Reicht der Zeitrahmen für keinen vollständigen Durchgang, meldet die Oberfläche `zeitbegrenzt` statt eine Optimalität zu behaupten.

### 3.11 Reichweite der Optimalitätsaussage

Die Zertifizierung beweist genau das, was sie prüft: dass **keine Einzelumsetzung und kein Paartausch** das Ergebnis in der lexikografischen Zielordnung noch verbessert. Das ist eine nachgewiesene lokale Optimalität bezüglich dieser beiden Nachbarschaften und deutlich mehr als eine bloße Heuristikbehauptung.

Es ist ausdrücklich **kein** Beweis globaler Optimalität. Eine Verbesserung, die nur durch das gleichzeitige Umstellen von drei oder mehr Diensten erreichbar wäre, kann bestehen bleiben — auch wenn die Perfektionsphase Dreierketten, Tagespakete und Wochenendpakete zusätzlich absucht, denn dort gelten Zugdeckel und Zeitgrenzen. Ein vollständiger externer MIP- oder CP-SAT-Lauf kann in Einzelfällen weiter kommen; im Browser ist er nicht verfügbar. Die Oberfläche benennt diesen Unterschied und behauptet nie mehr, als nachgewiesen wurde.

### 3.12 Zufall, Startwerte und Reproduzierbarkeit

Der Zufallsgenerator ist ein Xorshift-32 über einem FNV-1a-Startwert. Er wird **nie** aus der Uhr, der Prozesskennung oder `Math.random()` gespeist, sondern aus:

```
Startwert = Fingerabdruck(Ausgangsmonat) | Fingerabdruck(Laufparameter) | Fingerabdruck(Perfektionsparameter) | Streuwert
```

Der Streuwert unterscheidet die parallelen Perfektionsläufe. Ohne ihn wären alle Stränge identisch und der Mehrfachstart wertlos.

| Modus | Bedingung | Determinismus |
|---|---|---|
| `converge` | kein ausdrücklicher Zeitrahmen (Tests, direkte Aufrufe) | **streng** — die Phase endet an eigenen Abbruchkriterien, nicht an der Uhr |
| `budget` | Zeitrahmen gesetzt (immer aus dem Studio) | **praktisch, nicht beweisbar** — die Selbstregelung der Ausschnittsgröße liest die gemessene Rundendauer, und wie viele Runden in eine Minute passen, entscheidet die Maschine |

Beide Aussagen sind je durch einen eigenen Test abgedeckt. Die abschließende Zertifizierung stabilisiert den Endpunkt im Zeitrahmenmodus zusätzlich, weil sie unabhängig vom Suchpfad denselben lokalen Optimalitätszustand ansteuert.

### 3.13 Ausführung auf mehreren Kernen

Der Lauf verlässt den Anzeigestrang vollständig und arbeitet in eigenen Arbeitssträngen (`js/auto-plan-worker.js`, Modulworker). Das hat zwei Wirkungen, die sich mit Taktung allein nicht erreichen lassen:

- **Die Oberfläche bleibt frei.** Fortschrittsbalken, Animation, Kommentierung und Abbruch laufen weiter, während gerechnet wird. Gemessen liegt die Antwortzeit des Anzeigestrangs während eines vollen Laufs bei einigen hundert Millisekunden im ungünstigsten Fall und meist bei zehn bis vierzig.
- **Die Rechnung wird schneller.** Im Anzeigestrang musste sie regelmäßig bis zum nächsten Bildaufbau abgeben und verlor dadurch einen erheblichen Teil ihrer Zeit ans Warten. Im Arbeitsstrang gibt es nichts zu zeichnen; die Taktung entfällt vollständig (`createPacer()` liefert dort bewusst eine leere Funktion).

**Strangzahl:** `max(1, min(4, Kerne − 1))`. Ein Kern bleibt für Anzeige und Animation frei.

**Protokoll.** Der Anzeigestrang schickt genau zwei Auftragsarten und empfängt vier Antwortarten:

| Richtung | Nachricht | Inhalt |
|---|---|---|
| → Strang | `construct` | Zustand, Monat, Laufparameter, Profilkennung |
| → Strang | `perfect` | Zustand, Laufparameter, fertiger Aufbau, Fortschrittsuntergrenze |
| ← Strang | `progress` | Fortschrittsereignis **ohne** das mitgeführte Ergebnis |
| ← Strang | `constructed` | vollständiges Aufbauergebnis |
| ← Strang | `done` | vollständiges Endergebnis |
| ← Strang | `error` | Name und Meldung |

Ein unbekannter Auftrag wird sofort mit `error` beantwortet. Zuvor blieb er unbeantwortet, und der Anzeigestrang wartete bis zum Zeitlimit auf eine Antwort, die nie kam.

**Phase 1 — Aufbau parallel.** Die bis zu drei Profile starten gleichzeitig statt nacheinander. Bei schwierigen Monaten, die alle Stufen durchlaufen, verkürzt das die Wartezeit auf die des längsten statt auf die Summe aller. Liefert das erste Profil eine vollständige Belegung ohne rote Ausnahme, werden die übrigen sofort beendet — genau der Punkt, an dem auch die serielle Kette abgebrochen hätte.

**Phase 2 — Perfektion parallel.** Mehrere Stränge verbessern denselben Aufbau mit verschiedenen Startwerten; der beste Vorschlag gewinnt. Weil die Suche stochastisch ist, streuen ihre Ergebnisse, und das Beste aus mehreren unabhängigen Läufen ist verlässlich besser als ein einzelner. Der Aufbau wird dabei genau **einmal** berechnet und an alle Perfektionsläufe verteilt. Die Stränge der ersten Phase werden weiterverwendet — sie haben ihre Module bereits geladen.

Verglichen wird in beiden Phasen mit derselben lexikografischen Zielordnung, nach der auch optimiert wird. Fehlt die Unterstützung für Arbeitsstränge, läuft alles unverändert im Anzeigestrang.

**Warum nicht die Grafikkarte.** Grafikprozessoren gewinnen ihre Leistung daraus, dass tausende Rechenwerke denselben Befehlsstrom auf flachen Zahlenfeldern ausführen. Die Regelbewertung ist das Gegenteil davon: verzweigungsreich, auf Zeichenketten und Objektgraphen arbeitend, mit Datumsrechnung und Nachschlagen in Nachbarmonaten. Sie ließe sich dort nur ausführen, indem das gesamte Regelwerk ein zweites Mal als numerische Fassung nachgebaut würde — und genau das ist ausgeschlossen: Die bestehende Regelengine ist die einzige fachliche Wahrheitsquelle, eine zweite Fassung würde von ihr abweichen, ohne dass es jemand bemerkt. Hinzu kommt, dass die Suche in ihrem Kern aufeinanderfolgend ist: Jede Annahmeentscheidung hängt am Ergebnis der vorigen.

### 3.14 Fortschrittsereignisse und Kommentierung

Jede Stufe meldet Ereignisse mit Phase, Fortschritt zwischen null und eins, Klartextmeldung und den jeweils passenden Zählwerten. Daraus speisen sich Balken, Phasenband, Kennzahlen, Animation und die Algorithmuskommentierung.

**Der Balken läuft ausschließlich vorwärts.** Jede Stufe meldet ihren eigenen Fortschritt von null bis eins und wird auf einen Abschnitt der Gesamtskala abgebildet; eine Sperre auf den höchsten je gesehenen Wert verhindert Rücksprünge beim Stufenwechsel. Dasselbe gilt für das Phasenband.

**Mehrere Läufe, eine Anzeige.** Angezeigt wird der jeweils weiteste Lauf; Zählwerte werden über alle Läufe summiert. Beim Wechsel von Aufbau auf Perfektion beginnen neue Läufe mit eigenen Zählwerten, deshalb wird beim Stufenwechsel zurückgesetzt — sonst summierten sich die Stände beider Stufen.

**Die Kommentierung trennt Meilensteine von Ereignissen.** Fünf Meilensteine erscheinen in fester Ordnung und je genau einmal:

1. Fixpunkte werden gesichert
2. Constraint-Suche läuft
3. Tauschreparatur läuft
4. Perfektionsphase läuft
5. Optimalitätsnachweis läuft

Alles andere sind Ereignisse innerhalb einer Stufe. Diese Trennung war notwendig, weil mehrere Läufe gleichzeitig melden: Der Minimal-Rot-Rückfall meldet sich schon in der ersten Sekunde als „Reparatur", und ohne feste Ordnung stand seine Meldung vor der Constraint-Suche, während derselbe Meilenstein dreimal erschien — einmal je Lauf.

Ereignismeldungen sind gedrosselt (Mindestabstand 900 ms je Art, aufeinanderfolgende Wiederholungen unterdrückt), damit die Liste lesbar bleibt. Ausgenommen sind Meilensteine, die erste übernommene Verbesserung und die Schlussmeldung. Die Schlussmeldung eines einzelnen Perfektionslaufs erscheint nur einmal; das maßgebliche Schlusswort spricht die Ergebniszeile über den Gewinnervorschlag.

**Kein Abschnitt schweigt länger als etwa fünf Sekunden.** Tauschrunden melden jeden ihrer vier Schritte, die Nachbarschaftsabsuche und der Optimalitätsnachweis senden gedrosselte Lebenszeichen mit der Zahl der bereits geprüften Züge.

### 3.15 Zwischenspeicher und Laufzeit

Der Lauf wurde messbar beschleunigt, damit der Zeitrahmen der Suche zugutekommt und nicht der Verwaltung:

- Die Zählfunktionen der Regelbewertung arbeiten ohne Zwischenobjekte. Sie liegen im innersten Ring und wurden zuvor von der Speicherbereinigung dominiert.
- Kalenderzerlegung, Feiertagsblöcke, Personalindex, planbarer Tagespool und datumsabhängige Qualifikation werden zwischengespeichert.
- Der Katalog erfüllbarer Wünsche und der planbare Personenkreis werden je Lauf einmal bestimmt statt je Zwischenbewertung.
- Zwischenzustände der Konstruktion werden aus der bereits vorliegenden Bewertungsmitschrift gerankt statt mit einem vollständigen Monatsaudit je erzeugtem Nachfolger.
- Das Forward-Checking läuft erst nach billigem Ranking und Entdopplung und nur für so viele Varianten, wie in den Suchstrahl passen.
- Die Perfektionsphase prüft Züge zuerst an den veränderten Zellen und bewertet nur die Überlebenden vollständig.
- Die absteigende Suche beginnt bei den auffälligsten Zellen und findet ihre nächste Verbesserung dadurch früher.

**Der Vergleichsgruppenspeicher** verdient eine eigene Erklärung, weil er der wirksamste und zugleich heikelste Eingriff ist. Die Vergleichsgruppe eines Dienstfelds — wer am selben Datum überhaupt in Frage käme — ist der mit Abstand teuerste Teil einer Bewertung und wurde zuvor für **jeden** Kandidaten desselben Feldes erneut bestimmt. Sie hängt aber nicht am Kandidaten, sondern am Belegungszustand. Der Speicher hängt deshalb an einer Marke, die den vollständigen Belegungszustand des Monats beschreibt und zusätzlich die laufende Nummer des Planungslaufs trägt:

```
Marke = Laufnummer | Jahr-Monat | je Tag: bd>hg
```

Ändert sich ein einziger Dienst, ändert sich die Marke und der Speicher wird verworfen. Gesetzt wird sie an **allen drei** Stellen, die bewerten — Kandidatenaufzählung, Einzelbewertung und Zielbewertung —, und beim Anlegen des Optimierers sowie am Ende jeder Perfektionsphase ausdrücklich gelöscht. Die erste Fassung setzte sie nur in der Kandidatenaufzählung; die beiden anderen Stellen liefen dann auf einem anderen Belegungszustand als der Speicher annahm. Ein Gleichwertigkeitstest über 21 600 Bewertungen in 40 zufällig erzeugten Belegungszuständen belegt: **null Abweichungen**, bei 4,27-facher Geschwindigkeit der Kandidatenaufzählung.

In der Summe fällt ein voller 31-Tage-Monat von deutlich über zehn Minuten auf einen Aufbau im Bereich weniger Sekunden; die verbleibende Zeit gehört vollständig der Perfektionsphase.

### 3.16 Abbruch, Fehler und Grenzfälle

| Situation | Verhalten |
|---|---|
| Keine offenen Felder | Der Lauf endet sofort mit der Meldung, dass der Monat bereits vollständig ist. Nichts wird verändert. |
| Kein Profil findet eine vollständige Belegung | Das beste unvollständige Ergebnis wird angezeigt, die Zahl offener Felder benannt, die Übernahme bleibt gesperrt. |
| Nur mit roten Ausnahmen lösbar | → Kapitel 4: Minimal-Rot-Fallback mit Einzelprüfung und Pflichtbegründung. |
| Abbruch durch die Bedienung | Die Arbeitsstränge werden beendet. Ein Abbruchsignal lässt sich nicht über Strangs hinweg reichen; das Beenden ist der Abbruch. |
| Laufgrenze unter dem bestehenden Stand | Der Start bleibt gesperrt, die betroffene Zeile wird hervorgehoben. |
| Ausnahme in einem Strang | Sie wird als `error` gemeldet, benannt angezeigt und beendet den Lauf, ohne etwas zu schreiben. |
| Fingerabdruck verändert | Die Übernahme wird verworfen. Laufparameter, Perfektionsparameter und Baseline sind fingerabdruckgeschützt. |

---

## 4. Minimal-Rot-Fallback und Bestätigung

Eine rote Variante wird nur erzeugt, wenn:

- keine vollständige Null-Rot-Lösung gefunden wurde;
- der Fallback vor dem Lauf zugelassen wurde;
- die maximale konfigurierte Zahl roter Vorschläge nicht überschritten wird;
- sämtliche roten Kandidaten technisch wählbar bleiben;
- keine graue oder obergrenzenwidrige Einteilung erforderlich ist.

Vor der Übernahme muss jede rote Zelle einzeln geprüft werden. Über **In Tabelle zeigen** lässt sich die betroffene Tageszeile direkt anspringen. Besondere rote Ausnahmen benötigen zusätzlich einen begründenden Kommentar. Erst danach wird der Übernahmebutton freigegeben.

Für jede bestätigte rote Zelle werden gespeichert:

- Zeitstempel;
- Datum;
- Rolle;
- Person;
- vollständige Gründe;
- Bestätigungstyp;
- Quelle `auto-plan`;
- Kommentar.

---

## 5. Neue werktägliche Dienstfolgeregel

**Eigener HG am Montag bis Donnerstag unmittelbar vor eigenem BD am Folgetag ist rot.**

Die Prüfung ist symmetrisch:

- Wird zuerst der Folge-BD gewählt, erscheint die rote Bewertung beim vorangehenden HG.
- Wird zuerst der HG gewählt, erscheint die rote Bewertung beim Folge-BD.

Freitag-HG vor Samstags-BD bleibt von dieser Regel ausgenommen, da hierfür die gesonderten Wochenendkopplungen gelten. Bereits graue oder nicht wählbare Kandidaten werden durch die Zusatzregel niemals wieder freigeschaltet.

Die identische Bewertung gilt im manuellen Picker, im Auto-Plan und unter **Offene Punkte**.

---

## 6. Übernahme- und Manipulationsschutz

Der Vorschlag ist an mehrere Fingerprints gebunden:

- planungsrelevanter Monatszustand;
- Personaldefinition;
- geladene Nachbarmonate;
- Abwesenheiten, Wünsche und Optionen;
- Such- und Obergrenzenkonfiguration;
- iterative Reparaturkonfiguration;
- finale Änderungsliste.

Unmittelbar vor der Übernahme werden erneut geprüft:

- unveränderter Ausgangszustand;
- freie Zielfelder;
- eindeutige Personal-IDs;
- keine doppelten Vorschläge;
- sämtliche Regeln im vollständigen Endzustand;
- individuelle Obergrenzen;
- vollständige Belegung;
- Rot-Limit und Bestätigung;
- Vorschlagsfingerprint.

Bei Abweichung bleibt der Plan unverändert und der Auto-Plan muss neu berechnet werden.

---

## 7. Manuelle Planung und sonstige Regeln

### Nicht überschreibbar

- fehlende Qualifikation;
- inaktive oder nicht planbare Person;
- gleichzeitiger BD/HG derselben Person;
- direkt aufeinanderfolgende eigene BD.

### Besondere rote Bestätigung

- Abwesenheit;
- Polednia-Sperre;
- dauerhaft hinterlegtes hartes BD-Maximum.

### Wochenenden und Kopplungen

- AA-BD Freitag: Freitag-HG und Samstags-BD personengleich;
- Facharzt-BD Samstag: Sonntag-HG personengleich;
- AA-BD am Feiertagsvortag: Vortags-HG und Feiertags-BD personengleich;
- mindestens ein BD am Wochenende entspricht `1,0` Wochenendäquivalent;
- ausschließlich HG entspricht `0,5`;
- regelkonformes gekoppeltes Standardwochenende bleibt `1,0`;
- nicht gekoppelte Mehrfachbelastung wird gesondert markiert.

Der Jahresverlauf bleibt ein neutraler Hinweis und beeinflusst die automatische Rangfolge nicht.

---

## 8. Technische Architektur

| Modul | Verantwortung |
|---|---|
| `js/app.js` | Monatsansicht, Dialoge, Import und Export |
| `js/state.js` | Zustand, lokale Sicherung, Serverabgleich |
| `js/rules-core.js` | Datum, Personal, Zählungen und Lasten |
| `js/rules-evaluation.js` | bestehende fachliche Kandidatenbewertung |
| `js/rules-evaluation-v2.js` | symmetrische rote Werktagsfolge HG → BD |
| `js/rules-reporting-v2.js` | identische Policy für offene Punkte |
| `js/auto-planner-engine.js` | parametrierbare globale Konstruktionssuche, Zielordnung und harte Obergrenzen |
| `js/auto-planner-v3.js` | iterative Reassignments, Swaps, Ketten und lokale Neuplanung |
| `js/auto-planner-v4.js` | finale datumsgenaue Fairness-Neuberechnung |
| `js/auto-planner-optimizer.js` | Ruin-and-Recreate-Perfektionsphase, Late Acceptance und Zertifizierung |
| `js/auto-planner-v5.js` | Gesamtpipeline, Zeitrahmen, Fortschrittskette und Übernahmeschutz |
| `js/auto-planner.js` | öffentliche Auto-Plan-Schnittstelle |
| `js/cooperative-scheduling.js` | zeitgesteuerte Rückgabe an den Browser während langer Läufe |
| `js/auto-plan-visualizer.js` | Canvas-Darstellung des laufenden Algorithmus |
| `js/auto-plan-commentary.js` | Übersetzung der Fortschrittsereignisse in Klartext |
| `js/auto-plan-runner.js` | Verteilung des Laufs auf mehrere Kerne und Auswahl des besten Ergebnisses |
| `js/auto-plan-worker.js` | Rechenkern als eigener Arbeitsstrang |
| `js/auto-plan-studio-v5.js` | Konfiguration, Laufansicht, Tagesvorschau und Bestätigung |
| `js/auto-plan-ui.js` | Einstiegspunkt des Studios |
| `auto-plan-studio.css` | vollständiges Layout und Design des Studios |
| `docs/AUTO-PLAN-RESEARCH-20260802.md` | Recherche- und Architekturgrundlage |

---

## 9. Tests und Qualitätssicherung

```bash
npm ci
npm run check
npm test
npm run test:e2e
npm run verify
```

Die Tests decken insbesondere ab:

- vollständige BD/HG-Besetzung;
- Null-Rot-Priorität;
- Minimal-Rot-Fallback;
- absolute graue Sperren;
- individuelle BD-, HG- und Gesamtobergrenzen;
- Startblockierung bei Grenzen unter Fixpunkten;
- konfiguriertes Rot-Limit;
- deaktivierten Fallback;
- Fixpunktschutz;
- strenge Reproduzierbarkeit im Konvergenzmodus;
- gleichwertige Ergebnisse im Zeitrahmenmodus;
- dynamische Engpasswahl;
- Forward-Checking und Suchtelemetrie;
- iterative Reassignments, Swaps, Ketten und lokale Neuplanung;
- unveränderte Fixpunkte nach der Perfektionsphase;
- Abwehr eines nachträglich veränderten Fixpunkts bei der Übernahme;
- Einhaltung der Obergrenzen nach der Perfektionsphase;
- Sperrwirkung von Abwesenheiten in allen Stufen;
- Konvergenz- und Zeitrahmenmodus der Perfektionsphase;
- abschaltbare Perfektionsphase;
- bestandener Optimalitätsnachweis;
- fingerprintgeschützte Perfektionsparameter;
- genau eine Abschlussmeldung je Lauf;
- Reihenfolge und Einmaligkeit der Meilensteine der Algorithmuskommentierung;
- Erreichbarkeit und Bedienbarkeit jeder Personenzeile im Parameterbereich;
- festgelegte BD-Obergrenzen und abgeleitete HG-Vorgaben;
- Gleichwertigkeit des Vergleichsgruppen-Speichers über zufällig erzeugte Belegungszustände;
- zeitabhängige Beförderung;
- rote Werktagsfolge HG → BD in beiden Eingabereihenfolgen;
- Freitag-/Samstag-Ausnahme;
- vollständige Vorschlagsfingerprints;
- erneuten Übernahmeaudit;
- Pflichtkommentar bei besonderen roten Ausnahmen;
- eine Tageszeile mit gemeinsamem BD und HG;
- Sticky Header und Scrollbarkeit bei kleinen Viewports;
- keine Servermutation vor ausdrücklicher Übernahme.

---

## 10. Lokale Entwicklung und Deployment

```bash
npm ci
npm run verify
```

Für die Oberfläche genügt ein statischer Webserver. Backendfunktionen benötigen eine Cloudflare-kompatible Pages-Functions-Umgebung mit den vorgesehenen KV-Bindings.

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt.
