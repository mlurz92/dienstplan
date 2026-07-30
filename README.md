# DienstplanRAD

> **Vollständige Anwendungs-, Bedien-, Regelwerks-, Architektur-, Betriebs- und Entwicklungsdokumentation**

DienstplanRAD ist eine installierbare Web-Anwendung für die manuelle Monatsplanung von **Bereitschaftsdiensten (BD)**, **Hintergrunddiensten (HG)** sowie der ersten und zweiten **Rufbereitschaft Nuklearmedizin (RBN)**. Die Anwendung ist auf die Arbeitsweise einer radiologischen und nuklearmedizinischen Klinik zugeschnitten: Eine chronologische, Excel-nahe Tagesliste bleibt jederzeit direkt lesbar, während eine erklärbare Regelengine jede mögliche BD- und HG-Einteilung gegen Qualifikation, Abwesenheiten, Wünsche, Abstände, Kontingente, Wochenenden, Feiertage, Kopplungen und Verteilungsaspekte prüft.

DienstplanRAD ist ausdrücklich **kein Autoplaner**. Keine Person wird selbstständig eingetragen und keine bestehende Einteilung wird durch eine Empfehlung überschrieben. Die Anwendung unterstützt die fachlich verantwortliche Person bei der Entscheidung, zeigt Konflikte transparent, dokumentiert bewusst bestätigte rote Ausnahmen und hält den Monatsstand lokal sowie – bei verfügbarer Verbindung – in Cloudflare KV vor.

> **Der Mensch entscheidet. Die Anwendung prüft, erklärt, speichert und dokumentiert.**

Diese README beschreibt den vollständigen aktuellen Stand der Anwendung. Sie ist keine Liste vergangener Änderungen, sondern die zusammenhängende Referenz für Bedienung, fachliches Verhalten, Benutzeroberfläche, Datenhaltung, Schnittstellen, Tests, Deployment und Störungsdiagnose.

---

## Inhaltsverzeichnis

1. [Zielbild und Planungsphilosophie](#1-zielbild-und-planungsphilosophie)
2. [Begriffe und Rollen](#2-begriffe-und-rollen)
3. [Funktionsumfang im Überblick](#3-funktionsumfang-im-überblick)
4. [Typischer Arbeitsablauf](#4-typischer-arbeitsablauf)
5. [Benutzeroberfläche und Design-Philosophie](#5-benutzeroberfläche-und-design-philosophie)
6. [Monatsplan und Tabellenverhalten](#6-monatsplan-und-tabellenverhalten)
7. [BD- und HG-Auswahl](#7-bd--und-hg-auswahl)
8. [Farbkodierte Eignungsbewertung](#8-farbkodierte-eignungsbewertung)
9. [Vollständiges fachliches Regelwerk](#9-vollständiges-fachliches-regelwerk)
10. [RBN und zweite RBN](#10-rbn-und-zweite-rbn)
11. [Abwesenheiten, FZA und Dienstwünsche](#11-abwesenheiten-fza-und-dienstwünsche)
12. [Statistik und offene Punkte](#12-statistik-und-offene-punkte)
13. [Feiertage, reguläre Werktage und Zeitzonen](#13-feiertage-reguläre-werktage-und-zeitzonen)
14. [Monatsfarben, Glasoptik und Animationen](#14-monatsfarben-glasoptik-und-animationen)
15. [Datenmodell](#15-datenmodell)
16. [Zustand, Speicherung und Offline-Verhalten](#16-zustand-speicherung-und-offline-verhalten)
17. [Cloudflare-Backend und HTTP-API](#17-cloudflare-backend-und-http-api)
18. [Excel, JSON, Drucken und PDF](#18-excel-json-drucken-und-pdf)
19. [Sicherheit, Datenschutz und Datenintegrität](#19-sicherheit-datenschutz-und-datenintegrität)
20. [Barrierefreiheit und responsive Nutzung](#20-barrierefreiheit-und-responsive-nutzung)
21. [Technische Architektur und Module](#21-technische-architektur-und-module)
22. [Projektstruktur](#22-projektstruktur)
23. [Tests und Qualitätsgarantien](#23-tests-und-qualitätsgarantien)
24. [Lokale Entwicklung](#24-lokale-entwicklung)
25. [Deployment, Release-Kennung und Cache-Sicherheit](#25-deployment-release-kennung-und-cache-sicherheit)
26. [Betrieb und Fehlerdiagnose](#26-betrieb-und-fehlerdiagnose)
27. [Gezielte Anpassungen](#27-gezielte-anpassungen)
28. [Bewusste Grenzen und Invarianten](#28-bewusste-grenzen-und-invarianten)
29. [Glossar](#29-glossar)

---

# 1. Zielbild und Planungsphilosophie

## 1.1 Assistierte Planung statt automatischer Belegung

Radiologische Dienstplanung lässt sich nicht zuverlässig auf eine einzelne Optimierungszahl reduzieren. Neben formalen Qualifikationen spielen klinische Zuständigkeiten, individuelle Absprachen, Urlaube, Fortbildungen, Wochenendbelastungen, Sollwerte, bekannte Sonderregeln und bewusst akzeptierte Ausnahmen eine Rolle. DienstplanRAD bildet diese Realität ab, indem es **jede konkrete Auswahl bewertet**, aber die Auswahl selbst der verantwortlichen Person überlässt.

Die Anwendung:

- trägt niemals selbstständig eine Person in BD oder HG ein;
- sortiert das Personal nicht heimlich nach einem undurchsichtigen Gesamtscore;
- zeigt jede Bewertungsbegründung als Klartext;
- unterscheidet harte Ausschlüsse von weichen Hinweisen;
- lässt grüne, gelbe und orange Einteilungen unmittelbar zu;
- verlangt für rote Einteilungen eine ausdrückliche Bestätigung;
- protokolliert rote Freigaben mit Zeitpunkt, Datum, Rolle, Person, Gründen und optionalem Kommentar;
- verändert RBN, Abwesenheiten oder Wünsche nur durch eine bewusste Benutzereingabe;
- behandelt historische Daten defensiv und löscht sie beim bloßen Anzeigen nicht stillschweigend.

## 1.2 Warum eine chronologische Tagesliste

Der Plan verwendet eine Zeile je Kalendertag statt eines klassischen Monatsrasters. Diese Darstellung ist für den klinischen Dienstplan besonders geeignet:

- BD, HG, RBN, zweite RBN, Abwesenheiten und Wünsche liegen in einer Leserichtung;
- jeder Tag besitzt dieselbe feste Spaltenbedeutung;
- Monatsgrenzen und Wochenenden bleiben chronologisch nachvollziehbar;
- die Tabelle lässt sich kompakt auf A4 ausgeben;
- vertikales Scrollen entspricht der natürlichen zeitlichen Abfolge;
- Feiertage können direkt am Wochentag benannt werden;
- bestehende Einteilungen und offene Felder sind ohne Wechsel zwischen Kalenderansichten sichtbar.

## 1.3 Erklärbarkeit als Kernanforderung

Eine farbige Stufe ohne Begründung wäre für die Dienstplanung unzureichend. Deshalb enthält jede BD- und HG-Karte sämtliche ausgelösten Gründe. Die höchste fachliche Stufe bestimmt die Farbe; schwächere und zusätzliche Gründe bleiben trotzdem sichtbar. Ein orangefarbener Konflikt kann daher zugleich einen positiven Wunsch, einen Belastungshinweis und eine Kopplungsbegründung enthalten.

## 1.4 Trennung von Bewertung und Information

Nicht jeder angezeigte Text verändert die Bewertung. DienstplanRAD unterscheidet:

- **bewertungswirksame Konflikte und Hinweise**, welche die Farbstufe verändern;
- **positive Empfehlungen**, welche den internen Empfehlungswert erhöhen, aber keine rote oder orange Regel aufheben;
- **reine Kontextinformationen**, welche nur im Tooltip beziehungsweise in der Begründungsliste erscheinen.

Der **Jahresverlauf als Tie-Breaker** gehört ausdrücklich zur dritten Gruppe: Er kann bei vollständig geladenem Jahresverlauf als Text erklären, wer bisher mehr oder weniger Dienste hatte, verändert jedoch weder Farbstufe noch Empfehlungswert.

---

# 2. Begriffe und Rollen

## 2.1 Diensttypen

| Begriff | Bedeutung in der Anwendung |
|---|---|
| **BD** | Bereitschaftsdienst; monatlich mit individuellem Soll und gegebenenfalls hartem Maximum |
| **HG** | Hintergrunddienst; nur für am Diensttag HG-berechtigte Fachärztinnen und Fachärzte |
| **RBN** | erste Rufbereitschaft Nuklearmedizin mit festem, datumsabhängigem Kandidatenpool |
| **2. RBN** | zweite Rufbereitschaft Nuklearmedizin; nur bei bestimmten Erstbesetzungen verfügbar |
| **FZA** | Freizeitausgleich beziehungsweise Frei; manuell oder in einem eng definierten Becker-Fall abgeleitet |

## 2.2 Bewertungsbegriffe

| Begriff | Bedeutung |
|---|---|
| **Stufe** | sichtbare Farbe `green`, `yellow`, `orange`, `red` oder `gray` |
| **Grund** | Textbegründung einer Regel, Empfehlung oder Information |
| **Empfehlungswert** | interne Summe positiver Empfehlungen; kein Ersatz für die Farbstufe |
| **reiner Hinweis** | sichtbarer Text ohne Wirkung auf Stufe oder Empfehlungswert |
| **Override** | bewusst bestätigte rote Einteilung mit Protokolleintrag |
| **BD-Soll** | monatlicher Richtwert einer Person |
| **BD-Maximum** | harte monatliche Obergrenze, sofern definiert |
| **Wochenend-Äquivalent** | 1,0 für ein Wochenende mit mindestens einem BD, 0,5 für ein Wochenende nur mit HG |

---

# 3. Funktionsumfang im Überblick

## 3.1 Planung

- Monatsnavigation per Pfeiltasten, Monatsauswahl, Jahresauswahl und Schaltfläche „Aktueller Monat“;
- je Tag genau ein BD-, ein HG-, ein RBN- und ein 2.-RBN-Datenfeld;
- BD-/HG-Personenauswahl mit Live-Regelprüfung;
- Löschen einer vorhandenen BD-/HG-Einteilung im selben Dialog;
- feste, getrennte RBN-Auswahllisten;
- bedingte Sichtbarkeit der zweiten RBN;
- Einzelbearbeitung von Abwesenheiten und Wünschen je Tag;
- Sammelerfassung beliebiger Tage für eine Person und einen Typ;
- automatische Speicherung mit Debounce;
- Serverneuladen auf ausdrücklichen Wunsch;
- Vorladen von Vor-, Folge- und bisherigen Jahresmonaten für monatsübergreifende Regeln und Kontextinformationen.

## 3.2 Kontrolle

- fünf sichtbare Bewertungszustände;
- Tooltip und sichtbare Begründungsliste je Person;
- explizite Bestätigung roter Konflikte;
- Override-Protokoll;
- Statistik für BD, HG, Wochenendlast, Soll und Rest;
- Liste offener BD-/HG-Felder und fachlicher Auffälligkeiten;
- sächsische Feiertage ohne externen Kalenderdienst;
- tagesgenaue Prüfung von Aktivität, Beförderungen und Berechtigungen.

## 3.3 Datenaustausch und Betrieb

- Excel-Import vorhandener Dienstplandateien;
- Excel-Export des sichtbaren Monats;
- JSON-Vollsicherung und JSON-Wiederherstellung;
- druckoptimierte Ausgabe über den Browserdruckdialog;
- lokale Ausfallsicherung in `localStorage`;
- zentrale Speicherung in Cloudflare KV;
- Build-Stempel zur eindeutigen Produktionsdiagnose;
- dauerhafte Neutralisierung historischer Service Worker.

---

# 4. Typischer Arbeitsablauf

1. Anwendung öffnen und Speicherstatus prüfen.
2. Gewünschten Monat über Pfeile oder Dropdowns wählen.
3. Abwesenheiten und Dienstwünsche zunächst einzeln oder gesammelt erfassen.
4. BD- oder HG-Zelle anklicken.
5. Farbstufe und sämtliche Gründe jeder aktiven Person prüfen.
6. Geeignete Person auswählen.
7. Bei roter Stufe Gründe kontrollieren, optionalen Kommentar eintragen und bewusst bestätigen oder abbrechen.
8. RBN auswählen; bei einer freigebenden Erstbesetzung gegebenenfalls zweite RBN festlegen.
9. Statistik und „Offene Punkte“ regelmäßig kontrollieren.
10. Nach Abschluss Excel oder PDF erzeugen und gegebenenfalls eine JSON-Sicherung erstellen.
11. Bei Verdacht auf veraltete Daten den Serverstand ausdrücklich neu laden und den Build-Stempel kontrollieren.

Jede Änderung löst eine neue Darstellung aus. Dadurch werden nicht nur neue Kandidaten, sondern auch bereits eingetragene Dienste sofort gegen den aktuellen Gesamtstand bewertet.

---

# 5. Benutzeroberfläche und Design-Philosophie

## 5.1 Visuelle Ebenen

Die Oberfläche besteht aus fünf wahrnehmbaren Ebenen:

1. einem dunklen Ambient-Hintergrund mit langsam driftenden Farborbs;
2. einer gläsernen Kopfleiste mit Marke, Anwendungstitel, Monatsnavigation und Speicherstatus;
3. einer gläsernen Werkzeugleiste für Erfassung, Import, Export und Reload;
4. einer hellen, Excel-nahen Arbeitsfläche mit Monatskopf, Tabelle, Statistik und offenen Punkten;
5. nativen modalen Dialogen für Auswahl, Metadaten, Sammelerfassung und rote Bestätigung.

Die große Tabellenfläche verwendet keine flächige, leistungsintensive Dauerweichzeichnung. Ihre Glaswirkung entsteht durch kontrollierte Tönung, Lichtkanten, Schatten und semitransparente Einfassungen. Kleinere schwebende Elemente können `backdrop-filter` einsetzen, ohne die gesamte Tabelle permanent neu zu kompositieren.

## 5.2 Klinisch orientierte Informationsdichte

Die Oberfläche ist bewusst kompakt. Der „perfekte Touch“ für den Anwendungszweck entsteht nicht durch dekorative Vergrößerung, sondern durch eine genaue Balance:

- alle fachlichen Spalten bleiben gleichzeitig vorhanden;
- Namen, Statuschips und Gründe sind direkt erreichbar;
- offene Felder sind klar als offen markiert;
- Wochenenden und Feiertage sind flächig, aber nicht aggressiv hervorgehoben;
- der Monat erhält eine eigene visuelle Identität, ohne die Lesbarkeit der weißen Arbeitszellen zu beeinträchtigen;
- Bedienhandlungen bleiben nah an der jeweiligen Tabellenzelle;
- die Statistik liegt unmittelbar unter dem Plan;
- Warnungen werden nicht in einem separaten, schwer auffindbaren Bereich versteckt.

## 5.3 Kopfleiste

Links stehen:

- die kompakte DR-Marke;
- „Klinik für Radiologie und Nuklearmedizin“;
- der Titel „DienstplanRAD“;
- die Funktionszeile „Manuelle Dienstplanung · Cloud-Synchronisierung · Live-Validierung“.

Rechts stehen:

- Pfeil zum Vormonat;
- Monatsauswahl mit zwölf deutschen Monatsnamen;
- Jahresauswahl;
- Pfeil zum Folgemonat;
- Statuspunkt und Statustext für Laden, Speichern, gespeichert oder Offlinebetrieb.

Die Monatsnavigation berücksichtigt Jahreswechsel über native Datumsarithmetik. Schnelle, gegensätzliche Wechsel werden durch einen Anforderungszähler geschützt; verspätete Antworten eines älteren Monats dürfen einen neueren Navigationswunsch nicht überschreiben.

## 5.4 Werkzeugleiste

| Bedienelement | Wirkung |
|---|---|
| **Aktueller Monat** | setzt Monat und Jahr auf das lokale aktuelle Datum |
| **Abwesenheiten** | öffnet die Sammelerfassung für Abwesenheitstypen |
| **Dienstwünsche** | öffnet die Sammelerfassung für Wunschtypen |
| **Serverstand neu laden** | lädt den angezeigten Monat erneut von der Serverquelle |
| **Excel importieren** | liest `.xlsx` oder `.xls` |
| **Excel exportieren** | erstellt eine Arbeitsmappe für den sichtbaren Monat |
| **PDF exportieren** | öffnet den nativen Druckdialog |
| **JSON sichern** | exportiert den verfügbaren Gesamtstand |
| **JSON laden** | validiert und importiert eine Sicherung |

## 5.5 Dialoge

Alle Dialoge verwenden native `<dialog>`-Elemente. Damit übernimmt die Browserplattform Fokusführung, Escape-Verhalten, Hintergrund-Inertisierung und `::backdrop`. Die Dialogkarten folgen derselben Glas- und Typografielogik wie die Hauptoberfläche.

---

# 6. Monatsplan und Tabellenverhalten

## 6.1 Spalten

| Spalte | Inhalt |
|---|---|
| **Tag** | numerischer Kalendertag |
| **Wochentag** | ausgeschriebener Wochentag, bei Feiertagen zusätzlich der Feiertagsname |
| **BD** | bewertete Bereitschaftsdienst-Einteilung |
| **HG** | bewertete Hintergrunddienst-Einteilung |
| **RBN** | feste, datumsabhängige Auswahl |
| **2. RBN** | feste, bedingt sichtbare Auswahl |
| **Urlaub / FZA** | kompakte Tageszusammenfassung, öffnet den Detaildialog |
| **Kein Dienst / Wünsche** | kompakte Wunschzusammenfassung, öffnet den Detaildialog |

## 6.2 Layout

- `table-layout: fixed` verhindert zufällige Spaltenbreiten durch lange Inhalte.
- Eine Mindestbreite erhält die vollständige Fachstruktur.
- Auf schmalen Geräten wird horizontal gescrollt; keine fachliche Spalte wird entfernt.
- Die Kopfzeile bleibt im Tabellen-Scrollbereich sticky.
- Jede Tageszeile erhält einen Index für sanft gestaffelte Eintrittsanimationen.
- Samstag, Sonntag und Feiertag sind über abgestufte Monatsfarbflächen erkennbar.
- Die Wochentagsspalte bildet einen stärkeren vertikalen Farbanker.

## 6.3 BD- und HG-Zellen

Eine belegte Zelle zeigt:

- den Namen;
- einen farbigen Chip der höchsten Bewertungsstufe;
- alle Gründe im nativen Tooltip.

Eine offene Zelle zeigt einen neutralen Platzhalter und einen „offen“-Chip. Der Klick öffnet in beiden Fällen denselben Personendialog.

## 6.4 RBN-Zellen

RBN-Felder werden direkt als native `<select>`-Elemente erzeugt. Es existiert keine nachträgliche DOM-Ersetzung, kein verstecktes Freitextfeld und keine gemeinsame Datalist. Historische Werte außerhalb des heutigen Fachpools können als deaktivierter „Altwert“ sichtbar bleiben.

## 6.5 U/FZA-Zelle

Die kompakte Darstellung trennt die Typografie semantisch:

- ausschließlich der Personenname erhält `font-weight: 700`;
- Doppelpunkt, Kürzel und weitere Ausführung bleiben bei `font-weight: 400`;
- mehrere Einträge werden durch Komma und Leerzeichen getrennt;
- der Tooltip enthält die vollständigen Bezeichnungen und gegebenenfalls die Erklärung einer automatisch abgeleiteten Becker-FZA.

---

# 7. BD- und HG-Auswahl

## 7.1 Kandidatenmenge

Der Dialog zeigt die am Datum aktive, grundsätzlich planbare Belegschaft in der festgelegten Personalreihenfolge. Die Bewertung selbst kann eine Person zusätzlich grau sperren oder rot markieren. Tagesgültige Rollen werden erst nach Anwendung eines möglichen Beförderungsdatums bestimmt.

## 7.2 Inhalt einer Kandidatenkarte

Jede Karte enthält:

- vollständigen Namen;
- sichtbaren Stufenchip;
- sämtliche Gründe als einzelne Textzeilen;
- dieselben Gründe zusätzlich im nativen Tooltip.

Die Unterzeile des Dialogs erklärt, dass rote Konflikte ausdrücklich bestätigt werden müssen.

## 7.3 Auswahlverhalten

- Grün, Gelb und Orange werden direkt übernommen.
- Rot öffnet den Bestätigungsdialog.
- Grau ist deaktiviert und nicht fokussierbar auswählbar.
- „Eintrag löschen“ leert die betreffende Rolle.
- „Abbrechen“ verändert keine Daten.

## 7.4 Rote Bestätigung

Der rote Dialog zeigt Person, Rolle, Datum und alle roten beziehungsweise mitgeführten Gründe. Ein optionaler Kommentar kann die fachliche Abstimmung dokumentieren. Bei Bestätigung wird ein Eintrag in `overrideLog` angelegt. Ohne Bestätigung bleibt der Monatsdatensatz unverändert.

---

# 8. Farbkodierte Eignungsbewertung

## 8.1 Stufen

| Stufe | Sichtbare Bedeutung | Bedienung |
|---|---|---|
| **grün** | geeignet oder nur positiv empfohlen | direkt wählbar |
| **gelb** | weicher Hinweis beziehungsweise relative Nachrangigkeit | direkt wählbar |
| **orange** | relevanter Konflikt oder deutliche Nachrangigkeit | direkt wählbar |
| **rot** | harter Regelverstoß | nur nach ausdrücklicher Bestätigung |
| **grau** | nicht aktiv oder nicht planbar | deaktiviert |

Die höchste ausgelöste Stufe bestimmt die Farbe. Gründe niedrigerer Stufen werden nicht verworfen.

## 8.2 Drei Arten von Gründen

### Bewertungswirksamer Grund

Wird über die interne `push(level, reason)`-Funktion hinzugefügt und kann die Farbstufe anheben.

### Positive Empfehlung

Wird über `recommend(reason, score)` hinzugefügt. Sie erhöht den internen `recommendationScore`, verändert jedoch eine bereits höhere Konfliktstufe nicht.

### Reiner Text-Hinweis

Wird nur der Begründungsliste hinzugefügt. Er beeinflusst weder Farbe noch `recommendationScore`. Der Jahresverlauf wird ausschließlich so behandelt.

## 8.3 Keine verdeckte Kompensation

Ein positiver Wunsch kann einen roten Konflikt nicht „wegpunkten“. Farbstufe und Empfehlungswert sind bewusst getrennte Dimensionen. Die Sicherheit der Regeln hängt niemals von der Summe positiver und negativer Zahlen ab.

## 8.4 Selbstkonsistenz

Bei der Bewertung wird der gerade betrachtete Tag aus Monatszählungen ausgeschlossen. Dadurch erhält eine bereits bestehende Einteilung dieselbe Bewertung wie dieselbe Person unmittelbar vor der Eintragung. Ohne diese Ausnahme würde ein regulärer letzter Soll-BD sich selbst als zusätzlicher Dienst zählen.

---

# 9. Vollständiges fachliches Regelwerk

## 9.1 Aktivität und grundsätzliche Planbarkeit

- Personen außerhalb ihres Aktivitätszeitraums sind grau.
- Personen mit `includeInPlanning: false` sind grau.
- HG ohne tagesgültige HG-Berechtigung ist rot.
- Samstags-BD ohne tagesgültige Samstagsberechtigung ist rot.
- Hr. El Houba erhält ab seinem Beförderungsdatum die hinterlegten Facharztberechtigungen.
- Fr. Hellmann ist erst ab dem 01.10.2026 aktiv.

## 9.2 Tageskollisionen

- dieselbe Person gleichzeitig in BD und HG am selben Tag: rot;
- eingetragene Abwesenheit am Diensttag: rot;
- „Kein Dienst“: rot für BD und HG;
- „Kein BD“: rot für BD;
- „Kein HG“: rot für HG.

Positive Wünsche erzeugen eine starke positive Empfehlung, beseitigen aber keine Konflikte.

## 9.3 Personenspezifische Regeln

- Dr. Polednia ist dienstags und sonntags für BD und HG rot markiert.
- Dr. Becker ist für Samstags-BD orange nachrangig.
- Fr. Dalitz als HG an Sonntag oder Montag bei gleichzeitigem Sebastian-BD ist orange nachrangig.
- Dr. Becker ist am ersten regulären Werktag nach eigenem Samstags-BD für einen weiteren BD rot gesperrt.

## 9.4 BD-Abstände

Alle eigenen BD-Termine aus den geladenen Monaten werden sortiert und in beide Richtungen geprüft:

- eigener BD am Vortag: gelb;
- eigener BD am Folgetag: gelb;
- Abstand von zwei oder drei Kalendertagen: gelb;
- werktägliches Muster BD–FZA–BD mit eingetragenem FZA in der Mitte: eigener gelber Klartextgrund.

Die beidseitige Prüfung verhindert eine Abhängigkeit von der Reihenfolge, in der zwei Dienste eingetragen werden.

## 9.5 BD-Soll und hartes Maximum

- Ist das individuelle BD-Soll vor dem betrachteten Tag bereits erreicht, erscheint ein gelber Richtwerthinweis.
- Ist ein definiertes hartes Maximum erreicht, erscheint rot.
- Das harte Maximum hat Vorrang vor einem zusätzlichen Sollhinweis.
- Dr. Hellmann besitzt ein BD-Soll von 2 und zugleich ein hartes Maximum von 2.

## 9.6 Bedingter BD-Monatsausgleich

Der relative Monatsausgleich soll die frühe Planungsphase nicht dominieren. Er wird deshalb erst aktiv, wenn im betrachteten Monat **mindestens eine am Datum aktive planbare Person mit positivem BD-Soll ihr Soll bereits vollständig erreicht hat**. Tagesbezogene Abwesenheiten oder Wünsche der sollerfüllenden Person deaktivieren diese globale Startbedingung nicht; entscheidend ist, dass irgendein Monats-Soll erfüllt wurde.

Solange niemand sein BD-Soll erreicht hat:

- erscheint keine positive Begründung „Monatsausgleich“;
- erscheint keine gelbe relative Nachrangigkeit wegen eines größeren Rückstands anderer Personen;
- bleiben andere Regeln, Wünsche, Abstände und Kontingente vollständig wirksam.

Sobald mindestens eine Person ihr Soll erreicht hat:

1. Für alle am konkreten Tag grundsätzlich geeigneten BD-Personen wird der noch offene Sollrückstand berechnet.
2. Personen mit dem größten Rückstand erhalten die positive Erklärung „Monatsausgleich: noch … BD bis zum Soll“.
3. Personen mit geringerem Rückstand erhalten gelb den Hinweis, dass andere geeignete Personen einen größeren Rückstand besitzen.
4. Der gerade bewertete Tag wird aus der Zählung ausgeschlossen.

Diese Schwelle verhindert, dass zu Monatsbeginn allein die unterschiedlichen Sollwerte eine ansonsten freie Auswahl gelb einfärben.

## 9.7 Erster BD-Überhang

Sind die Sollwerte aller grundsätzlich geeigneten Personen erreicht und hat noch niemand einen echten Überhang, wird der erste zusätzliche BD bevorzugt Dr. Lurz zugeordnet. Ein positiver BD-Wunsch einer anderen Person setzt diese besondere Überhangpräferenz außer Kraft. Die Regel greift erst nach vollständig erreichtem Monatsausgleich und ist von der Startschwelle in Abschnitt 9.6 logisch getrennt.

## 9.8 Jahresverlauf als reiner Tie-Breaker-Hinweis

Der Jahresverlauf wird nur betrachtet, wenn:

- alle Vormonate des laufenden Jahres vollständig geladen sind;
- mehrere vergleichbare Personen im aktuellen Monatsmaß gleichauf liegen.

Dann erscheint beispielsweise:

- „Jahresverlauf (nur Hinweis, ohne Einfluss auf Bewertung): niedrigste bisherige Dienstlast (…)“ oder
- „Jahresverlauf (nur Hinweis, ohne Einfluss auf Bewertung): höhere bisherige Dienstlast (… statt …)“.

Verbindliche Zusagen:

- Der Text verändert die Farbstufe nicht.
- Der Text verändert den `recommendationScore` nicht.
- Eine höhere historische Last erzeugt insbesondere **keine gelbe Stufe**.
- Eine niedrigere historische Last erzeugt **keine positive Punktgewichtung**.
- Fehlt ein Vormonat, wird kein Jahresvergleich angezeigt.

## 9.9 Urlaubsnähe

- BD unmittelbar vor einem Urlaubstag: orange.
- Donnerstags-BD vor Urlaub in der folgenden Kalenderwoche: positive Empfehlung als möglicher Urlaubsverlängerer.
- Die Prüfung funktioniert monatsübergreifend, sofern der Folgemonat geladen ist.

## 9.10 HG-Ausgleich

Für HG werden unter den grundsätzlich geeigneten Fachärztinnen und Fachärzten BD und HG des Monats kombiniert:

- geringste kombinierte Monatslast: positive Empfehlung;
- höhere kombinierte Monatslast als das Minimum: gelb.

Diese HG-Verteilungsregel ist nicht identisch mit der bedingten BD-Monatsausgleichsregel und besitzt keine Soll-Erreichungsschwelle.

## 9.11 HG bei Assistenzarzt-BD

Steht am Tag ein BD durch eine nicht fachärztliche Person, wird zusätzlich gezählt, wie häufig jede HG-berechtigte Person im Monat bereits einen solchen belastenden HG übernommen hat:

- geringste Zahl: positive Empfehlung;
- höhere Zahl als das Minimum: gelb.

## 9.12 HG-Häufung

- dritter HG in einer Dreierkette aufeinanderfolgender Tage: orange;
- erneuter HG innerhalb von drei Kalendertagen davor oder danach: gelb;
- HG am Tag vor eigenem BD: orange;
- spiegelbildlich BD nach eigenem HG am Vortag: orange;
- das gewünschte Freitag-HG-/Samstags-BD-Bündel wird von dieser allgemeinen Nachbarschaftswarnung ausgenommen.

## 9.13 Kopplungsregeln

### AA-Freitags-BD

Bei einem Assistenzarzt-BD am Freitag müssen Freitag-HG und Samstags-BD durch dieselbe Person besetzt werden. Die Prüfung funktioniert in beiden Eingabereihenfolgen.

### Samstags-BD und Sonntag-HG

Bei fachärztlichem Samstags-BD übernimmt dieselbe Person den Sonntag-HG. Auch diese Kopplung wird in beiden Richtungen geprüft.

### Feiertagsvortag

Bei einem Assistenzarzt-BD am Tag vor einem gesetzlichen Feiertag müssen Vortags-HG und Feiertags-BD identisch besetzt sein.

Passende Kopplungen erzeugen positive Empfehlungsgründe. Abweichungen erzeugen rot. Die Regelengine trägt den Gegenposten niemals automatisch ein.

## 9.14 Wochenendnachbarschaft

Freitag, Samstag und Sonntag werden über den zugehörigen Freitag zu einer Wochenendeinheit gruppiert. Vorheriges und folgendes Wochenende werden geprüft:

- BD an direkt benachbarten Wochenenden: rot;
- sonstiger Dienst an direkt benachbarten Wochenenden: orange.

## 9.15 Relative Wochenendlast

Je Person wird die bisherige Monatsbelastung in Wochenend-Äquivalenten berechnet:

- Wochenende mit mindestens einem BD: 1,0;
- Wochenende ohne BD, aber mit mindestens einem HG: 0,5;
- kein Wochenenddienst: 0.

Personen mit der geringsten bisherigen Last erhalten eine positive Erklärung. Höhere Last wird gelb erläutert. Würde der geplante Dienst das Ziel 1,0 überschreiten, erscheint ein zusätzlicher gelber Hinweis.

## 9.16 Samstagsrotation

Ein weiterer Samstags-BD derselben Person im selben Monat ist orange nachrangig. Die Rotation soll andere geeignete Fachärztinnen und Fachärzte bevorzugen.

## 9.17 Oster- und Pfingstalternanz

- Osterblock: Karfreitag bis Ostermontag;
- Pfingstblock: Pfingstsamstag bis Pfingstmontag.

Wer im jeweils anderen Block bereits BD oder HG hat, erhält im betrachteten Block einen orangefarbenen Alternanzhinweis.

## 9.18 CT-Leitungsbesetzung

Sind Dr. Becker und Dr. Martin an demselben regulären Werktag gleichzeitig durch Urlaub oder FZA abwesend, erzeugt die Sammelprüfung genau einen roten Hinweis. Weiterbildung oder sonstige Abwesenheit lösen diese spezielle Doppelabwesenheitsregel nicht aus.

---

# 10. RBN und zweite RBN

## 10.1 Erste RBN

Der reguläre Pool umfasst:

- Prof. Schob;
- Dr. Bailis;
- Dr. Maybaum;
- Dr. Schüngel;
- Fr. Dalitz;
- Dr. Martin;
- Hr. El Houba.

Ab dem **01.10.2026** kommt Fr. Hellmann hinzu. Vor diesem Datum ist sie weder auswählbar noch kann sie eine zweite RBN freischalten.

## 10.2 Zweite RBN

Der zweite Pool ist dauerhaft auf folgende Personen begrenzt:

- Prof. Schob;
- Dr. Bailis;
- Dr. Maybaum.

Die Auswahl erscheint ausschließlich, wenn die erste RBN desselben Tages durch eine der folgenden Personen besetzt ist:

- Dr. Schüngel;
- Fr. Hellmann;
- Dr. Martin;
- Hr. El Houba.

## 10.3 Wechsel der Erstbesetzung

Wird eine freigebende Erstbesetzung bewusst durch eine nicht freigebende Person oder einen Leerwert ersetzt, wird ein vorhandener zweiter RBN-Wert entfernt und der Monat als geändert markiert. Beim bloßen Laden historischer inkonsistenter Daten erfolgt dagegen keine stille Löschung; ein vorhandener Wert bleibt als „Altwert“ lesbar.

## 10.4 Legacy-RBN-Namen

`state.rbnNames` und `/api/rbn-names` bleiben aus Kompatibilitätsgründen Bestandteil älterer Sicherungen und Bootstrapdaten. Die aktuelle Benutzeroberfläche verwendet diese Liste nicht als Auswahlquelle; maßgeblich ist ausschließlich `js/rbn.js`.

---

# 11. Abwesenheiten, FZA und Dienstwünsche

## 11.1 Abwesenheitstypen

| ID | Anzeige | Kurzform |
|---|---|---|
| `urlaub` | Urlaub | U |
| `fza` | FZA/Frei | FZA |
| `weiterbildung` | Weiterbildung | WB |
| `sonstige` | Sonstige Abwesenheit | abwesend |

Jede eingetragene Abwesenheit erzeugt bei einer BD- oder HG-Auswahl am selben Tag einen roten Konflikt.

## 11.2 Dienstwünsche

| ID | Anzeige | Wirkung |
|---|---|---|
| `kein-bd` | Kein BD | rot bei BD |
| `kein-hg` | Kein HG | rot bei HG |
| `kein-dienst` | Kein Dienst | rot bei BD und HG |
| `bd-bevorzugt` | BD bevorzugt | starke positive Empfehlung bei BD |
| `hg-bevorzugt` | HG bevorzugt | starke positive Empfehlung bei HG |
| `dienst-bevorzugt` | Dienst bevorzugt | starke positive Empfehlung bei BD und HG |

## 11.3 Einzelbearbeitung

Ein Klick auf die U/FZA- oder Wunschzelle öffnet den Tagesdialog. Für jede in der Abwesenheitsliste geführte Person können Abwesenheit und Wunsch getrennt gesetzt oder entfernt werden.

## 11.4 Sammelerfassung

Die Sammelerfassung kombiniert:

- Personenauswahl;
- Typauswahl;
- Monatsraster mit einzelnen anwählbaren Tagen;
- Wochenend- und Feiertagsmarkierung;
- Anzeige des aktuell gesetzten Typs;
- gemeinsame Übernahme aller markierten Tage.

## 11.5 Becker-FZA

Nur für Dr. Becker wird nach eigenem Samstags-BD am nächsten regulären Werktag automatisch „Becker: FZA“ dargestellt, sofern kein widersprechender manueller Zustand vorliegt. Andere Personen erhalten keine automatische sichtbare FZA-Eintragung. Importierte nicht manuelle FZA-Werte können ausgeblendet werden, wenn sie genau einer ableitbaren FZA nach eigenem BD entsprechen; manuelle Einträge bleiben sichtbar.

---

# 12. Statistik und offene Punkte

## 12.1 Verteilungstabelle

Je planbarer Person werden angezeigt:

- Name;
- Anzahl BD;
- Anzahl HG;
- Wochenend-Äquivalent;
- individuelles BD-Soll;
- Rest bis zum Soll beziehungsweise negativer Überhang.

Eine zusätzliche Zeile zeigt die offenen BD- und HG-Felder des Monats.

## 12.2 Offene Punkte

`collectIssues()` sammelt:

- jeden Tag ohne BD;
- jeden Tag ohne HG;
- jede bestehende orange oder rote Einteilung;
- die definierte Becker/Martin-Doppelabwesenheit.

Rote und orange Auffälligkeiten werden vor langen Listen offener Tage dargestellt. Die sichtbare Liste ist auf 40 Einträge begrenzt und nennt die Zahl weiterer Punkte. Ist nichts offen, erscheint eine ausdrückliche Erfolgsmeldung.

Gelbe relative Hinweise werden nicht als harte Auffälligkeit über orange oder rote Punkte gestellt. Der Jahresverlauf ist ein reiner Kandidatenhinweis und erzeugt keinen offenen Punkt.

---

# 13. Feiertage, reguläre Werktage und Zeitzonen

## 13.1 Sächsische Feiertage

Die Anwendung berechnet intern:

- Neujahr;
- Karfreitag;
- Ostermontag;
- Tag der Arbeit;
- Christi Himmelfahrt;
- Pfingstmontag;
- Tag der Deutschen Einheit;
- Reformationstag;
- Buß- und Bettag;
- ersten Weihnachtsfeiertag;
- zweiten Weihnachtsfeiertag.

## 13.2 Regulärer Werktag

Ein regulärer Werktag ist Montag bis Freitag und kein gesetzlicher Feiertag. Diese Definition steuert insbesondere:

- die Becker-FZA-Ableitung;
- die Becker-Sperre nach Samstags-BD;
- die CT-Leitungsprüfung.

## 13.3 Zeitzonensicherheit

Kalendertage werden als lokale Mitternacht interpretiert. ISO-Tagesstrings werden aus lokalen Jahr-, Monats- und Tageswerten erzeugt. Ein Rückweg über `toISOString()` wird vermieden, da deutsche lokale Mitternacht in UTC auf den vorherigen Kalendertag fallen kann.

---

# 14. Monatsfarben, Glasoptik und Animationen

## 14.1 Zwölf Monatsidentitäten

| Monat | Palette |
|---|---|
| Januar | Eisblau |
| Februar | Rubinrose |
| März | Salbeigrün |
| April | Lavendel |
| Mai | Frühlingsgrün |
| Juni | Türkis |
| Juli | Koralle |
| August | Bernstein |
| September | Pflaume |
| Oktober | Kupfer |
| November | Schieferblau |
| Dezember | Tannengrün & Rubin |

Jede Palette definiert Grundakzent, starken Akzent, Glow und Paneltönung.

## 14.2 Tabellenmischungen

- Wochentagsspalte: 46 Prozent Monatsfarbe;
- Samstag: 14 Prozent;
- Sonntag: 22 Prozent;
- Feiertag: 30 Prozent.

Der berechnete Schriftton hält auf allen zwölf Paletten mindestens WCAG-AA-Kontrast.

## 14.3 Farbinterpolation

Die Farbe wird nicht über eine CSS-Transition einer Custom Property animiert. `theme.js` interpoliert mit `requestAnimationFrame` und `performance.now()` in einem wahrnehmungsnäheren Farbraum. Dadurch:

- bleibt die Dauer reproduzierbar;
- werden blockierte Frames korrekt übersprungen;
- führen Farbtonwechsel nicht über graue Zwischenzustände;
- erhalten abgeleitete Flächen in allen Engines konkrete RGB-/RGBA-Werte.

Die Farbwäsche dauert 720 Millisekunden. Die Inhaltsbewegung ist schneller; der Plan erscheint zeitnah, während die Monatsfarbe ruhig nachzieht.

## 14.4 Bewegungsreduktion

Bei `prefers-reduced-motion` werden nicht notwendige Übergänge reduziert beziehungsweise übersprungen. Funktion und Information bleiben vollständig erhalten.

---

# 15. Datenmodell

## 15.1 Monatsobjekt

```jsonc
{
  "schemaVersion": 1,
  "year": 2026,
  "month": 7,
  "revision": 12,
  "updatedAt": "2026-07-30T08:00:00.000Z",
  "days": {
    "2026-07-01": {
      "bd": "lurz",
      "hg": "dalitz",
      "rbn1": "Dr. Martin",
      "rbn2": "Prof. Schob",
      "notes": ""
    }
  },
  "absences": {
    "lurz": { "2026-07-20": "urlaub" }
  },
  "absenceSources": {
    "lurz": { "2026-07-20": "manual" }
  },
  "preferences": {
    "martin": { "2026-07-04": "kein-bd" }
  },
  "overrideLog": [],
  "importLog": []
}
```

## 15.2 Felder

- `schemaVersion`: Grundlage künftiger Migrationen;
- `year`, `month`: selbstbeschreibende Monatszuordnung;
- `revision`: wird bei jedem Persistieren erhöht;
- `updatedAt`: Zeitpunkt der letzten Persistierung;
- `days[iso].bd`, `days[iso].hg`: stabile Personal-ID oder leer;
- `days[iso].rbn1`: tagesgültiger erster RBN-Wert oder historischer Altwert;
- `days[iso].rbn2`: fester zweiter RBN-Wert, leer oder historischer Altwert;
- `days[iso].notes`: reserviertes Tagesnotizfeld ohne aktuelle sichtbare Spalte;
- `absences`: Abwesenheit je Person und Tag;
- `absenceSources`: Herkunft `manual` oder `import`;
- `preferences`: Wunsch je Person und Tag;
- `overrideLog`: unveränderlich anwachsende rote Freigaben;
- `importLog`: reservierte Importhistorie.

## 15.3 Standardpersonal

| ID | Anzeige | Rolle | BD-Soll | Maximum | HG | Samstags-BD | Aktivität |
|---|---|---|---:|---:|---|---|---|
| `schaefer` | Prof. Schäfer | Chefarzt | – | – | – | – | nur Abwesenheitsliste |
| `lurz` | Dr. Lurz | FA/OA | 4 | – | ja | ja | ab 01.01.2025 |
| `polednia` | Dr. Polednia | FA/OA | 3 | – | ja | ja | ab 01.01.2025 |
| `dalitz` | Fr. Dalitz | FÄ/OÄ | 4 | – | ja | ja | ab 01.01.2025 |
| `becker` | Dr. Becker | FÄ/OÄ | 3 | – | ja | ja | ab 01.01.2025 |
| `hellmann` | Fr. Hellmann | FÄ | 2 | 2 | ja | ja | ab 01.10.2026 |
| `martin` | Dr. Martin | FA | 4 | – | ja | ja | ab 01.01.2025 |
| `elhouba` | Hr. El Houba | AA, später FA | 4 | – | ab 22.09.2026 | ab 22.09.2026 | ab 01.01.2025 |
| `licenji` | Fr. Licenji | AÄ | 4 | – | nein | nein | ab 01.01.2025 |
| `sebastian` | Hr. Sebastian | AA | 4 | – | nein | nein | ab 01.01.2025 |

Die feste Planungsreihenfolge lautet:

```text
lurz → polednia → dalitz → becker → hellmann → martin → elhouba → licenji → sebastian
```

---

# 16. Zustand, Speicherung und Offline-Verhalten

## 16.1 Laufzeitzustand

`state` hält:

- Einstellungen;
- Personal;
- Legacy-RBN-Namen;
- geladene Monate in einer `Map`;
- sichtbares Jahr und Monat;
- Speicherstatus;
- Dirty-Flag und Debounce-Timer;
- Serverbereitschaft;
- aktuellen Sammelmodus;
- aktuellen Personendialog;
- gecachte Bootstrapdaten.

## 16.2 Lokale Schlüssel

| Inhalt | Schlüssel |
|---|---|
| Bootstrap | `dienstplanrad:bootstrap` |
| Monat | `dienstplanrad:month:YYYY-MM` |

## 16.3 Laden

1. Bootstrapdaten werden vom Server angefordert.
2. Der aktuelle Monat wird geladen.
3. Vor- und Folgemonat werden erwärmt.
4. Zusätzlich werden die bisherigen Monate desselben Jahres geladen, damit der Jahresverlauf bei vollständiger Historie als Text-Hinweis verfügbar ist.
5. Schlägt ein Monatsabruf fehl, wird der lokale Monat verwendet.
6. Fehlt auch lokal ein Datensatz, wird ein vollständiger leerer Monat erzeugt.

## 16.4 Speichern

Änderungen setzen `dirty` und starten einen Debounce von 1.100 Millisekunden. Beim Speichern:

- steigt `revision`;
- wird `updatedAt` gesetzt;
- wird der Monat zuerst lokal geschrieben;
- folgt der Server-PUT;
- wechselt die Statusanzeige zu gespeichert oder offline.

Beim Schließen versucht `beforeunload`, einen noch schmutzigen Monat zu persistieren. Die lokale Sicherung bleibt die erste Ausfallschicht.

---

# 17. Cloudflare-Backend und HTTP-API

## 17.1 Architektur

Das Backend besteht aus Cloudflare Pages Functions und einem KV-Binding namens `DIENSTPLAN_KV`. Es gibt keinen separaten Serverprozess und keine relationale Datenbank.

## 17.2 KV-Schlüssel

| Datensatz | KV-Schlüssel |
|---|---|
| Einstellungen | `app:settings` |
| Personal | `app:staff` |
| Legacy-RBN-Namen | `app:rbn-names` |
| Monat | `year:YYYY:month:MM` |

## 17.3 Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| GET | `/api/bootstrap` | Einstellungen, Personal und Legacy-RBN-Liste |
| GET | `/api/month/:year/:month` | normalisierten Monat lesen |
| PUT | `/api/month/:year/:month` | normalisierten Monat schreiben |
| GET/PUT | `/api/settings` | Einstellungen lesen oder ersetzen |
| GET/PUT | `/api/staff` | Personal lesen oder ersetzen |
| GET/PUT | `/api/rbn-names` | Legacy-Kompatibilität |
| GET | `/api/export` | Gesamtstand exportieren |
| POST | `/api/import` | Gesamt- oder Teilstand importieren |
| GET | `/sw.js` | historischer Service-Worker-Grabstein |

## 17.4 Normalisierung

`ensureMonthShape()` legt zunächst einen vollständigen leeren Monat an und überlagert gespeicherte Nutzdaten. Fehlende Kalendertage werden dadurch ergänzt. Die Funktion bewahrt zusätzliche Monatsfelder und füllt `days` mit dem vollständigen Tagesgerüst auf.

## 17.5 Antworten

JSON-Antworten verwenden UTF-8 und `Cache-Control: no-store`. Fehlende KV-Bindings führen zu einem klaren Fehler statt zu stiller In-Memory-Speicherung.

---

# 18. Excel, JSON, Drucken und PDF

## 18.1 Excel-Import

Der Import verwendet SheetJS 0.20.3. Monatsblätter werden anhand der deutschen Kurzbezeichnungen erkannt. Bestehende geplante Dienste werden nicht blind durch leere oder unvollständige Importwerte überschrieben. Abwesenheiten können mit ihrer Herkunft `import` gekennzeichnet werden, damit die FZA-Darstellung zwischen manuellen und importierten Angaben unterscheiden kann.

## 18.2 Excel-Export

Der sichtbare Monat wird in eine neue Arbeitsmappe übertragen. Die Ausgabe bildet die Tageszeilen und die für den Dienstplan relevanten Spalten ab. Der Export ist eine Momentaufnahme des dargestellten Monats, keine vollständige Systemsicherung.

## 18.3 JSON-Sicherung

JSON ist das verlustarme Sicherungsformat für Einstellungen, Personal, Monatsdaten, Abwesenheiten, Wünsche und Protokolle. Bei erreichbarem Server wird der serverseitige Gesamtstand verwendet; im Offlinefall kann der lokal verfügbare Zustand gesichert werden.

## 18.4 JSON-Wiederherstellung

Eine geladene Datei wird als JSON geparst und strukturell geprüft. Die Wiederherstellung kann mehrere Monate enthalten. Serverfehler werden nicht als erfolgreicher Import dargestellt.

## 18.5 Drucken und PDF

„PDF exportieren“ nutzt den nativen Druckdialog. Das Druckstylesheet:

- entfernt Ambient-Hintergrund, Werkzeugleisten, Dialoge und nicht benötigte Statusbereiche;
- konzentriert die Ausgabe auf Monatskopf, Tabelle und Statistik;
- optimiert für A4;
- verhindert unnötige Glas- und Animationseffekte;
- blendet den interaktiven Block „Offene Punkte“ aus.

---

# 19. Sicherheit, Datenschutz und Datenintegrität

## 19.1 Datenminimierung

Gespeichert werden Dienstplaninformationen, Rollenstammdaten, Abwesenheitstypen, Wünsche und Konfliktfreigaben. Freitext entsteht im regulären Betrieb nur als optionaler Override-Kommentar und in reservierten Datenfeldern.

## 19.2 HTML-Sicherheit

Personalnamen und andere aus KV stammende Texte werden vor Einbettung in `innerHTML` maskiert. Wo möglich, verwendet die Anwendung `textContent` und DOM-Elementerzeugung.

## 19.3 Transport und Zugriff

Die Anwendung setzt HTTPS über Cloudflare voraus. Authentifizierung und Zugriffsschutz werden auf Cloudflare-Ebene beziehungsweise über die gewählte Bereitstellungsumgebung konfiguriert; im Repository ist kein eigenes Benutzer- und Rollenlogin implementiert.

## 19.4 Datenintegrität

- Monatsobjekte werden auf ein vollständiges Schema normalisiert.
- Rote Freigaben werden protokolliert.
- Historische RBN-Altwerte werden nicht beim bloßen Anzeigen gelöscht.
- Der gerade bewertete Tag wird aus Vergleichszählungen ausgeschlossen.
- Regeln schreiben keine Gegenbelegung automatisch.
- Jahresinformationen werden nur bei vollständig geladenen Vormonaten angezeigt.
- Der Jahresverlauf beeinflusst keine Bewertung.

---

# 20. Barrierefreiheit und responsive Nutzung

- semantische Tabellenstruktur mit Kopfzellen;
- echte Buttons und Selects statt klickbarer Div-Attrappen;
- native Dialoge;
- sichtbare Textlabels zusätzlich zu Farben;
- Tooltips und sichtbare Begründungen;
- deaktivierte graue Kandidaten mit `disabled` und `aria-disabled`;
- `aria-label` für datumsbezogene RBN-Auswahlfelder;
- ausreichender Textkontrast auf Monatsflächen;
- Fokus bleibt bei nativen Steuerelementen nachvollziehbar;
- horizontales Scrollen statt fachlicher Informationsverlust;
- Unterstützung von `prefers-reduced-motion`;
- keine alleinige Codierung durch Farbe, da jede Stufe einen Textchip besitzt.

Auf kleinen Bildschirmen bleiben alle acht Fachspalten vorhanden. Die Anwendung ist responsiv im Sinne einer vollständig nutzbaren, horizontal scrollbaren Arbeitsfläche; sie versucht nicht, den Dienstplan in eine inhaltlich reduzierte Kartenansicht umzudeuten.

---

# 21. Technische Architektur und Module

## 21.1 Technologie

| Bereich | Umsetzung |
|---|---|
| Frontend | HTML, CSS, native ES-Module |
| Framework | keines |
| Bundler/Transpiler | keiner |
| Backend | Cloudflare Pages Functions |
| Persistenz | Cloudflare KV und `localStorage` |
| Excel | SheetJS 0.20.3 über CDN |
| Tests | `node:test`, `node:assert/strict` |
| Installation | Web App Manifest, `standalone` |
| Service Worker | keiner; nur neutralisierender Grabstein-Endpunkt |

## 21.2 `index.html`

Enthält:

- Build-Stempel;
- frühe Alt-Worker-Bereinigung vor den eigenen Assets;
- Manifest, Stylesheet und App-Einstieg mit gemeinsamem Release-Token;
- Kopfleiste, Werkzeugleiste, Tabelle, Statistik und Dialoge.

## 21.3 `js/app.js`

Verantwortlich für:

- Initialisierung;
- DOM-Caching und Ereignisbindung;
- Monatsnavigation und Wettlaufschutz;
- Rendering von Tabelle, Statistik und offenen Punkten;
- Personendialog und rote Bestätigung;
- RBN-Steuerelemente;
- Abwesenheits- und Wunschdialoge;
- Excel-, JSON- und Druckabläufe;
- Build-Markierung;
- zusätzliche Alt-Worker-Bereinigung.

## 21.4 `js/defaults.js`

Definiert Monatsnamen, Tabellenblätter, Wochentage, Standardeinstellungen, Personalreihenfolge, Standardpersonal, Abwesenheitstypen, Wunschtypen und das leere Monatsschema.

## 21.5 `js/holidays.js`

Einzige Quelle für lokale Datumslogik, sächsische Feiertage, Osterberechnung, reguläre Werktage und Feiertagsblöcke.

## 21.6 `js/rbn.js`

DOM-freie Fachquelle für:

- ersten RBN-Pool;
- zweiten RBN-Pool;
- Aktivierungsdatum von Fr. Hellmann;
- strikte ISO-Tagesvalidierung;
- Zulässigkeitsprüfung;
- Trigger der zweiten RBN.

## 21.7 Regelmodule

- `rules-core.js`: Getter, Setter, Zählungen, Wochenendmodelle, Rollen- und Aktivitätslogik;
- `rules-evaluation.js`: komplette Kandidatenbewertung, Empfehlungen und reine Hinweise;
- `rules-reporting.js`: Statistik und Sammelprüfung;
- `rules.js`: DOM-freie öffentliche Fassade.

## 21.8 `js/state.js`

Verwaltet Laufzeitstatus, lokale Sicherung, Serverbootstrap, Monatsladen, Historienvorwärmung, Speicherdebounce und Persistierung.

## 21.9 `js/api.js`

Zentraler Fetch-Wrapper mit einheitlicher JSON-Verarbeitung und klarer Fehlerweitergabe.

## 21.10 `js/theme.js`

Definiert Paletten, Farbparsing, Kontrastberechnung, OKLab-/OKLCH-Interpolation, Easing, Dauer und Anwendung der CSS-Variablen.

## 21.11 Pages Functions

- `_utils.js`: KV-Zugriff, JSON-Antworten, Schlüssel und Monatsnormalisierung;
- `bootstrap.js`: zusammengefasste Startdaten;
- `month/[year]/[month].js`: Monats-GET und -PUT;
- `settings.js`, `staff.js`, `rbn-names.js`: globale Daten;
- `export.js`, `import.js`: Sicherung und Wiederherstellung;
- `sw.js.js`: neutralisierender historischer Worker-Endpunkt.

---

# 22. Projektstruktur

```text
.
├── index.html
├── styles.css
├── manifest.webmanifest
├── _headers
├── package.json
├── README.md
├── icons/
│   └── icon.svg
├── js/
│   ├── api.js
│   ├── app.js
│   ├── defaults.js
│   ├── holidays.js
│   ├── rbn.js
│   ├── rules-core.js
│   ├── rules-evaluation.js
│   ├── rules-reporting.js
│   ├── rules.js
│   ├── state.js
│   └── theme.js
├── functions/
│   ├── _utils.js
│   ├── sw.js.js
│   └── api/
│       ├── bootstrap.js
│       ├── export.js
│       ├── import.js
│       ├── rbn-names.js
│       ├── settings.js
│       ├── staff.js
│       └── month/
│           └── [year]/
│               └── [month].js
└── tests/
    ├── delivery.test.js
    ├── historical-loading.test.js
    ├── month-navigation.test.js
    ├── rbn.test.js
    ├── recommendation-rules.test.js
    ├── rule-matrix.test.js
    ├── rules.test.js
    ├── theme.test.js
    └── timezone.test.js
```

---

# 23. Tests und Qualitätsgarantien

## 23.1 Syntaxprüfung

```bash
npm run check
```

Die Prüfliste umfasst jedes ausgelieferte JavaScript-Modul unter `js/` und `functions/`. Ein Regressionstest vergleicht die tatsächlichen Dateien mit dem Paket-Skript, damit neue Module nicht unbemerkt aus der Syntaxprüfung herausfallen.

## 23.2 Testsuite

```bash
npm test
```

Die Tests decken unter anderem ab:

- harte und weiche Regeln;
- Personensonderregeln;
- monatsübergreifende Abstände;
- Reihenfolgeunabhängigkeit;
- Selbstkonsistenz bestehender Einteilungen;
- Kopplungsregeln in beiden Eingabereihenfolgen;
- bedingten Start des BD-Monatsausgleichs;
- reinen Informationscharakter des Jahresverlaufs;
- HG- und Wochenendverteilung;
- RBN-Pools und Datumsgrenzen;
- historische RBN-Altwerte;
- U/FZA-Typografie;
- Feiertage und Zeitzonen;
- Paletten, Kontrast und Farbinterpolation;
- Monatsnavigation und Wettlaufschutz;
- Release-Token und Modulauflösung;
- vollständige Syntaxabdeckung;
- Service-Worker-Neutralisierung;
- Cloudflare-Cacheheader.

## 23.3 Wichtige Invarianten

### Reihenfolgeunabhängigkeit

Zwei zueinander in Beziehung stehende Dienste müssen dieselbe Bewertung ergeben, unabhängig davon, welcher zuerst eingetragen wurde.

### Selbstkonsistenz

Eine bereits eingetragene Person muss für denselben Tag dieselbe Stufe erhalten wie unmittelbar vor ihrer Eintragung.

### Informationsneutralität des Jahresverlaufs

Bei sonst gleicher Situation müssen unterschiedliche Jahreslasten dieselbe Stufe und denselben Empfehlungswert erzeugen.

### Startschwelle des Monatsausgleichs

Vor Erreichen irgendeines BD-Solls darf der Monatsausgleich weder positive noch gelbe relative Gründe erzeugen.

---

# 24. Lokale Entwicklung

## 24.1 Voraussetzungen

- aktuelle Node.js-Version mit `node:test`;
- moderner Browser;
- optional Cloudflare Pages/Wrangler für Functions und KV;
- Internetzugriff auf das SheetJS-CDN für Excel-Funktionen.

## 24.2 Prüfen

```bash
npm run check
npm test
```

## 24.3 Lokale statische Ausführung

Da native ES-Module und Fetch verwendet werden, sollte die Anwendung über einen lokalen HTTP-Server und nicht direkt per `file://` geöffnet werden. Backendfunktionen benötigen eine Pages-/Wrangler-Umgebung oder geeignete Mockdaten.

## 24.4 Entwicklungsprinzipien

- fachliche Rechenlogik DOM-frei halten;
- neue Module in `npm run check` aufnehmen;
- jede neue Regel mit positivem und negativem Gegenbeispiel testen;
- bei zeitlichen Regeln beide Eingabereihenfolgen prüfen;
- bei Zählregeln den betrachteten Tag explizit ausschließen;
- informative Texte nicht versehentlich über `push` oder `recommend` bewertungswirksam machen;
- Release-Token bei funktionalen Änderungen konsistent erhöhen;
- README im selben Pull Request auf den tatsächlichen Endstand bringen.

---

# 25. Deployment, Release-Kennung und Cache-Sicherheit

## 25.1 Cloudflare Pages

Das Repository wird aus dem Projektstamm bereitgestellt. Pages Functions werden aus `functions/` erkannt. Das KV-Binding muss exakt `DIENSTPLAN_KV` heißen.

## 25.2 Release-Token

Alle releasekritischen Assets und relativen Browserimporte verwenden denselben `?v=`-Token. Der Build-Stempel in `index.html` muss exakt dazu passen. Für diesen Funktionsstand ist die Kennung:

```text
20260730.5
```

Der laufende Stand ist im Browser über `document.documentElement.dataset.build` und im Tooltip des Speicherstatus sichtbar.

## 25.3 Header

- App-Shell und `index.html`: keine ungeprüfte Wiederverwendung;
- CSS und JavaScript: Revalidierung;
- API-Antworten: `no-store`;
- `/sw.js`: Function-Antwort mit `no-store` und korrektem JavaScript-MIME-Typ.

## 25.4 Kein aktiver Service Worker

Die Anwendung registriert keinen Service Worker. Ein historischer Cache-First-Worker hatte frühere Releases verdeckt. Zwei dauerhafte Schutzschichten bleiben deshalb erhalten:

1. Inline-Bereinigung in `index.html` vor den ersten eigenen Asset-Anfragen;
2. zusätzliche Bereinigung beim App-Start.

Nur Registrierungen mit Pfad `/sw.js` werden angefasst. Ein Tab, der noch tatsächlich von diesem Worker kontrolliert wird, lädt höchstens einmal neu; eine Sessionmarke verhindert Schleifen.

## 25.5 Release-Checkliste

1. `npm run check` erfolgreich;
2. `npm test` vollständig erfolgreich;
3. alle relativen Browserimporte auflösbar;
4. einheitlicher Release-Token;
5. Build-Stempel entspricht dem Token;
6. kein aktiver Service Worker und keine Registrierung;
7. `_headers` und Function-Routen geprüft;
8. Monatsnavigation und schnelle Richtungswechsel geprüft;
9. BD-/HG-Dialoge und Tooltips geprüft;
10. RBN-Abhängigkeit geprüft;
11. Druckansicht geprüft;
12. Live-Build-Stempel nach Deployment kontrolliert.

---

# 26. Betrieb und Fehlerdiagnose

## 26.1 Anzeige bleibt auf „Lädt …“

Prüfen:

- Browserkonsole und Netzwerkfehler;
- `/api/bootstrap`;
- vorhandenes KV-Binding;
- ob ein historischer Worker den Tab kontrolliert;
- Build-Stempel und tatsächlich geladene Asset-Token.

## 26.2 Status „Offline – lokaler Stand“

Die Anwendung verwendet lokale Daten. Änderungen bleiben lokal erhalten und können als JSON gesichert werden. Vor einem erzwungenen Serverreload sollte geprüft werden, ob der lokale Stand neuer ist.

## 26.3 Falscher oder alter Stand sichtbar

- Build-Stempel kontrollieren;
- Seite vollständig neu laden;
- Entwicklerwerkzeuge: `document.documentElement.dataset.build`;
- `/sw.js` auf JavaScript-MIME-Typ und `no-store` prüfen;
- Cloudflare-Deployment-Branch kontrollieren.

## 26.4 Monatsausgleich erscheint unerwartet früh

Mindestens eine aktive planbare Person muss ihr BD-Soll im Monat bereits erreicht haben. Ist dies nicht der Fall, handelt es sich um eine Regression. Zu prüfen sind die Zählung unter Ausschluss des betrachteten Tages und die Testfälle in `recommendation-rules.test.js`.

## 26.5 Jahresverlauf verändert eine Farbe

Dies ist unzulässig. Der Jahresverlauf darf nur über die neutrale Hinweisfunktion der Begründungsliste hinzugefügt werden. Weder `push` noch `recommend` dürfen dafür verwendet werden.

## 26.6 Zweite RBN fehlt

Prüfen:

- erste RBN ist Dr. Schüngel, Fr. Hellmann, Dr. Martin oder Hr. El Houba;
- bei Fr. Hellmann liegt das Datum am oder nach dem 01.10.2026;
- der gespeicherte Erstwert entspricht exakt dem festen Pool.

---

# 27. Gezielte Anpassungen

## 27.1 Personal und Sollwerte

Standardwerte liegen in `js/defaults.js`. Änderungen an IDs sind besonders kritisch, da Monatsdaten stabile IDs speichern. Namensänderungen sind dagegen möglich, ohne vergangene Monatsdaten umzuschreiben.

## 27.2 RBN-Pools

Pools, Aktivierungsgrenzen und Trigger liegen ausschließlich in `js/rbn.js`. Anpassungen benötigen Grenztests vor, am und nach dem Stichtag.

## 27.3 Regeln

- gemeinsame Zähl- und Datumshelfer: `rules-core.js`;
- Bewertung: `rules-evaluation.js`;
- Statistik und offene Punkte: `rules-reporting.js`.

Neue reine Informationen müssen direkt der Begründungsliste hinzugefügt werden und dürfen keine Stufe oder Punktzahl verändern.

## 27.4 Monatsfarben

Paletten liegen in `theme.js`. Jede Änderung muss gegen Kontrasttests, Farbparser und Interpolation geprüft werden.

## 27.5 Feiertage

Die Region ist derzeit Sachsen. Weitere Regionen benötigen eine klare Erweiterung der gemeinsamen Feiertagsquelle; UI und Regelwerk dürfen keine getrennten Kalenderimplementierungen erhalten.

---

# 28. Bewusste Grenzen und Invarianten

- Keine automatische Dienstplanerstellung.
- Keine automatische Gegenbelegung bei Kopplungsregeln.
- Keine serverseitige Mehrbenutzer-Sperre oder Konfliktauflösung.
- Keine eigene Benutzerverwaltung im Repository.
- Kein aktiver Service Worker.
- Keine vollständige serverseitige Fachvalidierung jeder Monatskombination; die UI und Regelengine sind die primäre Fachschicht.
- Historische Altwerte werden sichtbar erhalten, nicht ungefragt migriert.
- Monats- und Jahresverteilung sind Entscheidungshilfen, keine mathematische Garantie einer optimalen Gesamtplanung.
- Der Jahresverlauf ist ausschließlich Kontexttext.
- Der BD-Monatsausgleich beginnt erst nach erster Soll-Erfüllung.
- Positive Empfehlungen heben rote, orange oder gelbe Regeln nicht auf.
- Farbe ist nie die einzige Informationsquelle.

---

# 29. Glossar

| Begriff | Erklärung |
|---|---|
| **AA/AÄ** | Assistenzarzt beziehungsweise Assistenzärztin |
| **FA/FÄ** | Facharzt beziehungsweise Fachärztin |
| **OA/OÄ** | Oberarzt beziehungsweise Oberärztin |
| **BD** | Bereitschaftsdienst |
| **HG** | Hintergrunddienst |
| **RBN** | Rufbereitschaft Nuklearmedizin |
| **FZA** | Freizeitausgleich/Frei |
| **Soll** | angestrebte monatliche BD-Anzahl |
| **Maximum** | harte zulässige monatliche Obergrenze |
| **Überhang** | BD oberhalb des individuellen Solls |
| **Tie-Breaker** | Zusatzinformation bei sonst gleicher Vergleichslage; hier ohne Bewertungswirkung |
| **Override** | bewusst bestätigte rote Einteilung |
| **KV** | Cloudflare Key-Value-Speicher |
| **Bootstrap** | globale Startdaten aus Einstellungen, Personal und Legacy-RBN-Liste |
| **Dirty** | lokal geänderter, noch nicht abschließend gespeicherter Zustand |
| **Debounce** | verzögertes Zusammenfassen schneller Änderungen vor dem Speichern |
| **Release-Token** | Versionsparameter aller Browserassets zur eindeutigen Auslieferung |
| **Build-Stempel** | sichtbare Kennung des tatsächlich geladenen Releases |
| **Altwert** | historischer gespeicherter Wert außerhalb des aktuellen Auswahlpools |

---

## Zusammenfassung

DienstplanRAD verbindet eine kompakte, klinisch vertraute Monatsliste mit einer transparenten, vollständig begründeten Regelprüfung. Die Anwendung wahrt die Entscheidungshoheit des Menschen, verhindert verdeckte Automatik, dokumentiert harte Ausnahmen, bleibt bei Serverausfall lokal arbeitsfähig und ist durch Tests gegen zeitliche Asymmetrien, Selbstzählung, Cachefehler und Auslieferungsregressionen abgesichert.

Für die aktuelle Fairnesslogik gelten zwei besonders wichtige Leitplanken:

1. **Der BD-Monatsausgleich greift erst, nachdem mindestens eine Person ihr Monats-Soll erreicht hat.**
2. **Der Jahresverlauf bleibt ein reiner Text-Hinweis und beeinflusst weder Farbe noch Empfehlungswert.**
