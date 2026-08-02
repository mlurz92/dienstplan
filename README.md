# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – Kalendertabelle mit wechselnden Monatsfarben" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.4.0`  
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** parametrierbare globale BD/HG-Optimierung mit Null-Rot-Suche, Minimal-Rot-Fallback und iterativer Tauschreparatur  
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

### 2.1 Verbindliche Konfiguration vor dem Start

Vor **Optimierung starten** können festgelegt werden:

- Suchintensität `Standard`, `Tief` oder `Maximum`;
- Optimierungsschwerpunkt `Ausgewogen`, `Wünsche`, `Lastenausgleich` oder `Wochenenden`;
- Zahl iterativer Reparaturrunden;
- Budget der lokalen Neuplanung;
- Zulassung des Minimal-Rot-Fallbacks;
- maximal zulässige Zahl roter Vorschläge;
- feste maximale BD-Zahl je Mitarbeitendem;
- feste maximale HG-Zahl je Mitarbeitendem;
- feste maximale Gesamtzahl `BD + HG` je Mitarbeitendem.

Die personengebundenen Obergrenzen sind **harte Laufbedingungen**. Sie können auch im Minimal-Rot-Fallback nicht überschritten werden. Bereits vorhandene Fixpunkte zählen mit. Eine Grenze unterhalb der bestehenden Dienstzahl blockiert den Start unmittelbar.

Personalstamm-Maxima bleiben zusätzlich wirksam. Für Personen ohne dauerhaft hinterlegtes Maximum wird ein editierbarer Laufwert angeboten. Leere HG- oder Gesamtfelder bedeuten keine zusätzliche Laufobergrenze.

Die Konfiguration wird validiert, bevor der Startbutton aktiv bleibt. Laufparameter und Vorschläge sind fingerprintgeschützt; eine nachträgliche Manipulation wird beim Übernahmeaudit verworfen.

### 2.2 Animation und Live-Telemetrie

Der Lauf zeigt eine Canvas-basierte Constraint-Konstellation mit BD-/HG-Knoten, animierten Signalpfaden, rotierenden Ebenen, Phasenfarben und pulsierenden Dienstfeldern. Sichtbar sind unter anderem:

- Fixpunktanalyse;
- Constraint-Propagation;
- reguläre und vertiefte Null-Rot-Suche;
- gegebenenfalls Minimal-Rot-Suche;
- iterative Tausch- und Neuplanungsphase;
- Schlussaudit;
- aktive Varianten;
- Kandidatendomänen;
- geprüfte und verworfene Zustände;
- erkannte Sackgassen;
- Verbesserungen der Reparaturphase;
- Fortschritt je BD/HG-Feld.

Die Berechnung gibt regelmäßig an den Browser zurück. Animation, Abbruch und Benutzeroberfläche bleiben responsiv.

### 2.3 Monatsvorschlag wie die Diensttabelle

Die Vorschau verwendet eine semantische HTML-Tabelle mit **einer Zeile je Kalendertag**:

| Tag | Wochentag | BD | HG | Prüfung |
|---|---|---|---|---|

BD und HG desselben Tages stehen zusammen in einer Zeile. Jede Zelle zeigt:

- Person;
- `Fixpunkt`, `Auto-Plan` oder `offen`;
- Bewertungsstufe;
- vollständige Regelgründe als aufklappbaren Detailbereich.

Wochenenden und Feiertage bleiben visuell unterscheidbar. Die Tabellenköpfe bleiben beim Scrollen sichtbar. Zusätzlich werden vor der Übernahme angezeigt:

- verwendete Laufparameter;
- Such- und Reparaturtelemetrie;
- Fairnesskennzahl;
- erfüllte Wünsche;
- gelbe, orange und rote Hinweise;
- BD, HG, Gesamtlast und Wochenendäquivalente je Person;
- Vorher-Nachher-Vergleich;
- BD-Soll und die verwendeten individuellen Obergrenzen.

Die Ergebnisansicht und die inneren Tabellen sind auch bei geringer Fensterhöhe vollständig scrollbar. Kopf- und Aktionsleiste bleiben erreichbar.

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

### 3.4 Zielordnung

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

### 3.5 Fairness

Die finale Fairness wird nach der letzten iterativen Veränderung vollständig neu berechnet. Berücksichtigt werden:

- Abweichung vom individuellen BD-Soll;
- kombinierte BD/HG-Last der am konkreten Datum HG-berechtigten Personen;
- belastende HG zu AA-BD;
- Wochenendäquivalente;
- Samstagsrotation;
- zeitabhängige Aktivität und Beförderung.

Eine Beförderung innerhalb des Monats wird nicht pauschal auf den gesamten Monat übertragen. Die Vergleichsgruppen werden anhand der konkreten Diensttage gebildet.

### 3.6 Keine unbelegte Optimalitätsbehauptung

DienstplanRAD liefert einen tief optimierten, deterministischen und vollständig auditierten Vorschlag. Die browserseitige Kombination aus Beam Search, Forward-Checking, exakter Restsuche und lokalen Nachbarschaften stellt jedoch keinen mathematischen Beweis globaler Optimalität wie ein vollständig ausoptimierter externer MIP-/CP-SAT-Solver dar.

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
| `js/auto-planner-engine.js` | parametrierbare globale Konstruktionssuche und harte Obergrenzen |
| `js/auto-planner-v3.js` | iterative Reassignments, Swaps, Ketten und lokale Neuplanung |
| `js/auto-planner-v4.js` | finale datumsgenaue Fairness-Neuberechnung |
| `js/auto-plan-studio-v3.js` | Konfiguration, Animation, Tagesvorschau und Bestätigung |
| `auto-plan.css` | Grunddarstellung des Studios |
| `auto-plan-review.css` | Dialoggeometrie und Prüfscrollbereich |
| `auto-plan-v2.css` | tabellarische Ergebnisdarstellung |
| `auto-plan-v3.css` | Parameterstudio, Animation und iterative Telemetrie |
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
- deterministische Reproduzierbarkeit;
- dynamische Engpasswahl;
- Forward-Checking und Suchtelemetrie;
- iterative Reassignments, Swaps, Ketten und lokale Neuplanung;
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
