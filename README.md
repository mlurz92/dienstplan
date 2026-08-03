# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.8.0`<br>
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** Algorithmus `v8` — *Incremental Constraint Observatory*: inkrementelle Zählwerke und Zustandsmarken, globale Engpasssuche, zwei adaptive Operatordimensionen, segmentweise Gewichtsanpassung nach Ropke/Pisinger, Luby-Neustarts, Portfolio ohne Doppelarbeit, Null-Rot-Guardrail und Optimalitätsnachweis<br>
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

### Einstellungen

Am rechten Rand der Action Bar sitzt ein **fixiertes Zahnrad**. Es gehört keiner Gruppe an, wandert in keiner Dichtestufe ins Überlaufmenü und bleibt dadurch auf jeder Fensterbreite an derselben Stelle erreichbar. Zuvor lagen die Einstellungen in einer Gruppe „App“ und waren ausgerechnet auf schmalen Fenstern zwei Klicks entfernt.

Das Modal gliedert sich in drei Reiter nach dem ARIA-Tab-Muster einschließlich Pfeiltastensteuerung. Jede Einstellung ist tatsächlich verdrahtet; einen Schalter, der nur gespeichert und nirgends gelesen wird, gibt es bewusst nicht.

**Darstellung**

| Einstellung | Wirkung | Wirkort |
| --- | --- | --- |
| Informationsdichte | `comfortable` oder `compact` | `data-app-density` |
| Bewegung | Systemvorgabe oder reduziert | `data-motion`, Klasse `reduce-motion` |
| Monatsfarbsystem | Trend-Atlas, klassische Monatspalette oder neutral | `data-month-colors`, `js/color-director.js`, `js/theme.js` |
| Erklärende Tooltips | vertiefte Erklärungen im Studio | `data-rich-tooltips` |
| Wochenenden hervorheben | Kontrast von Samstag, Sonntag und Feiertag | `data-weekend-emphasis` |
| Atmosphärischer Hintergrund | die weichen Farbfelder hinter der Arbeitsfläche | `data-ambient-backdrop` |

**Arbeitsweise**

| Einstellung | Wirkung | Wirkort |
| --- | --- | --- |
| Verzögerung des automatischen Speicherns | 300–5000 ms zwischen letzter Eingabe und Serverlauf | `autoSaveDelayMs()` in `js/state.js` |
| Algorithmus-Kommentar | der laufende Klartextbericht im Studio | `js/auto-plan-studio-v5.js` |
| Suchvisualisierung | die lebende Ringdarstellung während des Laufs | `js/auto-plan-visualizer.js` |

**Auto-Plan v8**

Leistungsprofil, Suchintensität, Optimierungsfokus, Zeitbudget, parallele Suchläufe, maximale rote Ausnahmen, **Runden des Optimalitätsnachweises**, Perfektionsphase, **Portfolio-Diversität** und Minimal-Rot-Fallback.

Die Einstellungen verwenden Schema `v4`, werden lokal offlinefest gesichert, über den bestehenden Bootstrap-Pfad synchronisiert, in JSON-Sicherungen einbezogen und vor jeder Verwendung normalisiert. Ein Stand nach älterem Schema erhält die neuen Gruppen mit ihren Vorschlagswerten, ohne dass ausdrücklich gesetzte Altwerte verlorengehen.

---

## 3. Null-Rot-Guardrail v8

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
2. adaptive Null-Rot-Rescue (aus v6 übernommen, in v8 entdoppelt)
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

## 4. Algorithmusarchitektur v8

v8 ändert **keine einzige fachliche Regel**. Die produktive Regelengine bleibt die alleinige Wahrheitsquelle: Jede Bewertung, die über Annahme oder Ablehnung entscheidet, durchläuft dieselbe Prüfung wie eine Eingabe von Hand. Eine zweite, numerisch vereinfachte Regelfassung existiert bewusst nicht — sie würde von der ersten abweichen, ohne dass es jemand bemerkt.

Was v8 verändert, ist alles **um** diese Bewertung herum.

### 4.1 Der eigentliche Engpass

Das Problem ist klein: rund 62 Entscheidungsvariablen (BD und HG über einen Monat) bei rund neun Kandidaten je Feld. Die *Bewertung* einer Belegung ist dagegen teuer, weil sie die vollständige Regelengine über alle vorgeschlagenen Zellen führt. Der Engpass liegt damit nicht in der Größe des Suchraums, sondern in den **Kosten je Zielfunktionsauswertung**.

Die Analyse der v7.5-Fassung zeigte, dass ein erheblicher Teil dieser Kosten gar nicht in der Regelbewertung entstand, sondern in ihrer Umgebung:

| Nebenrechnung | Verhalten in v7.5 | Aufrufhäufigkeit |
| --- | --- | --- |
| sortierte Tagesliste | `Object.keys().sort()` je Aufruf | mehrfach je Zielfunktionsauswertung |
| Liste der offenen Felder | vollständiger Neuaufbau | je Zielfunktionsauswertung |
| Marke des Vergleichsgruppen-Speichers | fortlaufend verkettete Zeichenkette über alle Tage | **in jedem Bewertungspfad** |
| Dienstzahlen je Person | vollständiger Monatsscan über `countRoleInMonth` | je Kandidat und je Zug |
| Kennung eines Suchknotens | zusammengesetzte Zeichenkette über alle offenen Felder | je erzeugtem Nachfolger |

Genau diese fünf Punkte macht v8 inkrementell. Die Vorlage dafür ist die *incremental score calculation* aus der Constraint-Solver-Praxis (OptaPlanner/Timefold), wo der Verzicht auf Vollberechnung als der mit Abstand größte Einzelhebel dokumentiert ist.

### 4.2 Die Indexschicht

`js/auto-plan-index.js` liegt zwischen Monatsdaten und Suche und hält:

- **gecachte Tageslisten** je Monatsobjekt in einer `WeakMap` — ohne den Monat zu verändern und ohne seine Lebensdauer zu verlängern;
- **gecachte Slotlisten des Ausgangsmonats**, eingefroren, weil sie geteilt werden. Für veränderliche Arbeitsmonate wird bewusst *nicht* zwischengespeichert: Dort wäre ein veralteter Eintrag ein Fehler;
- **internierte Personal-Kennungen** — jede Kennung erhält eine kleine ganze Zahl. Die Nummerierung wird vor jedem Lauf aus dem alphabetisch sortierten Personalstamm vorbelegt und ist dadurch in Arbeitsstrang und Anzeigestrang identisch; sonst hinge die Sortierung gleichwertiger Varianten davon ab, welcher Suchpfad zuerst lief;
- **Zählwerke** der gesetzten Dienste je Person und Rolle mit `ledgerApply` für einzelne Umbuchungen;
- **Spannweiten** als Gerechtigkeitsmaß;
- die **Luby-Neustartfolge**.

### 4.3 Exakte Zustandsmarken statt Streuwerte

Der Vergleichsgruppen-Speicher der Regelengine darf **niemals** einen Eintrag aus einem anderen Belegungszustand liefern. Eine Streuwertmarke mit Kollisionsrisiko kommt deshalb nicht in Frage. v8 verwendet zwei verlustfreie Verfahren:

1. **Konstruktion.** Die Marke entsteht aus internierten Kennungen über ein vorbelegtes Feld statt aus fortlaufender Verkettung. Zwei verschiedene Belegungen können nie dieselbe Marke tragen; die Bildung kostet aber nur noch eine Nachschlageoperation je Tag.
2. **Perfektionsphase.** Der Optimierer besitzt genau **einen Schreibtrichter** (`PlanOptimizer.write`). Probe, Übernahme, Wiederaufbau, Laden einer Belegung und Leeren eines Ausschnitts gehen alle dort hindurch. Die Marke ist deshalb ein fortgeschriebener Zähler in konstanter Zeit — exakt, aber praktisch kostenlos.

Der zweite Punkt ist die einzige Stelle, an der eine Abkürzung fachlich gefährlich wäre. Sie ist deshalb als Invariante getestet (`tests/auto-plan-v8.test.js`): Über eine lange gemischte Zugfolge muss gelten, dass gleiche Marke stets gleiche Belegung bedeutet und jede tatsächliche Änderung eine neue Marke erzeugt. Zusätzlich wird das mitgeführte Zählwerk gegen eine vollständige Neuberechnung geprüft.

### 4.4 Pipeline

```text
Ausgangsmonat
    │
    ├─ 1  Analyse
    │      Fixpunkte sichern · personengebundene Grenzen ableiten
    │      erfüllbare Wünsche einmalig katalogisieren
    │      Personal-Kennungen für den Lauf vorbelegen
    │
    ├─ 2  Constraint-gerichtete Konstruktion
    │      globale BD/HG-MRV über alle offenen Felder
    │      Beam Search · Forward Checking · inkrementelles Zählwerk
    │      strikte Profile: strict-balanced, strict-coverage
    │
    ├─ 3  Null-Rot-Rescue
    │      verbreiterter Suchstrahl, Kandidatenfächer, Backtracking
    │      läuft vor jedem Fallback, in genau einem Arbeitsstrang
    │
    ├─ 4  Iterative Tauschreparatur
    │      Einzelumsetzung · Paartausch · Dreierkette
    │      Tagespaket · lokale Neuplanung auffälliger Tage
    │
    ├─ 5  Adaptive Ruin-and-Recreate-Perfektion
    │      8 Zerstörungs- × 3 Reparaturoperatoren
    │      segmentweise Gewichtsanpassung (Ropke/Pisinger)
    │      Late Acceptance · absteigende Nachbarschaften
    │      Luby-Neustarts bei Stagnation
    │
    └─ 6  Optimalitätsnachweis und Schlussaudit
           Einzelumsetzung · Paartausch · Tagespaket, vollständig
```

Die Oberfläche liest diese Stufenbeschreibung aus `js/auto-planner-v8.js` (`AUTO_PLAN_STAGES`), statt sie ein zweites Mal als Text vorzuhalten.

### 4.5 Konstruktion

Verarbeitet werden ausschließlich Felder, die im Ausgangsmonat leer waren. Die Rollen sind nicht getrennt: Alle offenen BD- und HG-Felder konkurrieren gemeinsam um den nächsten Suchschritt. Das Feld mit der kleinsten echten Kandidatendomäne wird zuerst bearbeitet (*minimum remaining values*); Samstags-BD und Wochenendfelder entscheiden bei Gleichstand. Dadurch wird eine knappe HG-Ressource geschützt, bevor eine scheinbar leichte BD-Entscheidung sie verbraucht.

Je Zwischenzustand werden

- technisch nicht wählbare Kandidaten entfernt,
- strikte Profile zusätzlich von roten Kandidaten bereinigt,
- personengebundene Obergrenzen über das Zählwerk geprüft,
- Kandidaten nach Regelstufe, Empfehlungsvektor und Last sortiert,
- künftige Sackgassen durch Forward Checking verworfen,
- nur die besten entdoppelten Varianten im Suchstrahl behalten.

Das **Forward Checking** ist der teuerste Schritt und läuft deshalb erst, nachdem billig gerankt und entdoppelt wurde, und nur für so viele Varianten, wie in den Suchstrahl passen.

### 4.6 Die lexikografische Zielordnung

Harte Kriterien dominieren jede weiche Qualität. Der Schlüssel wird von links nach rechts verglichen; ein Unterschied auf einer Stufe entscheidet, ohne dass die folgenden noch betrachtet werden.

| # | Kriterium | Art |
| --- | --- | --- |
| 1 | Verletzungen der Laufobergrenzen | hart |
| 2 | graue / nicht wählbare Einträge | hart |
| 3 | offene Felder | hart |
| 4 | Überschreitung der Rot-Obergrenze | hart |
| 5 | rote Einträge | hart |
| 6 | besonders bestätigungspflichtige rote Einträge | hart |
| 7 | orange Einträge | Qualität |
| 8 | gelbe Einträge | Qualität |
| 9–15 | Schwerpunkt, Empfehlungsvektor, Wünsche, BD-Soll, Gesamtlast, AA-HG, Wochenenden, Samstagsstreuung | weich, Reihenfolge nach Optimierungsfokus |
| 16–18 | Restempfehlung | weich |
| **19–21** | **Spannweite von BD, Gesamtlast und Wochenendäquivalent** | **neu in v8** |

Die drei Spannweiten stehen bewusst am Ende. Sie ändern keine bereits getroffene Entscheidung und entscheiden nur dort, wo bisher die Reihenfolge der Aufzählung entschied. Der fachliche Grund: Varianz unterscheidet zwei Pläne nicht, bei denen dieselbe Streuung einmal auf viele kleine und einmal auf einen großen Abstand entfällt — wahrgenommen wird aber genau der Abstand zwischen der am stärksten und der am schwächsten belasteten Person.

Der **Optimierungsfokus** ordnet ausschließlich die weichen Stufen um:

| Fokus | Erste weiche Stufe |
| --- | --- |
| Ausgewogen | Empfehlungsvektor |
| Wünsche | erfüllte Wünsche |
| Lastenausgleich | BD-Sollabweichung, kombinierte Varianz, AA-HG-Varianz |
| Wochenenden | Wochenendvarianz und Samstagsstreuung |

### 4.7 Iterative Tauschreparatur

Nach der Konstruktion werden wiederholt geprüft: Einzelumsetzungen, Paartausche, Dreierketten, vollständige Tagespakete und die lokale Neuplanung auffälliger Tage. Jede Änderung muss die vollständige produktive Regelbewertung überstehen **und** die lexikografische Zielordnung verbessern. Die Runde endet vorzeitig, wenn zwei Durchgänge nacheinander nichts mehr finden.

### 4.8 Perfektionsphase: zwei adaptive Dimensionen

Die adaptive Large Neighborhood Search entfernt einen Ausschnitt der selbst geplanten Dienste und baut ihn neu auf. v8 macht **beide** Hälften dieses Zyklus adaptiv.

**Zerstörung** — acht Operatoren, jeder wählt einen zusammenhängenden fachlichen Ausschnitt:

| Operator | Ausschnitt |
| --- | --- |
| `zufallsfelder` | zufällig gewählte Dienstfelder |
| `schwaechste-zellen` | die am schlechtesten bewerteten Zellen |
| `tagesfenster` | ein zusammenhängender Kalenderabschnitt |
| `wochenende` | ein vollständiges Wochenendpaket |
| `personenlast` | alle Dienste einer Person |
| `verwandte-felder` | Felder ähnlicher Lage und Besetzung |
| `rollenblock` | eine Dienstart innerhalb eines Zeitfensters |
| `sollabweichung` | die Dienste der Person mit dem größten Überhang |

**Wiederaufbau** — neu in v8, drei Operatoren:

| Operator | Vorgehen |
| --- | --- |
| `spielraum` | kleinster Spielraum zuerst, rangverzerrte Wahl. Schnell, gut für kleine Ausschnitte |
| `bedauern` | **Regret-2**: bevorzugt wird das Feld, dessen zweitbeste Wahl spürbar schlechter ist als seine beste — dort kostet ein späteres Ausweichen am meisten. Deutlich robuster bei großen Ausschnitten |
| `gierig` | ausschließlich der bestbewertete Kandidat. Rettungsversuch nach einer Sackgasse |

Zuvor gab es nur eine Wiederaufbaustrategie; ein Scheitern kostete die ganze Runde folgenlos (`repairFailures`).

**Auswahl.** Beide Tabellen kombinieren eine kostenbewusste Upper-Confidence-Bound-Auswahl mit der **segmentweisen Gewichtsanpassung nach Ropke und Pisinger**:

```text
w_neu = w_alt · (1 − λ) + λ · (Segmentbelohnung / Segmentnutzungen)
```

mit Reaktionsfaktor λ = 0,35 und einer Segmentlänge von 40 Runden. Der Score einer Operatorwahl ist `Gewicht × Effizienz + Erkundungsbonus`, wobei Effizienz der Ertrag je Millisekunde Rechenzeit ist. Die Belohnung ist gestaffelt: 0 für verworfen, 3 für angenommen, 9 für den aktuellen Zustand verbessert, 33 für eine neue Bestlösung.

Der Grund für die Segmente: Reine UCB-Auswahl *vergisst nichts*. Belohnungen aus den ersten Runden bleiben für immer im Mittelwert und dominieren ihn irgendwann, obwohl sich die Suchlandschaft mit jeder angenommenen Lösung verändert.

**Annahme.** Late Acceptance Hill Climbing über der lexikografischen Zielordnung: Angenommen wird, was den aktuellen Zustand verbessert **oder** mindestens so gut ist wie der Zustand am Anfang eines Fensters fester Länge. Das erlaubt kontrolliertes Bergabgehen, ohne einen Temperaturplan abstimmen zu müssen. Die beste je gesehene Belegung wird getrennt geführt; ein schlechter Zwischenzustand kann das Ergebnis daher nie verschlechtern.

**Ausschnittsgröße.** Selbstregelnd zwischen 6 % und 40 % der selbst gesetzten Dienste. Die Literaturempfehlung gilt für Probleme mit billigem Wiederaufbau; hier kostet jedes Feld eine vollständige Kandidatenbewertung. Die Suche schätzt deshalb aus der gemessenen Rundendauer, wie viele Runden noch in den Zeitrahmen passen, und wählt den Anteil so, dass eine sinnvolle Rundenzahl erhalten bleibt. Anhaltende Stagnation vergrößert den Ausschnitt zusätzlich.

**Neustarts nach Luby.** Bleibt die Suche ohne neuen Bestwert, springt sie auf die beste bekannte Belegung zurück. Der Abstand zwischen zwei Neustarts folgt der Folge 1, 1, 2, 1, 1, 2, 4, 1, … multipliziert mit einer problemgroßen Einheit. Eine feste Stagnationsschwelle ist immer für die falsche Instanz gewählt: Auf einem gut konditionierten Monat startet sie viel zu spät neu, auf einem verwickelten viel zu früh. Die Luby-Folge braucht kein Instanzwissen und ist dennoch bis auf einen konstanten Faktor so gut wie die beste feste Wahl.

### 4.9 Optimalitätsnachweis

Der abschließende Durchlauf bricht **nicht** bei der ersten Verbesserung ab und kennt innerhalb eines Durchgangs keine Zeitschranke. Geprüft werden vollständig und ohne Abkürzung:

1. jede **Einzelumsetzung** — jede selbst gesetzte Zelle gegen jede zulässige Alternative;
2. jeder **Paartausch** — einschließlich des Rollentauschs am selben Tag;
3. jedes **Tagespaket** — der vollständige Tausch beider Dienste zweier Tage. *Neu in v8.*

Bis v7.5 blieb das Tagespaket ungeprüft, obwohl die Suchphase es als eigene Nachbarschaft kennt. Ein als „nicht weiter verbesserbar“ ausgewiesener Plan konnte damit eine Verbesserung enthalten, die der Algorithmus selbst kennt.

Bleibt ein vollständiger Durchgang ohne Verbesserung, ist die Belegung bezüglich dieser drei Nachbarschaften beweisbar lokal optimal und wird als **zertifiziert** ausgewiesen. Findet der Nachweis etwas, wird erneut abgestiegen und erneut zertifiziert; die Zahl dieser Anläufe ist über die Einstellungen von 1 bis 8 wählbar. Verbraucht der Zeitrahmen sich vorher, bleibt der Vorschlag vollständig regelgeprüft, aber ohne Nachweis.

### 4.10 Reproduzierbarkeit

Der Zufallsgenerator (xorshift32) wird aus Ausgangsmonat, Laufparametern und Strangnummer abgeleitet, nie aus der Uhr. Der Suchpfad ist damit vollständig festgelegt. Die erreichte Suchtiefe hängt dagegen an Zeitrahmen und Rechenleistung. Im Konvergenzmodus — ohne ausdrücklichen Zeitrahmen — endet der Lauf an einem eigenen Abbruchkriterium statt an der Uhr und ist streng deterministisch; im Zeitrahmenmodus ist er es praktisch, aber nicht beweisbar. Die abschließende Zertifizierung stabilisiert den Endpunkt zusätzlich, weil sie unabhängig vom Weg dorthin auf ein lokal optimales Ergebnis führt.

### 4.11 Fixpunktschutz

Fixpunkte sind fünffach abgesichert:

1. Sie erscheinen nicht in der Slotliste.
2. Der Schreibtrichter des Optimierers akzeptiert Änderungen nur für bekannte offene Felder und wirft andernfalls.
3. Vor und nach der Perfektionsphase wird der Ausgangsmonat gegen das Ergebnis geprüft.
4. Die Übernahme lehnt zwischenzeitlich belegte Felder ab.
5. Vor dem Schreiben läuft ein vollständiger erneuter Audit, einschließlich Fingerabdruckprüfung von Ausgangsmonat, Laufparametern und Vorschlag.

---

## 5. Lastverteilung, Mehrkern-Ausführung und Lebenszyklus

Der Auto-Plan läuft in Modul-Web-Workern. Worker und Anzeigestrang importieren **dieselben** Module; die Regelengine wird nicht dupliziert.

### 5.1 Warum keine Grafikkarte und kein SharedArrayBuffer

Grafikprozessoren gewinnen ihre Leistung daraus, dass tausende Rechenwerke denselben Befehlsstrom auf flachen Zahlenfeldern ausführen. Die Regelbewertung ist das Gegenteil: verzweigungsreich, auf Zeichenketten und Objektgraphen arbeitend, mit Datumsrechnung und Nachschlagen in Nachbarmonaten. Sie ließe sich dort nur ausführen, indem man das gesamte Regelwerk numerisch nachbaut — und genau das ist ausgeschlossen.

`SharedArrayBuffer` lohnt erst bei großen Zahlenfeldern und verlangt Cross-Origin-Isolation, die das Hosting nicht bereitstellt. Der zu übertragende Zustand ist ein Objektgraph. Minimiert wird deshalb die **Zahl** der Serialisierungen, nicht ihr Mechanismus: Der übertragbare Zustand wird einmal je Lauf gebildet und für alle Aufträge wiederverwendet. Zuvor entstand er je Auftrag neu.

### 5.2 Der Ausführungsplan

Vor jedem Lauf wird ein erklärbarer Plan aus offenen Feldern, logischen Kernen, gemeldetem Gerätespeicher, Leistungsprofil und optionalem Nutzerlimit berechnet. Das Worker-Budget ist das Minimum aus vier Obergrenzen:

| Grenze | Herkunft |
| --- | --- |
| Kernbudget | logische Kerne abzüglich 1 (bzw. 2 ab zwölf Kernen) UI-Reserve |
| Profilgrenze | `Responsiv` 2 · `Adaptiv` 4 · `Power` 6 |
| Speichergrenze | ≤ 2 GB → 1 · ≤ 4 GB → 2 · ≤ 8 GB → 3 · sonst 6 |
| Problemgrenze | ≤ 8 offene Felder → 1 · ≤ 24 → 2 · sonst 4 bzw. 6 |

`navigator.hardwareConcurrency` wird ausdrücklich **nicht** als absolute Freigabe interpretiert. Der Plan trägt eine maschinenlesbare Begründung (`memory-constrained`, `small-problem`, `responsive-ui`, `maximum-throughput`, `balanced-throughput`), die im Studio und im Kommentar erscheint.

### 5.3 Aufbauphase: Aufgabenschlange ohne Doppelarbeit

Die Suchprofile eines Monats bilden nacheinander ausgeführt eine Kette — der nächste startet nur, wenn der vorige scheitert. Parallel gestartet dauert es nur so lange wie der längste.

- Die Profile liegen in einer **Aufgabenschlange**; ein früh fertiger Strang zieht sofort den nächsten Auftrag nach, statt leerzulaufen.
- Welcher Strang welchen Auftrag bearbeitet, wird explizit festgehalten. *Bis v7.5 nahm der Kurzschluss beim ersten Erfolg an, Auftrag 0 liege auf Strang 0 — sobald weniger Stränge als Profile vorhanden waren, wurde der gewinnende Strang beendet und ein anderer blieb stehen.*
- Der Minimal-Rot-Strang verzichtet auf seine **eigene** Null-Rot-Rescue: Sie ist inhaltlich dieselbe verbreiterte `strict-coverage`-Suche, die bereits ein eigener Strang rechnet. *Bis v7.5 verbrauchte das Portfolio damit rund ein Drittel seiner Aufbauzeit doppelt.*
- Meldet der erste Strang eine vollständige Belegung ohne rote Ausnahme, werden die übrigen beendet — genau das Verhalten, das die sequenzielle Kette gezeigt hätte.

### 5.4 Perfektionsphase: diversifiziertes Portfolio

Der Aufbau wird **einmal** berechnet und an alle Perfektionsläufe verteilt. Weil die Suche stochastisch ist, streuen ihre Ergebnisse; der beste aus mehreren unabhängigen Läufen ist verlässlich besser als ein einzelner.

Die Streuung allein über den Startwert zu erzeugen verschenkt jedoch den größeren Teil des möglichen Gewinns — alle Stränge liefen dann mit demselben Late-Acceptance-Fenster und derselben Abstiegsfrequenz durch dieselbe Landschaft. Mit aktivierter **Portfolio-Diversität** bleibt Strang 0 konvergenzbetont (der verlässliche Amtsinhaber), während die übrigen mit wachsendem Fenster und dichterem Abstieg breiter suchen.

Der beste Lauf gewinnt anhand **derselben** Zielordnung, die auch intern optimiert wird. Eine Null-Rot-Lösung schlägt damit jeden Minimal-Rot-Rückfall, ohne dass der Vergleich das eigens wissen müsste.

### 5.5 Lebenszyklus

- Aufbau und Perfektion besitzen getrennte Zähler für Gesamtzahl, aktive, abgeschlossene, abgebrochene und fehlgeschlagene Läufe;
- ein einzelner schneller Worker kann nicht vorzeitig 100 Prozent für das Gesamtportfolio melden;
- genau ein terminales Gesamtereignis folgt, nachdem das relevante Portfolio beendet ist;
- ein abgestürzter Worker wird isoliert beendet und für den nächsten Auftrag frisch aufgebaut;
- interne Worker-Abbrüche, unbekannte Antworten, Laufzeitfehler und synchrone Übertragungsfehler werden beendet oder auf den sicheren Inline-Pfad zurückgeführt, statt einen Lauf offen zu lassen;
- eine Lauf-Epoche verhindert, dass ein verspätetes Ergebnis nach Abbruch oder Neustart in den Dialog geschrieben wird;
- die 620-ms-Ergebnisüberleitung ist abbrechbar und kann keinen geschlossenen Dialog wieder befüllen;
- ohne Worker-Unterstützung fällt die Anwendung auf den Anzeigestrang zurück, wo die Rechenschleifen zeitgesteuert an den Browser abgeben.

---

## 6. Incremental Constraint Observatory und Animation

Die Laufansicht trennt drei messbare Größen, die frühere Versionen zu einem scheinpräzisen Prozentwert vermischt haben:

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

### Strangspuren und Operator-Lerntafel (v8)

Der Fortschrittsbalken fasst das Portfolio zu einer Zahl zusammen. Das ist richtig, verschweigt aber, dass mehrere Stränge unterschiedlich weit sind. v8 ergänzt deshalb:

- **je Arbeitsstrang eine eigene Fortschrittsspur** in der Laufansicht. Ein fertiger Strang bleibt sichtbar und wird gedämpft, statt zu verschwinden — ein schrumpfendes Feld sähe nach Verlust aus, obwohl es Fortschritt ist. Die Spuren lesen dieselben Ereignisse wie der Balken und erfinden keine zweite Wahrheit;
- **eine Lerntafel in der Ergebnisansicht**, die für beide Operatordimensionen ausweist, was tatsächlich gemessen wurde: Ertrag je Sekunde Rechenzeit, Zahl der Einsätze und das zuletzt gültige Segmentgewicht. Ein Operator ohne Einsatz erscheint nicht — eine Zeile mit lauter Nullen behauptet eine Beobachtung, die es nicht gab. Es ist die einzige Stelle, an der ein Lauf erklärt, *warum* er so gesucht hat, wie er gesucht hat;
- **beendete Stränge wachsen nicht weiter.** Zuvor blieb jeder Strang mit seiner letzten Meldung in der Summenbildung; traf danach von einem anderen Strang eine Meldung ein, stiegen die Zählwerte sichtbar weiter, obwohl der beendete Strang längst nichts mehr rechnete.

Die v8-Studio-Schicht ist vollständig additiv. Fällt sie aus, bleibt ein bedienbares Studio zurück.

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
- sichtbare Fokusindikatoren;
- semantische Tabellenköpfe;
- ARIA-Live-Bereiche für Status und Algorithmuskommentar;
- programmatische Fortschrittssemantik mit `role="progressbar"`, `aria-valuemin`, `aria-valuemax`, `aria-valuenow` und phasenbezogenem `aria-valuetext`;
- Tooltip-Container mit `role="tooltip"` und `aria-describedby`;
- Tooltips auf Hover und Fokus;
- Tooltip-Schließen mit `Escape`;
- hoverbare und ausreichend persistente Tooltip-Inhalte;
- Reduced-Motion-Unterstützung;
- native HTML-Dialoge mit browserseitiger Inert-Schaltung und Fokus-Rückgabe;
- Forced-Colors-Anpassungen;
- horizontales Tabellenscrolling auf schmalen Ansichten;
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

Die globalen Einstellungen liegen getrennt vom Monatsobjekt unter `settings` (Schema `v3`) mit den Bereichen `appearance` und `autoPlan`.

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
auto-plan-studio.css
auto-plan-studio-v6.css
auto-plan-studio-v7.css
auto-plan-studio-v7-5.css
auto-plan-studio-v8.css
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
  auto-planner-v8.js
  auto-planner-optimizer.js
  auto-plan-index.js

  auto-plan-runner.js
  auto-plan-worker.js
  auto-plan-ui.js
  auto-plan-studio-v5.js
  auto-plan-studio-v6.js
  auto-plan-studio-v7.js
  auto-plan-studio-v7-5.js
  auto-plan-studio-v8.js
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

Neue **v8-Regressionstests** (`tests/auto-plan-v8.test.js`) prüfen die inkrementellen Strukturen als Invarianten, nicht als Erwartungswerte einzelner Läufe:

- die Luby-Folge gegen ihre Definition;
- die Spannweite als Unterscheidungsmerkmal zweier Verteilungen gleicher Varianz;
- die geteilte, nicht je Aufruf sortierte Tagesliste;
- die eingefrorene, stabile Slotliste des Ausgangsmonats;
- jede Umbuchung im Zählwerk, einschließlich des Entfernens leerer Zählungen;
- die Verlustfreiheit der Zustandsmarke, insbesondere bei Rollenwechsel derselben Person;
- die Reproduzierbarkeit der internierten Kennungen über die Vorbelegung;
- **die fortgeschriebene Marke des Optimierers über 300 gemischte Züge**: gleiche Marke bedeutet gleiche Belegung, jede Änderung erzeugt eine neue Marke, und das Zählwerk stimmt am Ende mit einer vollständigen Neuberechnung überein;
- die vollständige Wiederherstellung von Belegung, Zählwerk und Marke nach einer Probe;
- die Segmentformel von Ropke und Pisinger einschließlich unveränderter Gewichte ohne Einsatz;
- die Lage der drei Spannweiten am Ende des Zielschlüssels;
- Revision, Stufenbeschreibung und Engine-Kennung von v8;
- die getrennte Ausweisung beider Operatordimensionen in der Telemetrie.

Die v7.5-Gates bleiben vollständig erhalten und prüfen zusätzlich zu den v7-Gates insbesondere:

- vollständige, migrationssichere Settings-Defaults und strikte Validierung;
- adaptives Worker-Budget bei kleinem Speicher, großen Geräten und explizitem Limit;
- rollenübergreifende Fail-first-Auswahl;
- Belegungs-Ledger und v7-Telemetrie;
- cost-aware Operatorlernen einschließlich Exploration;
- Zahnrad, Modal, Reiterwechsel, Fokus-Rückgabe, Persistenz und Studio im Browser;
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

Die fachliche und technische Begründung der v8-Architektur — gesichtete Literatur zu ALNS, Late Acceptance, Regret-Insertion, Luby-Neustarts, inkrementeller Bewertung, Fairness in der ärztlichen Dienstplanung und Browser-Parallelität, dazu das vollständige Inventar der behobenen strukturellen Fehler — steht in:

- [`docs/AUTO-PLAN-V8-RESEARCH-20260803.md`](docs/AUTO-PLAN-V8-RESEARCH-20260803.md)

Die Begründungen der Vorgängerarchitekturen:

- [`docs/AUTO-PLAN-V7-5-RESEARCH-20260803.md`](docs/AUTO-PLAN-V7-5-RESEARCH-20260803.md)
- [`docs/auto-plan-v7-5-test-strategy.yml`](docs/auto-plan-v7-5-test-strategy.yml)
- [`docs/AUTO-PLAN-V7-RESEARCH-20260803.md`](docs/AUTO-PLAN-V7-RESEARCH-20260803.md)
- [`docs/auto-plan-v7-test-strategy.yml`](docs/auto-plan-v7-test-strategy.yml)
- [`docs/AUTO-PLAN-V6-RESEARCH-20260803.md`](docs/AUTO-PLAN-V6-RESEARCH-20260803.md)
- [`docs/AUTO-PLAN-RESEARCH-20260802.md`](docs/AUTO-PLAN-RESEARCH-20260802.md)
- [`docs/AUTO-PLAN-HARDENING-20260802.md`](docs/AUTO-PLAN-HARDENING-20260802.md)

---

## 15. Release 0.8.0 / Auto-Plan v8

**Incremental Constraint Observatory.** Kein fachliches Regelverhalten wurde verändert; die produktive Regelengine bleibt die alleinige Wahrheitsquelle.

### Geschwindigkeit und Effizienz

- neue Indexschicht `js/auto-plan-index.js` mit gecachten Tageslisten, eingefrorenen Slotlisten des Ausgangsmonats, internierten Personal-Kennungen, Zählwerken, Spannweiten und der Luby-Folge;
- die Marke des Vergleichsgruppen-Speichers entsteht nicht mehr je Bewertung aus einer fortlaufend verketteten Zeichenkette über alle Tage des Monats;
- der Perfektionsoptimierer besitzt genau **einen Schreibtrichter** und schreibt Marke und Zählwerk in konstanter Zeit fort — als Invariante getestet;
- Laufgrenzen und Personenlasten werden über das Zählwerk statt über vollständige Monatsscans geprüft;
- die Knotenkennung der Konstruktion entsteht aus internierten Zahlen über ein vorbelegtes Feld statt aus zusammengesetzten Zeichenketten;
- der übertragbare Zustand wird einmal je Lauf gebildet statt einmal je Auftrag.

### Behobene strukturelle Fehler

- ein vollständiger, aber **schlechterer** Suchlauf konnte einen besseren Amtsinhaber verdrängen;
- der Kurzschluss des Aufbau-Portfolios beendete den **falschen** Arbeitsstrang, sobald weniger Stränge als Profile vorhanden waren;
- der Minimal-Rot-Strang rechnete die Null-Rot-Rescue ein zweites Mal, die ein anderer Strang bereits parallel ausführte — rund ein Drittel der Aufbauzeit doppelt;
- beendete Arbeitsstränge ließen die zusammengefasste Telemetrie weiterwachsen;
- dreifach kopierte Abbruchprüfungen in drei Nachbarschaften;
- toter Code: eine nie gesetzte CSS-Klasse wurde im `finally` entfernt.

### Algorithmische Wirksamkeit

- **zwei adaptive Operatordimensionen**: acht Zerstörungs- und drei Wiederaufbauoperatoren, letztere neu einschließlich **Regret-2**;
- **segmentweise Gewichtsanpassung nach Ropke und Pisinger** (λ = 0,35, Segmentlänge 40) über der kostenbewussten UCB-Auswahl — die Suche vergisst veraltete Erfolge;
- **Luby-Neustarts** statt fester Stagnationsschwelle;
- die Zielordnung entscheidet nachrangig über **Spannweiten** von BD, Gesamtlast und Wochenendäquivalent;
- der **Optimalitätsnachweis** prüft zusätzlich das Tagespaket und ist in seiner Tiefe einstellbar;
- das Perfektionsportfolio streut über Parametrierung, nicht nur über Startwerte.

### Oberfläche und Einstellungen

- fixiertes **Zahnrad** am rechten Rand der Action Bar, außerhalb aller Dichtestufen und des Überlaufmenüs;
- Einstellungsmodal in drei Reitern nach dem ARIA-Tab-Muster mit Pfeiltastensteuerung, stets im ersten Bereich beginnend;
- Settings-Schema `v4` mit neuer Gruppe `workflow`; neu und vollständig verdrahtet: Monatsfarbsystem, Wochenendhervorhebung, atmosphärischer Hintergrund, Autosave-Verzögerung, Algorithmus-Kommentar, Suchvisualisierung, Runden des Optimalitätsnachweises, Portfolio-Diversität;
- Studio-v8-Schicht mit Stufenband aus der Engine, Strangspuren je Arbeitsstrang und Operator-Lerntafel;
- 13 neue Invariantentests für die inkrementellen Strukturen; Gesamtstand **364 Modultests und 35 Browsertests**.

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
- v7.5-Identität in Planner, Studio, Einstellungen, Paketversion und vollständigem Browser-Modulgraphen;
- einheitlicher v7.5-Release-Token `20260803.4` im ausgelieferten Browser-Modulgraphen;
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
