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

Der Zeitrahmen ist die wirksamste Stellgröße. Die Ruin-and-Recreate-Suche nutzt ihn vollständig aus; mehr Zeit führt zu besseren Plänen und macht den abschließenden Optimalitätsnachweis wahrscheinlicher. Die Suchintensität schlägt für Zeitrahmen, Reparaturrunden, Neuplanungsbudget und Late-Acceptance-Fenster passende Werte vor. Ein selbst eingetragener Wert bleibt dabei erhalten und wird durch einen späteren Wechsel der Intensität nicht überschrieben.

Die Tabelle der Obergrenzen führt jede planbare Person mit ihren bestehenden BD und HG sowie drei Eingabefeldern. Zwei Schaltflächen setzen alle Zeilen gemeinsam auf die Vorschlagswerte zurück oder leeren sämtliche Grenzen. Eine Zeile, deren Grenze eine bestehende Dienstzahl unterschreitet, wird hervorgehoben und blockiert den Start.

Die personengebundenen Obergrenzen sind **harte Laufbedingungen**. Sie können auch im Minimal-Rot-Fallback nicht überschritten werden. Bereits vorhandene Fixpunkte zählen mit. Eine Grenze unterhalb der bestehenden Dienstzahl blockiert den Start unmittelbar.

Personalstamm-Maxima bleiben zusätzlich wirksam. Für Personen ohne dauerhaft hinterlegtes Maximum wird ein editierbarer Laufwert angeboten. Leere HG- oder Gesamtfelder bedeuten keine zusätzliche Laufobergrenze.

Die Konfiguration wird validiert, bevor der Startbutton aktiv bleibt. Laufparameter und Vorschläge sind fingerprintgeschützt; eine nachträgliche Manipulation wird beim Übernahmeaudit verworfen.

### 2.2 Animation und Live-Telemetrie

Der Lauf wird von einer Canvas-Darstellung begleitet, die den tatsächlichen Zustand der Suche abbildet und nicht nur beschäftigt wirkt:

- **Jedes Dienstfeld des Monats ist ein Knoten.** BD liegt auf der inneren, HG auf der äußeren Bahn. Fixpunkte leuchten von Beginn an ruhig, offene Felder bleiben dunkel.
- **Entscheidungen zünden.** Wird ein Feld belegt, fliegt ein Komet aus dem Kern dorthin, der Knoten flammt auf und eine Druckwelle läuft über die Bahnen.
- **Kopplungsfäden** verbinden benachbarte Tage sowie BD und HG desselben Tages – genau die Beziehungen, aus denen die fachlichen Kopplungsregeln entstehen. Auf ihnen wandern Signale, deren Dichte und Tempo der gemessenen Suchaktivität folgen.
- **Der Kern pulsiert** im Takt der Bewertungen, die Farbwelt wechselt mit der Phase von Analyse über Suche und Reparatur bis zur Zertifizierung.
- **Eine Verlaufslinie** am unteren Rand zeichnet die Qualität mit: Jede Verbesserung senkt die Kurve sichtbar ab.

Daneben laufen ein Phasenband mit sechs Stufen, ein Fortschrittsbalken, die verstrichene Zeit, die verbleibende Zeit der Perfektionsphase, eine Klartextmeldung zur aktuellen Tätigkeit, ein Raster aller Dienstfelder und sechs Live-Kennzahlen: aktive Varianten, Kandidatendomänen, geprüfte Zustände, verworfene Zustände, gefundene Verbesserungen und Zahl der Felder.

**Die Oberfläche bleibt während des gesamten Laufs bedienbar.** Die Rechenschleifen geben zeitgesteuert an den Browser ab – gemessen in vergangener Zeit, nicht in Schleifendurchläufen – und warten dabei bis zum nächsten Bildaufbau. Ohne diese Taktung blockierte ein mehrminütiger Lauf den Hauptthread vollständig: Fortschrittsbalken und Animation standen still, obwohl gerechnet wurde. Der Fortschrittsbalken läuft ausschließlich vorwärts; Stufenwechsel erzeugen keine Rücksprünge. In einem verdeckten Tab hält ein Wecker den Lauf am Leben, weil dort keine Bildrückrufe mehr erfolgen. Reduzierte Bewegung wird respektiert.

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

## 3. Algorithmus

### 3.1 Regelgebundene Kandidatenbewertung

Für jede hypothetische Einteilung wird `evaluateCandidate()` auf einem geklonten simulierten Monatszustand ausgeführt. Der Algorithmus besitzt keine vereinfachte Parallelregel.

Absolut ausgeschlossen bleiben unter anderem:

- fehlende Qualifikation;
- nicht aktive oder nicht planbare Person;
- gleichzeitiger BD und HG derselben Person;
- unmittelbar aufeinanderfolgende eigene BD;
- unbekannte oder ungültige Personalwerte;
- Überschreitung einer konfigurierten BD-, HG- oder Gesamtobergrenze.

### 3.2 Konstruktionssuche

Die globale Konstruktion kombiniert:

1. Schutz sämtlicher Fixpunkte;
2. dynamische Auswahl knapper Dienstfelder;
3. reguläre Null-Rot-Beam-Search;
4. verbreiterte Null-Rot-Suche mit alternativer Kandidatenordnung;
5. Forward-Checking gegen leere spätere Kandidatendomänen;
6. exakte Tiefensuche in kleinen Restproblemen;
7. optionalen Minimal-Rot-Fallback;
8. vollständigen Endaudit.

Die Suche plant BD global und anschließend HG auf dem simulierten BD-Endstand. Dadurch werden definierte Gegenposten und Wochenendkopplungen bereits während der Konstruktion berücksichtigt.

### 3.3 Iterative Tauschreparatur

Nach einer vollständigen Konstruktion wird der Gesamtplan mit mehreren Nachbarschaftstypen weiter verbessert:

- einzelne Neuzuweisung;
- paarweiser Mitarbeitertausch;
- Dreierkette;
- Tausch kompletter BD/HG-Tagespakete;
- lokale Neuplanung auffälliger Tage.

Jeder Nachbar wird vollständig neu bewertet. Akzeptiert werden nur strikt lexikografisch bessere Zustände, die sämtliche harten Regeln und Laufobergrenzen einhalten. Reparaturrunden und lokales Neuplanungsbudget sind vor dem Start konfigurierbar.

### 3.4 Perfektionsphase: Ruin and Recreate mit Late Acceptance

Die eigentliche Qualität entsteht in der Stufe danach. Sie folgt dem in der Personaleinsatzplanung etablierten Aufbau aus adaptiver Large-Neighborhood-Search, Late-Acceptance-Annahme und absteigenden Nachbarschaften und bekommt den gesamten konfigurierten Zeitrahmen.

**Zerstören.** Ein Operator entfernt einen fachlich zusammenhängenden Ausschnitt der selbst gesetzten Dienste. Acht Operatoren stehen zur Wahl:

| Operator | Ausschnitt |
|---|---|
| `zufallsfelder` | zufällige Dienstfelder |
| `schwaechste-zellen` | Zellen mit der schlechtesten Bewertung |
| `tagesfenster` | ein zusammenhängender Kalenderabschnitt |
| `wochenende` | ein vollständiges Freitag-bis-Sonntag-Paket |
| `personenlast` | alle selbst gesetzten Dienste einer Person |
| `verwandte-felder` | Felder ähnlicher Lage, Rolle und Besetzung |
| `rollenblock` | eine Rolle innerhalb eines Kalenderfensters |
| `sollabweichung` | Dienste der Person mit dem größten Überhang |

Die Auswahl erfolgt gewichtet. Die Gewichte richten sich nach dem tatsächlichen Erfolg der jeweils letzten Runden: neuer Bestwert, Verbesserung des laufenden Zustands, bloße Annahme oder Ablehnung. Kein Operator verschwindet dabei vollständig.

**Neu aufbauen.** Der Ausschnitt wird nach dem Prinzip des kleinsten Spielraums neu belegt: zuerst das Feld mit den wenigsten wählbaren Personen. Die Reihenfolge bestimmt ein billiger Eignungsfilter ohne Regelauswertung, vollständig bewertet wird nur das jeweils gewählte Feld. Unter den besten Kandidaten wird rangverzerrt gewählt, damit derselbe Ausschnitt in verschiedenen Runden verschieden entsteht. Bleibt ein Feld ohne Kandidaten, scheitert der Aufbau und der Ausschnitt wird verworfen.

**Annehmen.** Die Annahme folgt dem Late-Acceptance-Hill-Climbing: Ein Zustand wird übernommen, wenn er den aktuellen verbessert oder mindestens so gut ist wie der Zustand einer festen Zahl von Runden zuvor. Der Verlauf darf sich dadurch zeitweise verschlechtern und lokale Optima verlassen, ohne dass ein Temperaturplan abgestimmt werden müsste. Die beste je gesehene Belegung wird getrennt geführt; ein schlechter Zwischenzustand kann das Ergebnis nie verschlechtern.

**Absteigen.** In festen Abständen und am Ende läuft eine vollständige absteigende Suche über sechs Nachbarschaften: Einzelumsetzung, Paartausch, Rollentausch am selben Tag, Dreierkette, Tagespaket und Wochenendpaket. Nach jeder Annahme beginnt die Reihenfolge von vorn.

**Stagnation.** Bleibt die Suche längere Zeit ohne neuen Bestwert, springt sie auf die beste bekannte Belegung zurück. Hilft auch das nicht, endet die Suchphase zugunsten der Zertifizierung.

**Größe des Ausschnitts.** Ropke und Pisinger zeigen für die adaptive Large Neighborhood Search, dass merklich große Ausschnitte – Größenordnung zehn bis vierzig Prozent der Entscheidungsvariablen – bessere Ergebnisse liefern als kleine. Diese Empfehlung gilt allerdings für Probleme mit billigem Wiederaufbau; hier kostet jedes neu zu besetzende Feld eine vollständige Kandidatenbewertung. Die Suche schätzt deshalb aus der gemessenen Rundendauer, wie viele Runden noch in den Zeitrahmen passen, und wählt den Anteil so, dass eine tragfähige Rundenzahl erhalten bleibt. Bei knappem Rahmen sind die Ausschnitte kleiner und zahlreicher, bei großzügigem Rahmen größer und gründlicher.

**Reproduzierbarkeit.** Der Zufallsgenerator wird aus Ausgangsmonat und Laufparametern abgeleitet, nie aus der Uhr; der Suchpfad ist damit vollständig festgelegt. Die *erreichte Tiefe* hängt dagegen am Zeitrahmen und an der Rechenleistung – wie viele Runden in eine Minute passen, entscheidet die Maschine. Ohne ausdrücklichen Zeitrahmen läuft die Perfektion im **Konvergenzmodus**: Sie endet an eigenen Abbruchkriterien statt an der Uhr und ist dann streng deterministisch. Im Zeitrahmenmodus ist sie es praktisch, aber nicht beweisbar; die abschließende Zertifizierung stabilisiert den Endpunkt zusätzlich.

### 3.5 Zertifizierung der Optimalität

Zum Abschluss läuft ein Nachweis, der anders arbeitet als die Suchphasen: Er bricht nicht bei der ersten Verbesserung ab und kennt keine Abkürzung. Geprüft werden

- **jede** Einzelumsetzung jedes selbst gesetzten Dienstfeldes auf **jede** dort wählbare Person und
- **jeder** Paartausch zweier selbst gesetzter Dienste – gleiche Rolle an verschiedenen Tagen sowie BD gegen HG am selben Tag.

Findet ein vollständiger Durchgang keine Verbesserung mehr, ist die Belegung bezüglich dieser beiden Nachbarschaften **beweisbar nicht mehr verbesserbar**. Das Ergebnis wird dann als `zertifiziert` ausgewiesen. Findet der Durchgang noch Verbesserungen, werden sie übernommen, es wird erneut abgestiegen und erneut zertifiziert. Reicht der Zeitrahmen für einen vollständigen Durchgang nicht, weist die Oberfläche den Nachweis ausdrücklich als `zeitbegrenzt` aus statt eine Optimalität zu behaupten.

### 3.6 Zielordnung

Die Bewertung ist lexikografisch, nicht als unkontrollierte freie Punktsumme implementiert.

**Harte Ebene:**

1. keine Obergrenzenverletzung;
2. keine graue beziehungsweise technisch nicht wählbare Einteilung;
3. vollständige Belegung;
4. Einhaltung des konfigurierten Rot-Limits.

**Null-Rot-Ebene:**

1. keine roten Vorschläge;
2. möglichst wenige orange;
3. möglichst wenige gelbe Konstellationen.

**Minimal-Rot-Ebene:**

1. vollständige technisch wählbare Belegung;
2. minimale Zahl roter Zellen;
3. bei Gleichstand minimale Zahl besonders bestätigungspflichtiger roter Zellen;
4. anschließend dieselbe Qualitätsordnung wie in der Null-Rot-Suche.

**Weiche Qualität:**

- deterministische Kopplungen;
- positive Dienstwünsche;
- Optionen `BD möglich` und `HG möglich`;
- BD-Sollausgleich;
- kombinierter BD/HG-Ausgleich;
- AA-HG-Ausgleich;
- Wochenend- und Samstagsrotation;
- weitere positive Empfehlungen.

Der im Studio gewählte Optimierungsschwerpunkt verändert nur die Reihenfolge weicher Ziele. Harte Regeln und die vollständige Belegung behalten immer Vorrang.

### 3.7 Fairness

Die finale Fairness wird nach der letzten iterativen Veränderung vollständig neu berechnet. Berücksichtigt werden:

- Abweichung vom individuellen BD-Soll;
- kombinierte BD/HG-Last der am konkreten Datum HG-berechtigten Personen;
- belastende HG zu AA-BD;
- Wochenendäquivalente;
- Samstagsrotation;
- zeitabhängige Aktivität und Beförderung.

Eine Beförderung innerhalb des Monats wird nicht pauschal auf den gesamten Monat übertragen. Die Vergleichsgruppen werden anhand der konkreten Diensttage gebildet.

### 3.8 Reichweite der Optimalitätsaussage

Die Zertifizierung beweist genau das, was sie prüft: dass **keine Einzelumsetzung und kein Paartausch** das Ergebnis in der lexikografischen Zielordnung noch verbessert. Das ist eine nachgewiesene lokale Optimalität bezüglich dieser Nachbarschaften und deutlich mehr als eine bloße Heuristikbehauptung.

Es ist ausdrücklich **kein** Beweis globaler Optimalität. Eine Verbesserung, die nur durch das gleichzeitige Umstellen von drei oder mehr Diensten erreichbar wäre, kann bestehen bleiben, auch wenn die Perfektionsphase Dreierketten, Tagespakete und Wochenendpakete zusätzlich absucht. Ein vollständiger externer MIP- oder CP-SAT-Lauf kann in Einzelfällen weiter kommen; im Browser ist er nicht verfügbar. Die Oberfläche benennt diesen Unterschied und behauptet nie mehr, als nachgewiesen wurde.

### 3.9 Rechenleistung

Der Lauf wurde messbar beschleunigt, damit der Zeitrahmen der Suche zugutekommt und nicht der Verwaltung:

- Die Zählfunktionen der Regelbewertung arbeiten ohne Zwischenobjekte. Sie liegen im innersten Ring und wurden zuvor von der Speicherbereinigung dominiert.
- Kalenderzerlegung, Personalindex, Tagespool und datumsabhängige Qualifikation werden zwischengespeichert.
- Der Katalog erfüllbarer Wünsche und der planbare Personalkreis werden je Lauf einmal bestimmt statt je Zwischenbewertung.
- Zwischenzustände der Konstruktion werden aus der bereits vorliegenden Bewertungsmitschrift gerankt statt mit einem vollständigen Monats-Audit je erzeugtem Nachfolger.
- Das Vorwärts-Checking läuft erst nach billigem Ranking und Entdopplung und nur für so viele Varianten, wie in den Suchstrahl passen.
- Die Perfektionsphase prüft Züge zuerst an den veränderten Zellen und bewertet nur die Überlebenden vollständig.

In der Summe fällt ein voller 31-Tage-Monat von deutlich über zehn Minuten auf einen Aufbau im Bereich weniger Sekunden; die verbleibende Zeit gehört der Perfektionsphase.

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
- Erreichbarkeit und Bedienbarkeit jeder Personenzeile im Parameterbereich;
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
