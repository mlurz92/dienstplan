# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – abstrakte gläserne Dienstplantabelle" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Referenzstand:** Build `20260801.11` · Paketversion `0.2.0` · Datenregion Sachsen (`SN`)  
> **Betriebsmodell:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung  
> **Planungsgrundsatz:** Der Mensch plant. DienstplanRAD prüft, erklärt, speichert und dokumentiert.

DienstplanRAD ist eine auf den klinischen Alltag der Radiologie zugeschnittene Webanwendung zur **manuellen Monatsplanung** von **Bereitschaftsdiensten (BD)**, **Hintergrunddiensten (HG)** sowie der ersten und zweiten **Rufbereitschaft Neuroradiologie (RBN)**. Die Anwendung verbindet eine chronologische, Excel-nahe Tagesliste mit einer vollständig erklärbaren Regelengine, tagesbezogenen Personal- und Qualifikationsdaten, komfortabler Erfassung von Abwesenheiten und Dienstwünschen, einer lokalen Ausfallsicherung sowie zentraler Cloudflare-KV-Persistenz.

DienstplanRAD ist ausdrücklich **kein automatischer Dienstplaner**. Es existieren kein Optimierungslauf, keine automatische Gesamtbelegung, keine Iterationszyklen, keine selbstständige Umbesetzung, keine automatische Tauschlogik und keine automatische Erzeugung gekoppelter Gegenposten. Jede Einteilung entsteht ausschließlich durch eine bewusste Benutzereingabe. Bereits vorhandene Einteilungen bleiben Fixpunkte, bis sie ausdrücklich geändert, gelöscht, importiert oder der gesamte Monat nach Bestätigung geleert wird.

Für den angeklickten Tag und die angeklickte Rolle bewertet die Anwendung jede am Datum aktive und grundsätzlich planbare Person. Alle ausgelösten Regeln, Empfehlungen und Kontextinformationen werden als Klartext angezeigt. Die höchste Konfliktstufe bestimmt die Farbe; niedrigere Gründe bleiben erhalten. Rote Konflikte bleiben bewusst übersteuerbar, verlangen jedoch eine ausdrückliche Bestätigung und werden mit Zeitpunkt, Person, Rolle, Datum, Gründen und optionalem Kommentar protokolliert. Graue Kandidaten sind tatsächlich nicht auswählbar.

Diese README ist die vollständige, gegenwartsbezogene Bedienungs-, Fach-, Design-, Daten-, Betriebs- und Entwicklungsreferenz des aktuellen Anwendungsstands. Sie ist **kein Changelog** und beschreibt keine historische Abfolge früherer Versionen.

---

## Inhaltsverzeichnis

1. [Zielbild und Planungsphilosophie](#1-zielbild-und-planungsphilosophie)
2. [Begriffe, Rollen und Bewertungsmodell](#2-begriffe-rollen-und-bewertungsmodell)
3. [Funktionsumfang](#3-funktionsumfang)
4. [Typischer Arbeitsablauf](#4-typischer-arbeitsablauf)
5. [Benutzeroberfläche und Design-Philosophie](#5-benutzeroberfläche-und-design-philosophie)
6. [Monatsnavigation und Tabellenverhalten](#6-monatsnavigation-und-tabellenverhalten)
7. [BD- und HG-Auswahl](#7-bd--und-hg-auswahl)
8. [Farbkodierte Eignungsbewertung](#8-farbkodierte-eignungsbewertung)
9. [Vollständiges fachliches Regelwerk](#9-vollständiges-fachliches-regelwerk)
10. [RBN und zweite RBN](#10-rbn-und-zweite-rbn)
11. [Abwesenheiten, FZA, Dienstwünsche und Optionen](#11-abwesenheiten-fza-dienstwünsche-und-optionen)
12. [Statistik und offene Punkte](#12-statistik-und-offene-punkte)
13. [Feiertage, Werktage und Zeitzonen](#13-feiertage-werktage-und-zeitzonen)
14. [Monatsfarben, Glasoptik, Typografie und Animationen](#14-monatsfarben-glasoptik-typografie-und-animationen)
15. [Datenmodell und Normalisierung](#15-datenmodell-und-normalisierung)
16. [Zustand, Laden, Speichern und Offline-Verhalten](#16-zustand-laden-speichern-und-offline-verhalten)
17. [Cloudflare-Backend und HTTP-API](#17-cloudflare-backend-und-http-api)
18. [Excel-Import](#18-excel-import)
19. [Excel-Export](#19-excel-export)
20. [JSON-Sicherung und Wiederherstellung](#20-json-sicherung-und-wiederherstellung)
21. [Monat vollständig leeren](#21-monat-vollständig-leeren)
22. [Drucken und PDF-Export](#22-drucken-und-pdf-export)
23. [Sicherheit, Datenschutz und Datenintegrität](#23-sicherheit-datenschutz-und-datenintegrität)
24. [Barrierefreiheit, responsive Nutzung und Installation](#24-barrierefreiheit-responsive-nutzung-und-installation)
25. [Technische Architektur und Module](#25-technische-architektur-und-module)
26. [Vollständige Projektstruktur](#26-vollständige-projektstruktur)
27. [Tests, End-to-End-Prüfung und Continuous Integration](#27-tests-end-to-end-prüfung-und-continuous-integration)
28. [Lokale Entwicklung](#28-lokale-entwicklung)
29. [Deployment, Release-Kennung und Cache-Sicherheit](#29-deployment-release-kennung-und-cache-sicherheit)
30. [Betrieb und Fehlerdiagnose](#30-betrieb-und-fehlerdiagnose)
31. [Gezielte Anpassungen](#31-gezielte-anpassungen)
32. [Bewusste Grenzen und unveränderliche Grundsätze](#32-bewusste-grenzen-und-unveränderliche-grundsätze)
33. [Glossar](#33-glossar)

---

# 1. Zielbild und Planungsphilosophie

## 1.1 Assistierte Planung statt automatischer Belegung

Radiologische Dienstplanung lässt sich nicht zuverlässig auf eine einzelne Optimierungszahl reduzieren. Neben formalen Qualifikationen wirken Aktivierungs- und Beförderungsdaten, individuelle Sollwerte, harte Monatsmaxima, Urlaube, Freizeitausgleich, Weiterbildung, Dienstwünsche, verfügbare Optionen, Dienstabstände, Wochenendbelastung, Feiertagsblöcke, personelle Sonderregeln und fachlich definierte Kopplungen zusammen.

DienstplanRAD bildet diese Realität als **Entscheidungsassistenz** ab:

- keine automatische Eintragung von BD, HG, RBN oder zweiter RBN;
- keine automatische Umbesetzung bestehender Dienste;
- keine automatische Tausch- oder Ersatzlogik;
- keine verdeckte Gesamtoptimierung;
- keine automatisch erzeugte Gegenbelegung bei Kopplungsregeln;
- vollständige Klartextbegründung jeder Bewertung;
- ausdrückliche Unterscheidung zwischen Ausschluss, Konflikt, Hinweis, Empfehlung und reinem Kontext;
- bewusste Übersteuerbarkeit roter Konflikte;
- unveränderliches Protokoll bestätigter roter Ausnahmen;
- defensive Behandlung historischer oder importierter Altwerte;
- sofortige lokale Sicherung jeder Änderung;
- zentrale Synchronisierung, soweit die Cloudflare-API erreichbar ist.

## 1.2 Chronologische Tagesliste statt klassischem Monatsraster

Der sichtbare Plan verwendet eine Zeile je Kalendertag. Diese Form ist für den klinischen Dienstplan zweckmäßiger als ein kachelbasiertes Kalenderblatt:

- BD, HG, RBN, zweite RBN, Abwesenheiten und Wünsche liegen in einer Leserichtung;
- jeder Tag besitzt dieselbe feste Spaltenbedeutung;
- Dienstfolgen und Ruheabstände sind vertikal unmittelbar erkennbar;
- Freitag, Samstag und Sonntag bleiben als zusammenhängende Wochenendeinheit lesbar;
- Feiertage können direkt am Wochentag benannt werden;
- bestehende Einteilungen und offene Rollen sind ohne Ansichtswechsel sichtbar;
- Statistik und offene Punkte folgen unmittelbar unter dem Plan;
- der Monatsplan kann kompakt auf eine DIN-A4-Seite ausgegeben werden.

## 1.3 Erklärbarkeit als fachliche Kernanforderung

Eine reine Ampelfarbe wäre für verantwortliche Dienstplanung unzureichend. Deshalb enthält jede Kandidatenkarte alle ausgelösten Gründe. Die höchste fachliche Stufe bestimmt die Farbe, niedrigere Gründe werden nicht verworfen. Eine orange Karte kann daher gleichzeitig einen positiven Dienstwunsch, einen neutralen Jahreskontext, einen Belastungshinweis und einen orangefarbenen Personalkonflikt enthalten.

## 1.4 Trennung von Konfliktstufe, Empfehlung und Kontext

DienstplanRAD trennt drei Informationsarten:

| Informationsart | Technische Wirkung | Beispiel |
|---|---|---|
| **bewertungswirksamer Grund** | kann die sichtbare Stufe erhöhen | Abwesenheit, Qualifikationskonflikt, kurzer Dienstabstand |
| **positive Empfehlung** | erhöht den internen Empfehlungswert, hebt aber keinen Konflikt auf | positiver Dienstwunsch, Monatsausgleich, passende Kopplung |
| **reiner Kontexttext** | verändert weder Stufe noch Empfehlungswert | Jahresverlauf bei sonst gleicher Monatslage |

Positive Gründe können rote, orange oder gelbe Regeln niemals „wegpunkten“. Die sichtbare Stufe entsteht nicht aus einer verrechneten Gesamtsumme.

## 1.5 Fachliche Quellenhierarchie

Für Änderungen gilt folgende fachliche und technische Quellenhierarchie:

1. der tatsächlich ausgelieferte Quellcode;
2. `Eignungsregeln.txt` als kompakter menschlich lesbarer Fachvertrag;
3. Unit-, Regressions- und End-to-End-Tests als ausführbare Invarianten;
4. diese README als vollständige Betriebs- und Anwendungsreferenz.

Widersprechen Dokumentation und Implementierung einander, muss die Dokumentation im selben Änderungsvorgang auf den verifizierten Endstand gebracht werden.

---

# 2. Begriffe, Rollen und Bewertungsmodell

## 2.1 Diensttypen

| Begriff | Bedeutung in DienstplanRAD |
|---|---|
| **BD** | Bereitschaftsdienst; monatlich mit individuellem Sollwert und gegebenenfalls hartem Maximum |
| **HG** | Hintergrunddienst; nur für am konkreten Datum HG-berechtigte Fachärztinnen und Fachärzte |
| **RBN** | erste Rufbereitschaft Neuroradiologie aus einem festen, datumsabhängigen Pool |
| **2. RBN** | zweite Rufbereitschaft Neuroradiologie; nur bei bestimmten Erstbesetzungen sichtbar und erforderlich |
| **FZA** | Freizeitausgleich/Frei; manuell gepflegt oder ausschließlich bei Dr. Becker nach eigenem Samstags-BD fachlich abgeleitet |

## 2.2 Personal- und Rollenbegriffe

| Begriff | Bedeutung |
|---|---|
| **planbar** | `includeInPlanning: true`, am Datum aktiv und grundsätzlich Teil des Dienstpools |
| **aktiv** | Diensttag liegt zwischen `activeFrom` und gegebenenfalls `activeUntil` |
| **tagesgültige Rolle** | Grundrolle unter Berücksichtigung eines möglichen Beförderungsdatums |
| **Facharztberechtigung** | tagesgültige Berechtigung zu HG und Samstags-BD |
| **Assistenzarztstatus** | planbare Person der Kategorie `aa`, die am Datum noch keine HG-Berechtigung besitzt |
| **externer Importwert** | lesbar erhaltener Name ohne zuordenbare Personal-ID; nicht erneut auswählbar |

## 2.3 Bewertungsbegriffe

| Begriff | Bedeutung |
|---|---|
| **Stufe** | `green`, `yellow`, `orange`, `red` oder `gray` |
| **Grund** | sichtbare Klartextbegründung einer Regel, Empfehlung oder Information |
| **Empfehlungswert** | interne Summe positiver Empfehlungen; derzeit keine verdeckte Sortiergrundlage |
| **reiner Hinweis** | Kontexttext ohne Wirkung auf Farbe oder Empfehlungswert |
| **Override** | ausdrücklich bestätigte rote Einteilung mit Protokolleintrag |
| **BD-Soll** | angestrebte monatliche BD-Anzahl einer Person |
| **BD-Maximum** | harte monatliche BD-Obergrenze, sofern definiert |
| **Überhang** | BD oberhalb des individuellen Sollwerts |
| **Wochenend-Äquivalent** | 1,0 für ein Wochenende mit mindestens einem BD, 0,5 für ein Wochenende nur mit HG |
| **erste Verteilungsrunde** | Schwelle, ab der relative Ausgleichsunterschiede gelb statt nur informativ werden |

---

# 3. Funktionsumfang

## 3.1 Monatsplanung

- Navigation über Vormonat, Folgemonat, Monatsauswahl, Jahresauswahl und „Aktueller Monat“;
- genau ein BD-Feld und genau ein HG-Feld je Kalendertag;
- genau ein Feld für erste RBN und ein bedingt sichtbares Feld für zweite RBN je Kalendertag;
- Kandidatenauswahl mit tagesaktueller Live-Regelprüfung;
- Löschen einer bestehenden BD- oder HG-Einteilung im selben Dialog;
- direkte RBN-Auswahl über native Select-Felder;
- Einzelbearbeitung von Abwesenheiten, Dienstwünschen und Optionen je Tag;
- Sammelerfassung beliebiger Tage für eine Person und einen Typ;
- vollständiges Leeren des sichtbaren Monats nach Umfangsanzeige und Bestätigung;
- automatische Speicherung mit Debounce;
- ausdrückliches Neuladen des Serverstands;
- Vorladen benachbarter und historisch benötigter Monate für monatsübergreifende Regeln.

## 3.2 Kontrolle und Transparenz

- fünf klar getrennte Bewertungszustände;
- vollständige Begründungsliste je Kandidat;
- native Tooltips für bestehende Einteilungen;
- explizite Bestätigung roter Konflikte;
- historisches Override-Protokoll;
- Statistik zu BD, HG, Wochenendlast, Soll und Rest;
- priorisierte Liste offener Rollen und bestehender Auffälligkeiten;
- Prüfung historischer RBN-Altwerte und ungültiger Trigger;
- sächsische Feiertage ohne externen Kalenderdienst;
- tagesgenaue Aktivitäts-, Rollen- und Qualifikationsprüfung;
- defensive Anzeige unbekannter importierter Namen und ungültiger Personal-IDs.

## 3.3 Datenaustausch und Ausgabe

- Import von Jahresmappen und einzelnen Monatsplänen aus Excel;
- nichtdestruktiver Excel-Merge mit expliziter Bestätigung von Ersetzungen;
- Excel-Export des sichtbaren Monats;
- vollständige JSON-Sicherung von Einstellungen, Personal und allen verfügbaren Monaten;
- validierte JSON-Wiederherstellung mit serverseitiger Rollback-Strategie;
- druckoptimierte Ein-Seiten-Ausgabe als DIN A4 hochkant;
- definierter PDF-Dateiname `Dienstplan JJJJ-MM`;
- lokale Browser-Ausfallsicherung;
- zentrale Cloudflare-KV-Speicherung;
- Build-Stempel zur eindeutigen Produktionsdiagnose;
- dauerhafte Neutralisierung eines historischen Service Workers.

---

# 4. Typischer Arbeitsablauf

1. Anwendung öffnen und Speicherstatus kontrollieren.
2. Gewünschten Monat über Pfeile oder Select-Felder wählen.
3. Abwesenheiten, FZA, Wünsche und Optionen zunächst einzeln oder gesammelt erfassen.
4. BD- oder HG-Zelle anklicken.
5. Kandidatenkarten in der stabilen fachlichen Personalreihenfolge prüfen.
6. Farbstufe und sämtliche Gründe der gewünschten Person lesen.
7. Grüne, gelbe oder orange Auswahl unmittelbar übernehmen.
8. Bei roter Stufe Gründe kontrollieren, optionalen Kommentar ergänzen und bewusst bestätigen oder abbrechen.
9. Erste RBN auswählen; bei einer freigebenden Erstbesetzung zweite RBN ergänzen.
10. Statistik und „Offene Punkte“ während der Planung wiederholt kontrollieren.
11. Nach Abschluss Excel- oder PDF-Ausgabe erzeugen.
12. Vor größeren Importen oder vor „Monat leeren“ eine JSON-Sicherung erstellen.
13. Bei Verdacht auf veraltete Daten Build-Stempel prüfen und den Serverstand ausdrücklich neu laden.

Jede Änderung rendert den Plan unmittelbar neu. Bestehende BD- und HG-Zellen zeigen bewusst nur den Namen; die vollständige Bewertung bleibt über Tooltip und erneuten Klick verfügbar. Die ruhige Monatsansicht wird damit nicht durch permanente Warnbadges überfrachtet.

---

# 5. Benutzeroberfläche und Design-Philosophie

## 5.1 Wahrnehmbare Ebenen

Die Oberfläche besteht aus fünf funktional getrennten Ebenen:

1. dunkler Ambient-Hintergrund mit langsam driftenden Farborbs;
2. gläserne Kopfleiste mit Marke, Anwendungstitel, Monatsnavigation und Speicherstatus;
3. gläserne Werkzeugleiste für Erfassung, Import, Export, Löschung und Reload;
4. helle Excel-nahe Arbeitsfläche mit Monatskopf, Tabelle, Statistik und offenen Punkten;
5. native modale Dialoge für Kandidatenauswahl, Tagesmetadaten, Sammelerfassung und rote Bestätigung.

Die große Tabellenfläche erhält ihre Tiefe überwiegend durch kontrollierte Tönung, Lichtkanten, Schatten und semitransparente Einfassungen. Eine permanente großflächige Weichzeichnung wird vermieden, um Lesbarkeit und Animationsleistung zu erhalten.

## 5.2 Klinisch geeignete Informationsdichte

Der spezifische Nutzwert entsteht aus einer gezielten Balance zwischen Dichte und Ruhe:

- alle fachlichen Spalten bleiben gleichzeitig vorhanden;
- Bedienhandlungen liegen direkt an der jeweiligen Tageszelle;
- Namen und offene Rollen sind ohne zusätzliche Navigation sichtbar;
- Wochenenden und Feiertage sind flächig, aber nicht aggressiv markiert;
- der Monat erhält eine eigene Farbidentität, ohne weiße Arbeitszellen zu verdrängen;
- der Kandidatendialog bündelt die vollständige Fachbegründung genau im Entscheidungsmoment;
- Statistik und Auffälligkeiten liegen unmittelbar unter dem Plan;
- die Druckansicht entfernt alles, was für den ausgehängten Monatsplan nicht erforderlich ist.

## 5.3 Kopfleiste

Links stehen:

- statisches App-Icon;
- Eyebrow „Klinik für Radiologie und Nuklearmedizin“;
- Titel „DienstplanRAD“;
- Funktionszeile „Manuelle Dienstplanung · Cloud-Synchronisierung · Live-Validierung“.

Rechts stehen:

- Schaltfläche Vormonat;
- Monatsauswahl mit zwölf deutschen Monatsnamen;
- Jahresauswahl;
- Schaltfläche Folgemonat;
- Statuspunkt und Statustext.

Der Statusbereich zeigt unter anderem Laden, Speichern, gespeichert, lokale Änderungen, Offlinebetrieb und Fehlerzustände. Sein Tooltip enthält den Build-Stempel.

## 5.4 Werkzeugleiste

| Bedienelement | Wirkung |
|---|---|
| **Aktueller Monat** | setzt Jahr und Monat auf das lokale aktuelle Datum |
| **Abwesenheiten** | öffnet die Sammelerfassung der Abwesenheitstypen |
| **Dienstwünsche / Optionen** | öffnet die Sammelerfassung positiver, negativer und optionaler Verfügbarkeitsangaben |
| **Monat leeren** | entfernt nach Rückfrage sämtliche operativen Einträge des sichtbaren Monats |
| **Serverstand neu laden** | fordert den sichtbaren Monat ausdrücklich erneut von der Serverquelle an |
| **Excel importieren** | liest `.xlsx` oder `.xls` |
| **Excel exportieren** | erzeugt eine Arbeitsmappe des sichtbaren Monats |
| **PDF exportieren** | öffnet den nativen Druckdialog mit vorbereiteter Ein-Seiten-Druckansicht |
| **JSON sichern** | exportiert den vollständigen erreichbaren Gesamtstand |
| **JSON laden** | validiert und importiert eine vollständige oder partielle Sicherung |

## 5.5 Monatskopf und Legende

Der Arbeitsbereich zeigt:

- Eyebrow „Bereitschaftsdienstplan“;
- vollständigen Monatsnamen mit Jahr;
- das Monatskontrast-Abzeichen;
- Legende für geeignet, Hinweis, Konflikt, nicht wählbar und Bestätigung.

Die Legende erklärt die Bewertungsstufen, ersetzt aber nie die Klartextgründe im Kandidatendialog.

## 5.6 Dialoge

Alle Modale verwenden native `<dialog>`-Elemente. Damit übernimmt die Browserplattform Fokusführung, Escape-Verhalten, Hintergrund-Inertisierung und `::backdrop`. Vorhanden sind:

- Kandidatendialog für BD/HG;
- Tagesdialog für Abwesenheiten, Wünsche und Optionen;
- Sammeldialog für mehrere Tage;
- Bestätigungsdialog für rote Konflikte.

---

# 6. Monatsnavigation und Tabellenverhalten

## 6.1 Gültiger Zeitraum

Monatsdaten werden für Jahre von **2000 bis 2200** akzeptiert. Die Jahresauswahl wird initial um den aktuellen Zeitraum aufgebaut und bei Bedarf um einen gültigen geladenen oder importierten Jahrgang ergänzt.

## 6.2 Navigation und Wettlaufschutz

Monatswechsel verwenden native Datumsarithmetik und berücksichtigen Jahresgrenzen. Die Oberfläche zeigt den Zielmonat sofort, startet den Farb- und Inhaltswechsel und lädt anschließend den Datenstand.

Ein monotoner Anforderungszähler schützt vor verspäteten Antworten. Wird schnell von einem Monat in einen anderen und wieder zurück navigiert, darf eine ältere Serverantwort den zuletzt gewählten Zielmonat nicht überschreiben.

Vor einem Monatswechsel werden ausschließlich tatsächlich als unsynchronisiert markierte Monate gespeichert. Ein nur kurz sichtbarer Zwischenmonat wird niemals allein wegen eines globalen Dirty-Flags als leerer Datenstand übertragen.

## 6.3 Tabellenspalten

| Spalte | Inhalt |
|---|---|
| **Tag** | numerischer Kalendertag |
| **Wochentag** | ausgeschriebener deutscher Wochentag; bei Feiertagen zusätzlich Feiertagsname |
| **BD** | Bereitschaftsdienst, in der Tabelle als Kurzname ohne Anrede und Titel |
| **HG** | Hintergrunddienst, in der Tabelle als Kurzname ohne Anrede und Titel |
| **RBN** | erste neuroradiologische Rufbereitschaft als native Auswahl |
| **2. RBN** | bedingt sichtbare zweite Rufbereitschaft |
| **Urlaub / FZA** | kompakte Abwesenheitszusammenfassung |
| **Kein Dienst / Wünsche / Optionen** | kompakte Zusammenfassung negativer Wünsche, positiver Wünsche und Verfügbarkeitsoptionen |

## 6.4 Layout und Scrollverhalten

- `table-layout: fixed` stabilisiert die Spaltenbreiten.
- Eine Mindestbreite erhält die vollständige Fachstruktur.
- Auf schmalen Bildschirmen wird horizontal gescrollt.
- Keine fachliche Spalte wird für mobile Ansichten entfernt.
- Die Kopfzeile bleibt im Tabellenbereich sticky.
- Tageszeilen besitzen einen Index für den gestaffelten Erstaufbau.
- Samstag, Sonntag und Feiertag erhalten abgestufte Monatsfarbflächen.
- Die Wochentagsspalte bildet den stärksten vertikalen Farbanker.

## 6.5 BD- und HG-Zellen

Eine belegte Zelle zeigt nur den Kurzname. Der vollständige Name und sämtliche aktuellen Bewertungsgründe liegen im nativen Tooltip; ein Klick öffnet den vollständigen Picker.

Eine offene Zelle zeigt einen neutralen Platzhalter und den sichtbaren Status „offen“. Belegte und offene Zellen verwenden denselben Dialog, wodurch Ändern und Erstbelegung denselben fachlichen Ablauf besitzen.

## 6.6 RBN-Zellen

RBN-Felder sind native `<select>`-Elemente. Es gibt keine Freitexteingabe und keine gemeinsame Datalist. Historische Werte außerhalb des aktuellen Fachpools bleiben als deaktivierter Eintrag sichtbar. Die Tabelle zeigt RBN-Namen ohne Anrede und Titel, gespeichert und exportiert wird der vollständige Name.

## 6.7 Abwesenheits- und Wunschzellen

In der Abwesenheitszelle wird ausschließlich der Personenname fett dargestellt; Doppelpunkt, Kürzel und Beschreibung bleiben normal gewichtet. Mehrere Einträge werden kompakt getrennt und dürfen umbrechen.

Optionen und Wünsche können parallel vorhanden sein. Die Zusammenfassungszelle darf mehrzeilig werden, damit keine Information abgeschnitten wird.

---

# 7. BD- und HG-Auswahl

## 7.1 Kandidatenmenge

Der Picker zeigt alle am konkreten Datum aktiven und grundsätzlich planbaren Personen in stabiler Reihenfolge. Die historische Kernreihenfolge lautet:

```text
Lurz → Polednia → Dalitz → Becker → Hellmann → Martin → El Houba → Licenji → Sebastian
```

Zusätzlich konfigurierte valide, aktive und planbare Personen werden anschließend in ihrer stabilen Stammdatenreihenfolge ergänzt.

Eine Person kann im Picker trotz grundsätzlicher Planbarkeit rot erscheinen. Grau wird nur verwendet, wenn sie tatsächlich nicht auswählbar ist, etwa außerhalb des Aktivitätszeitraums oder außerhalb des aktiven Dienstpools.

## 7.2 Inhalt einer Kandidatenkarte

Jede Karte enthält:

- vollständigen Namen;
- sichtbaren Stufenchip;
- alle ausgelösten Gründe als einzelne Textzeilen;
- identische Gründe im nativen Tooltip.

Die Karten bleiben bewusst in fachlicher Personalreihenfolge. Der interne `recommendationScore` sammelt positive Gründe, wird aber nicht für eine verdeckte automatische Umsortierung verwendet.

## 7.3 Auswahlverhalten

- **Grün:** direkt wählbar.
- **Gelb:** direkt wählbar.
- **Orange:** direkt wählbar.
- **Rot:** öffnet den Bestätigungsdialog.
- **Grau:** deaktiviert und nicht auswählbar.
- **Eintrag löschen:** leert die betreffende BD- oder HG-Rolle.
- **Abbrechen:** verändert keine Daten.

## 7.4 Rote Bestätigung

Der Bestätigungsdialog zeigt Person, Rolle, Datum und alle mitgeführten Gründe. Ein optionaler Kommentar kann eine bewusste Abstimmung dokumentieren.

Bei Bestätigung wird in `overrideLog` gespeichert:

- UTC-Zeitpunkt;
- Diensttag;
- Rolle;
- Personal-ID;
- Gründe;
- optionaler Kommentar.

Das spätere Löschen oder Ersetzen des Dienstes entfernt den historischen Protokolleintrag nicht. Das Protokoll dokumentiert die zum damaligen Zeitpunkt bewusst getroffene Entscheidung. Eine eigene sichtbare Override-Protokollansicht existiert derzeit nicht.

---

# 8. Farbkodierte Eignungsbewertung

## 8.1 Stufen und Bedienwirkung

| Stufe | Bedeutung | Bedienung |
|---|---|---|
| **grün** | geeignet oder ausschließlich positiv empfohlen | unmittelbar wählbar |
| **gelb** | weicher Hinweis, Richtwert oder relative Nachrangigkeit | unmittelbar wählbar |
| **orange** | relevanter Konflikt oder deutliche Nachrangigkeit | unmittelbar wählbar |
| **rot** | harter Regelverstoß | nur nach ausdrücklicher Bestätigung |
| **grau** | nicht aktiv, nicht planbar oder technisch nicht auswählbar | deaktiviert |

Die höchste ausgelöste Stufe bestimmt die sichtbare Farbe. Gründe niedrigerer Stufen bleiben erhalten.

## 8.2 Empfehlungspunkte

Positive Wünsche und Fachregeln vergeben interne Empfehlungswerte. Der aktuelle Stand verwendet unter anderem stärkere Werte für explizite Wünsche und Kopplungen sowie moderate Werte für „BD möglich“ beziehungsweise „HG möglich“.

Diese Werte:

- beeinflussen keine Konfliktstufe;
- heben keine Sperre auf;
- werden nicht als verdeckte automatische Gesamtrangliste verwendet;
- bleiben Metadaten für erklärbare positive Gründe und mögliche spätere Erweiterungen.

## 8.3 Selbstkonsistenz

Der gerade bewertete Tag wird aus Monatszählungen ausgeschlossen. Eine bereits vorhandene Einteilung erhält dadurch dieselbe Bewertung wie dieselbe Person unmittelbar vor ihrer Eintragung. Ohne diese Regel würde sich ein Dienst selbst als zusätzlicher Dienst zählen und könnte seine eigene Stufe verändern.

## 8.4 Seiteneffektfreiheit

`evaluateCandidate()` verändert keine Dienste, Abwesenheiten, Wünsche, Optionen, Protokolle oder RBN-Werte. Die Bewertung liest ausschließlich den aktuellen Zustand und liefert Stufe, Gründe, Selektierbarkeit und Metadaten zurück.

---

# 9. Vollständiges fachliches Regelwerk

## 9.1 Aktivität, Dienstpool und Qualifikation

- Personen mit `includeInPlanning: false` sind grau und nicht auswählbar.
- Personen vor `activeFrom` oder nach `activeUntil` sind grau.
- HG ohne tagesgültige HG-Berechtigung ist rot.
- Samstags-BD ohne tagesgültige Samstagsberechtigung ist rot.
- Assistenzärztinnen und Assistenzärzte dürfen BD montags bis freitags sowie sonntags übernehmen, jedoch keinen Samstags-BD und keinen HG.
- Hr. El Houba erhält ab **22.09.2026** die hinterlegten Facharztberechtigungen.
- Fr. Hellmann ist erst ab **01.10.2026** aktiv.
- Eine unbekannte Personal-ID wird niemals automatisch als Assistenzarzt interpretiert.

## 9.2 Tageskollisionen und Sperrwünsche

- dieselbe Person gleichzeitig in BD und HG am selben Tag: rot;
- wirksame Abwesenheit am Diensttag: rot;
- „Kein Dienst“: rot für BD und HG;
- „Kein BD“: rot für BD;
- „Kein HG“: rot für HG.

Positive Wünsche und Optionen bleiben sichtbar, beseitigen aber keinen gleichzeitig bestehenden Konflikt.

## 9.3 Positive Wünsche und Optionen

- „BD bevorzugt“: starke positive Empfehlung für BD;
- „HG bevorzugt“: starke positive Empfehlung für HG;
- „Dienst bevorzugt“: starke positive Empfehlung für beide Rollen;
- „BD möglich“: moderate positive Empfehlung für BD;
- „HG möglich“: moderate positive Empfehlung für HG.

„BD möglich“ und „HG möglich“ sind voneinander unabhängige Optionen und können am selben Tag gleichzeitig gesetzt werden.

## 9.4 Personenspezifische Regeln

- Prof. Schäfer ist vollständig dienstbefreit und ausschließlich in der Abwesenheitsliste geführt.
- Dr. Polednia ist dienstags und sonntags für BD und HG rot markiert.
- Dr. Becker ist für Samstags-BD orange nachrangig.
- Fr. Dalitz als HG an Sonntag oder Montag bei gleichzeitigem Sebastian-BD ist orange nachrangig.
- Dr. Becker ist am ersten regulären Werktag nach eigenem Samstags-BD durch das abgeleitete FZA für BD und HG rot gesperrt.

## 9.5 Becker-FZA als wirksame Abwesenheit

Ausschließlich bei Dr. Becker wird nach eigenem Samstags-BD am nächsten regulären Werktag ein echtes FZA abgeleitet.

Dieses FZA:

- wird in der Monatsansicht dargestellt;
- sperrt BD und HG;
- zählt als vollwertige Abwesenheit;
- entfernt Dr. Becker aus tagesbezogenen Eignungs- und Fairnessvergleichen;
- zählt bei der CT-Leitungsregel wie manuell gepflegtes FZA;
- kann im Muster BD–FZA–BD berücksichtigt werden;
- erzeugt keinen doppelten sichtbaren Eintrag, wenn am selben Tag eine manuelle Abwesenheit gepflegt ist.

Für andere Personen wird kein automatisches FZA erzeugt oder angezeigt.

## 9.6 BD-Abstände

Eigene BD-Termine werden über alle geladenen Monate sortiert und symmetrisch in beide Richtungen geprüft:

- eigener BD am unmittelbar vorhergehenden Kalendertag: rot;
- eigener BD am unmittelbar folgenden Kalendertag: rot;
- Abstand von zwei oder drei Kalendertagen: gelb;
- werktägliches Muster BD–FZA–BD: eigener gelber Klartextgrund;
- das abgeleitete Becker-FZA zählt dabei als FZA.

Die Prüfung ist unabhängig von Eingabereihenfolge, Monatsgrenze und Wochentag.

## 9.7 BD-Soll und hartes Maximum

- Ist das individuelle BD-Soll vor dem betrachteten Tag erreicht, erscheint ein gelber Richtwerthinweis.
- Ist ein definiertes hartes Maximum erreicht, erscheint rot.
- Das harte Maximum unterdrückt den zusätzlichen Sollhinweis nicht fachlich, besitzt aber die höhere Stufe.
- Fr. Hellmann besitzt BD-Soll 2 und hartes Maximum 2.

## 9.8 Bedingter BD-Monatsausgleich

Der relative Monatsausgleich beginnt erst, wenn mindestens eine am Datum aktive und planbare Person mit positivem BD-Soll ihr Soll im laufenden Monat erreicht hat. Diese globale Startbedingung wird nicht dadurch aufgehoben, dass die sollerfüllende Person am konkreten Tag abwesend oder blockiert ist.

Vor der Startschwelle:

- keine positive Monatsausgleichsempfehlung;
- keine gelbe Nachrangigkeit aufgrund unterschiedlicher Sollrückstände;
- alle anderen Regeln bleiben vollständig aktiv.

Nach der Startschwelle:

1. Verglichen werden ausschließlich die am konkreten Tag grundsätzlich geeigneten BD-Personen.
2. Wirksame Abwesenheiten, Sperrwünsche, fehlende Qualifikation, gleiche Person im HG, Polednia-Sondertage und erreichte harte Maxima entfernen eine Person aus der Vergleichsgruppe.
3. Für jede verbleibende Person wird der offene Sollrückstand unter Ausschluss des betrachteten Tages berechnet.
4. Personen mit größtem Rückstand erhalten eine positive Erklärung.
5. Personen mit geringerem Rückstand erhalten einen gelben Hinweis.

## 9.9 Erster BD-Überhang

Der erste zusätzliche BD nach vollständigem Monatsausgleich wird Dr. Lurz bevorzugt zugeordnet, jedoch nur unter allen folgenden Bedingungen:

- alle am konkreten Tag geeigneten Vergleichspersonen haben ihr Soll erreicht;
- keine dieser Personen liegt bereits über dem Soll;
- Dr. Lurz ist am Tag selbst Teil der geeigneten Vergleichsgruppe;
- Dr. Lurz liegt nicht bereits über seinem Soll;
- keine andere geeignete Person besitzt einen positiven BD-Wunsch am konkreten Tag.

Ist Dr. Lurz nicht verfügbar, entsteht keine Nachrangigkeit zugunsten einer nicht auswählbaren Person.

## 9.10 Jahresverlauf als reiner Kontext

Der Jahresverlauf erscheint nur, wenn:

- alle Vormonate des laufenden Jahres tatsächlich geladen sind;
- kein benötigter Vormonat lediglich ein leerer Fallback nach Ladefehler ist;
- mehrere Personen im maßgeblichen aktuellen Monatsvergleich gleichauf liegen.

Gezählt werden BD und HG aller geladenen Monate vom Jahresbeginn bis einschließlich des aktuellen Monats. Folgemonate werden nicht berücksichtigt; der betrachtete Tag wird ausgeschlossen.

Mögliche Texte:

- „Jahresverlauf: niedrigste bisherige Dienstlast (…)“;
- „Jahresverlauf: höhere bisherige Dienstlast (… statt …)“.

Verbindliche Invarianten:

- keine Änderung der Farbstufe;
- keine Änderung des Empfehlungswerts;
- keine gelbe Nachrangigkeit allein aufgrund höherer Jahreslast;
- keine positive Punktgewichtung allein aufgrund niedrigerer Jahreslast;
- kein Eintrag in „Offene Punkte“.

## 9.11 Urlaubsnähe

- BD an einem ansonsten verfügbaren Tag unmittelbar vor dem ersten Urlaubstag: orange.
- Besteht am bewerteten Tag selbst bereits eine Abwesenheit, wird ausschließlich diese tagesbezogene Abwesenheit gemeldet; die zusätzliche Urlaubsbeginnwarnung entfällt.
- Donnerstags-BD vor Urlaub in der folgenden Kalenderwoche: positive Empfehlung als möglicher Urlaubsverlängerer.
- Die Prüfung kann monatsübergreifend arbeiten, sofern der Folgemonat geladen ist.

## 9.12 HG-Ausgleich

Für HG wird die kombinierte Monatslast aus BD und HG innerhalb der am konkreten Tag geeigneten Facharztgruppe verglichen.

- geringste kombinierte Last: positive Empfehlung ab der ersten Einteilung;
- höhere Last vor Abschluss der ersten Verteilungsrunde: neutraler Klartext;
- höhere Last nach Abschluss der ersten Verteilungsrunde: gelb.

Die erste Runde gilt als abgeschlossen, wenn die Summe der bereits eingetragenen BD und HG mindestens einem Dienst je aktuell geeigneter Person entspricht. Eine BD-Soll-Startschwelle existiert für HG nicht.

## 9.13 HG bei Assistenzarzt-BD

Steht am Tag ein BD durch eine tagesgültig nicht fachärztliche Person, wird zusätzlich die Zahl bisheriger HG für Assistenzarzt-BD verglichen:

- geringste Zahl: positive Empfehlung;
- höhere Zahl vor vollständiger erster AA-HG-Verteilungsrunde: neutraler Klartext;
- höhere Zahl danach: gelb.

## 9.14 HG-Häufung

- erneuter eigener HG innerhalb von drei Kalendertagen davor oder danach: gelb;
- dritter eigener HG in einer Dreierkette aufeinanderfolgender Tage: orange;
- Prüfung in beide Zeitrichtungen;
- HG am Tag vor eigenem BD: grundsätzlich orange;
- spiegelbildlich BD nach eigenem HG am Vortag: grundsätzlich orange.

Ausnahmen der Nachbarschaftswarnung:

- zulässige Kopplung Freitag-HG auf Samstags-BD;
- am HG-Tag eingeteilter BD wird bereits durch eine fachärztliche Person geleistet.

## 9.15 Kopplungsregeln

Die Kopplungen werden nur geprüft; die Anwendung trägt keinen Gegenposten automatisch ein.

### Assistenzarzt-Freitags-BD

Bei Assistenzarzt-BD am Freitag müssen Freitag-HG und Samstags-BD durch dieselbe Person besetzt sein.

### Fachärztlicher Samstags-BD

Bei fachärztlichem Samstags-BD muss dieselbe Person den Sonntag-HG übernehmen.

### Assistenzarzt-BD am Feiertagsvortag

Bei Assistenzarzt-BD am Tag vor einem gesetzlichen Feiertag müssen Vortags-HG und Feiertags-BD identisch besetzt sein.

Alle Kopplungen werden in beiden Eingabereihenfolgen geprüft. Eine passende Auswahl erhält eine positive Kopplungsbegründung; eine widersprechende konkrete Auswahl ist rot.

## 9.16 Wochenendnachbarschaft

Ein Wochenende umfasst Freitag, Samstag und Sonntag und wird über den zugehörigen Freitag gruppiert.

- BD an direkt benachbarten Wochenenden: rot;
- sonstiger Dienst an direkt benachbarten Wochenenden: orange.

Die Prüfung betrachtet vorheriges und folgendes Wochenende.

## 9.17 Relative Wochenendlast

Je Person wird berechnet:

- Wochenende mit mindestens einem BD: 1,0;
- Wochenende ohne BD, aber mit mindestens einem HG: 0,5;
- kein Wochenenddienst: 0.

Bewertung:

- geringste aktuelle Belastung: positive Erklärung ab der ersten Einteilung;
- höhere relative Belastung vor Abschluss der ersten Runde: neutraler Klartext;
- höhere relative Belastung nach aufsummiert 0,5 Wochenend-Äquivalenten je aktuell geeigneter Person: gelb;
- projizierte Überschreitung des Ziels 1,0: zusätzlicher gelber Hinweis unabhängig von der Rundenlogik.

## 9.18 Samstagsrotation

Ein weiterer Samstags-BD derselben Person im selben Monat ist orange nachrangig. Die Rotation soll andere geeignete Fachärztinnen und Fachärzte bevorzugen.

## 9.19 Oster- und Pfingstalternanz

- Osterblock: Karfreitag bis Ostermontag;
- Pfingstblock: Pfingstsamstag bis Pfingstmontag.

Wer im jeweils anderen Block bereits BD oder HG besitzt, erhält im betrachteten Block einen orangefarbenen Alternanzhinweis.

## 9.20 CT-Leitungsbesetzung

Sind Dr. Becker und Dr. Martin an demselben regulären Werktag gleichzeitig durch Urlaub oder FZA abwesend, entsteht genau ein roter Sammelhinweis „CT-Leitungsbesetzung prüfen“.

Dabei gilt:

- manuelles FZA zählt;
- abgeleitetes Becker-FZA zählt;
- Urlaub zählt;
- Weiterbildung allein zählt nicht;
- sonstige Abwesenheit allein zählt nicht.

---

# 10. RBN und zweite RBN

## 10.1 Erste RBN

Regulärer Pool:

- Prof. Schob;
- Dr. Bailis;
- Dr. Maybaum;
- Dr. Schüngel;
- Fr. Dalitz;
- Dr. Martin;
- Hr. El Houba.

Ab **01.10.2026** kommt Fr. Hellmann hinzu.

## 10.2 Zweite RBN

Der zweite Pool ist dauerhaft begrenzt auf:

- Prof. Schob;
- Dr. Bailis;
- Dr. Maybaum.

Eine zweite RBN wird nur freigeschaltet, wenn die erste RBN am selben Tag besetzt ist durch:

- Dr. Schüngel;
- Fr. Hellmann ab ihrem gültigen Startdatum;
- Dr. Martin;
- Hr. El Houba.

## 10.3 Wechsel der Erstbesetzung

Wird eine freigebende Erstbesetzung bewusst durch eine nicht freigebende Person oder einen Leerwert ersetzt, wird eine vorhandene zweite RBN entfernt und der Monat als geändert markiert.

Beim bloßen Laden historischer inkonsistenter Daten findet keine stille Löschung statt. Der Altwert bleibt sichtbar und wird in „Offene Punkte“ erläutert.

## 10.4 Altwerte und Validierung

Die Sammelprüfung meldet:

- erste RBN außerhalb des tagesgültigen Pools: orange;
- zweite RBN außerhalb des festen zweiten Pools: orange;
- zweite RBN ohne gültigen Trigger: orange;
- gültiger Trigger ohne zweite RBN: gelb.

## 10.5 Legacy-Feld `rbnNames`

`state.rbnNames` und `/api/rbn-names` bleiben aus Kompatibilitätsgründen in Bootstrapdaten und Sicherungen erhalten. Die aktuelle UI verwendet diese Liste nicht als Auswahlquelle. Maßgeblich sind ausschließlich die festen Regeln in `js/rbn.js`.

---

# 11. Abwesenheiten, FZA, Dienstwünsche und Optionen

## 11.1 Abwesenheitstypen

| ID | Anzeige | Kurzform |
|---|---|---|
| `urlaub` | Urlaub | U |
| `fza` | FZA/Frei | FZA |
| `weiterbildung` | Weiterbildung | WB |
| `sonstige` | Sonstige Abwesenheit | abwesend |

Jede wirksame Abwesenheit erzeugt bei BD oder HG am selben Tag einen roten Konflikt.

## 11.2 Dienstwünsche

| ID | Anzeige | Wirkung |
|---|---|---|
| `kein-bd` | Kein BD | rot bei BD |
| `kein-hg` | Kein HG | rot bei HG |
| `kein-dienst` | Kein Dienst | rot bei BD und HG |
| `bd-bevorzugt` | BD bevorzugt | starke positive Empfehlung bei BD |
| `hg-bevorzugt` | HG bevorzugt | starke positive Empfehlung bei HG |
| `dienst-bevorzugt` | Dienst bevorzugt | starke positive Empfehlung bei BD und HG |

Pro Person und Tag existiert höchstens ein Dienstwunschwert.

## 11.3 Optionen

| ID | Anzeige | Wirkung |
|---|---|---|
| `bd-moeglich` | BD möglich | moderate positive Empfehlung bei BD |
| `hg-moeglich` | HG möglich | moderate positive Empfehlung bei HG |

Optionen liegen in einem eigenen Datenfeld und können beliebig kombiniert werden. Sie überschreiben keinen Wunsch und werden von einem Wunsch nicht automatisch entfernt.

## 11.4 Einzelbearbeitung

Ein Klick auf die Abwesenheits- oder Wunschzelle öffnet den Tagesdialog. Für jede in der Abwesenheitsliste geführte Person können Abwesenheit, Wunsch und Optionen getrennt gesetzt oder entfernt werden.

## 11.5 Sammelerfassung

Die Sammelerfassung kombiniert:

- Personenauswahl;
- Typauswahl;
- Monatsraster mit einzeln anwählbaren Tagen;
- sichtbare Wochenend- und Feiertagsmarkierung;
- Anzeige bereits vorhandener Werte;
- Zurücksetzen der aktuellen Tagesauswahl;
- gemeinsame Übernahme aller markierten Tage.

## 11.6 Herkunft von Abwesenheiten

`absenceSources` unterscheidet insbesondere:

- `manual` für direkte Benutzereingaben;
- `import` für Excel-Importe.

Die Herkunft dient der defensiven Behandlung importierter FZA-Werte. Manuelle Angaben haben Vorrang vor rein ableitbaren oder importierten Darstellungen.

---

# 12. Statistik und offene Punkte

## 12.1 Statistik

Für jede im Monat aktive planbare Person werden angezeigt:

- Name;
- tagesbezogen abgeleitete Rollenbezeichnung;
- Anzahl BD;
- Anzahl HG;
- Wochenend-Äquivalent;
- individuelles BD-Soll;
- Rest bis zum Soll oder negativer Überhang.

RBN wird bewusst nicht in diese Verteilungsstatistik eingerechnet.

Eine zusätzliche Summenzeile zeigt die offenen BD- und HG-Felder.

## 12.2 Sammelprüfung

`collectIssues()` sammelt:

- jeden Tag ohne BD;
- jeden Tag ohne HG;
- jede bestehende orange oder rote BD-/HG-Einteilung;
- grau gewordene beziehungsweise nicht mehr zulässige historische Besetzungen als roten Datenhinweis;
- unbekannte Personal-IDs als roten Datenintegritätsfehler;
- externe Importnamen als gelben, nicht bewertbaren Hinweis;
- RBN-Altwerte;
- zweite RBN außerhalb des Pools;
- zweite RBN ohne gültigen Trigger;
- fehlende zweite RBN bei gültigem Trigger;
- Becker/Martin-Doppelabwesenheit an regulären Werktagen.

## 12.3 Priorisierung

Die Liste wird nach Stufenschwere sortiert. Rote und orange Auffälligkeiten stehen vor gelben offenen Rollen. Die sichtbare Darstellung ist auf 40 Einträge begrenzt und nennt die Zahl weiterer Punkte. Ist nichts offen, erscheint eine ausdrückliche Erfolgsmeldung.

Gelbe relative Fairnesshinweise und der neutrale Jahresverlauf werden nicht als harte Auffälligkeit priorisiert.

---

# 13. Feiertage, Werktage und Zeitzonen

## 13.1 Gesetzliche Feiertage in Sachsen

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

Es gibt keinen externen Feiertagsdienst und keine frei auswählbare Region. Sachsen ist fachlich fest.

## 13.2 Regulärer Werktag

Ein regulärer Werktag ist Montag bis Freitag und kein gesetzlicher Feiertag. Diese Definition steuert insbesondere:

- das abgeleitete Becker-FZA;
- die Becker-Sperre nach Samstags-BD;
- die CT-Leitungsprüfung.

## 13.3 Lokale Tagesarithmetik

Kalendertage werden als lokale Mitternacht interpretiert. ISO-Tagesstrings entstehen aus lokalen Jahr-, Monats- und Tageswerten. Ein Rückweg über `toISOString()` wird vermieden, da deutsche lokale Mitternacht in UTC auf den vorherigen Kalendertag fallen kann.

Diese Entscheidung schützt:

- Feiertagszuordnung;
- Wochentagslogik;
- Monatsgrenzen;
- Dienstabstände;
- Excel-Datumszuordnung;
- Sommer-/Winterzeitwechsel.

---

# 14. Monatsfarben, Glasoptik, Typografie und Animationen

## 14.1 KSG- und App-Designtoken

Das Stylesheet trennt verbindliche KSG-Markentoken von App-spezifischen UI-Token.

Wesentliche Grundlagen:

- KSG-Rot `#E3000B` als zurückhaltender Marken- und Statusakzent;
- dunklere Rot-Textvariante `#B80009` für ausreichenden Kontrast;
- KSG-Grau `#555553`;
- Arial-basierte Bildschirmschrift;
- tabellarische Ziffern für exakt fluchtende Tages- und Statistikspalten;
- große und kleine Radiusstufen;
- definierte Schattenebenen;
- sichtbarer Fokus mit 2 px Ring und 2 px Offset;
- feste Weißraumleiter für innere und äußere Abstände.

## 14.2 Zwölf Monatsidentitäten

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
| Dezember | Tannengrün und Rubin |

Jede Palette definiert Grundakzent, starken Akzent, Glow, Paneltönung und kontrastgeprüften Schriftton.

## 14.3 Tabellenmischungen

Die Monatsfarbe wird mit Weiß gemischt:

- Wochentagsspalte: 46 Prozent Monatsfarbe;
- Samstag: 14 Prozent;
- Sonntag: 22 Prozent;
- Feiertag: 30 Prozent.

Die Flächen bleiben dadurch eindeutig, ohne die Lesbarkeit der Einträge zu beeinträchtigen.

## 14.4 Glasoptik

Die Oberfläche verwendet Glas nicht als maximale Transparenz, sondern als kontrollierte Materialwirkung:

- helle Kanten;
- monatlich getönte Ränder;
- semitransparente Flächen;
- gezielte Schatten;
- deckend weiße Eingabefelder dort, wo Lesbarkeit Vorrang besitzt;
- keine permanente Weichzeichnung der vollständigen Tabelle.

## 14.5 Farbinterpolation

`theme.js` interpoliert Monatsfarben zeitbasiert mit `requestAnimationFrame` und `performance.now()` in einem wahrnehmungsnäheren Farbraum. Die Anwendung schreibt konkrete RGB-/RGBA-Werte als CSS-Variablen.

Vorteile:

- reproduzierbare Dauer;
- korrektes Überspringen blockierter Frames;
- keine grauen Zwischenzustände bei Farbtonwechseln;
- konsistente abgeleitete Flächen in verschiedenen Browserengines;
- keine konkurrierende CSS-Transition auf denselben Custom Properties.

Die Farbwäsche dauert 720 ms. Die Inhaltsbewegung ist kürzer, damit der neue Plan früh lesbar ist, während die Farbidentität ruhig nachzieht.

## 14.6 Monatswechsel

- nächster Monat gleitet von rechts ein;
- vorheriger Monat gleitet von links ein;
- Bewegung erfolgt über `transform` und `opacity`;
- ein kleiner Sättigungspuls liegt nur auf dem Monatsbadge;
- die komplette Tabelle wird nicht mit einem animierten Filter belastet;
- beim Erststart können Zeilen gestaffelt erscheinen;
- während eines Monatswechsels wird die Zeilenstaffelung deaktiviert, um kein leeres Zwischenfenster zu erzeugen.

## 14.7 Reduzierte Bewegung und Transparenz

- `prefers-reduced-motion` deaktiviert nicht notwendige Bewegungen;
- `prefers-reduced-transparency` ersetzt Milchglas durch deckende Flächen und entfernt Ambient-Orbs;
- Funktion, Farbhierarchie und Information bleiben vollständig erhalten.

## 14.8 Icons

- `icons/icon.svg` ist das statische App-, Favicon- und Manifest-Icon;
- `icons/icon-animated.svg` ist eine separate animierte Designvariante;
- die produktive Manifest- und Favicon-Einbindung verwendet bewusst die statische Variante;
- das Icon enthält keine Schrift und greift Glas-, Spektrum- und Tabellencharakter der Anwendung auf.

---

# 15. Datenmodell und Normalisierung

## 15.1 Monatsschema

```jsonc
{
  "schemaVersion": 1,
  "year": 2026,
  "month": 8,
  "revision": 12,
  "updatedAt": "2026-08-01T12:00:00.000Z",
  "days": {
    "2026-08-01": {
      "bd": "lurz",
      "hg": "dalitz",
      "rbn1": "Dr. Martin",
      "rbn2": "Prof. Schob",
      "notes": ""
    }
  },
  "absences": {
    "becker": { "2026-08-03": "fza" }
  },
  "absenceSources": {
    "becker": { "2026-08-03": "manual" }
  },
  "preferences": {
    "martin": { "2026-08-07": "kein-bd" }
  },
  "options": {
    "martin": { "2026-08-08": "bd-moeglich,hg-moeglich" }
  },
  "overrideLog": [],
  "importLog": []
}
```

## 15.2 Feldbedeutung

- `schemaVersion`: Version des Monatsschemas;
- `year`, `month`: selbstbeschreibende Zielzuordnung;
- `revision`: steigt bei jeder Persistierung;
- `updatedAt`: Zeitpunkt der letzten Persistierung;
- `days[iso].bd`: Personal-ID, externer Importwert oder leer;
- `days[iso].hg`: Personal-ID, externer Importwert oder leer;
- `days[iso].rbn1`: vollständiger erster RBN-Name oder Altwert;
- `days[iso].rbn2`: vollständiger zweiter RBN-Name oder Altwert;
- `days[iso].notes`: reserviertes Tagesnotizfeld ohne aktuelle UI;
- `absences`: Abwesenheitstyp je Person und Tag;
- `absenceSources`: Herkunft der Abwesenheit;
- `preferences`: genau ein Wunschwert je Person und Tag;
- `options`: kommaseparierte Menge bekannter Options-IDs je Person und Tag;
- `overrideLog`: historisch anwachsende bestätigte rote Ausnahmen;
- `importLog`: reservierte strukturierte Importhistorie.

## 15.3 Einstellungen

`DEFAULT_SETTINGS` verwendet derzeit:

```json
{ "schemaVersion": 2 }
```

Die Region Sachsen ist keine frei konfigurierbare Einstellung, sondern fachlich fest in der Datumslogik verankert.

## 15.4 Standardpersonal

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

## 15.5 Externe Dienstwerte

Unbekannte importierte Namen werden als `extern:<Name>` gespeichert.

Eigenschaften:

- bleiben lesbar;
- werden in Tabelle und Druck ohne Anrede und Titel angezeigt;
- bleiben im Tooltip und Excel-Export vollständig;
- sind nicht erneut auswählbar;
- werden gelb als nicht bewertbarer Importwert gemeldet;
- können durch Klick und Auswahl einer hinterlegten Person ersetzt werden.

Eine unbekannte rohe Personal-ID ohne `extern:` ist dagegen ein roter Datenintegritätsfehler.

## 15.6 Tiefennormalisierung

Monate werden bei Serverlesen, lokalem Laden, Import und Export auf dasselbe Schema normalisiert.

Die Normalisierung:

- ergänzt alle erwarteten Kalendertage;
- ergänzt fehlende Tagesfelder;
- setzt ungültige Tagesfeldtypen auf sichere Leerwerte;
- verwirft monatsfremde Datumsangaben;
- leitet `year` und `month` aus dem Zielschlüssel ab;
- übernimmt Abwesenheiten, Wünsche und Optionen nur für gültige Tage;
- normalisiert Optionen auf bekannte IDs und entfernt Duplikate;
- migriert ältere Optionswerte aus `preferences` in `options`;
- akzeptiert Protokollcontainer nur als Arrays von Objekten;
- bewahrt unbekannte Zusatzfelder auf der Monatswurzel;
- verwirft unbekannte Zusatzfelder innerhalb einzelner Tagesobjekte.

## 15.7 Strikte Importvalidierung

Strikte Pfade lehnen unter anderem ab:

- falsche Grundtypen;
- leere Pflichtfelder;
- ungültige Personal-IDs;
- doppelte Personal-IDs;
- ungültige ISO-Daten;
- Aktivitätsende vor Aktivitätsbeginn;
- negative Soll- oder Maximalwerte;
- ungültige Monatsschlüssel;
- doppelte Monatsschlüssel;
- Jahre außerhalb 2000–2200.

---

# 16. Zustand, Laden, Speichern und Offline-Verhalten

## 16.1 Laufzeitzustand

`state` hält:

- Einstellungen;
- Personalstammdaten;
- Legacy-RBN-Namen;
- geladene Monate in einer `Map`;
- Herkunft jedes Monatsstands;
- sichtbares Jahr und Monat;
- globalen und monatsbezogenen Dirty-Status;
- monotonen Änderungszähler;
- Debounce-Timer;
- Serverbereitschaft;
- aktuelle Dialog- und Sammelmodi;
- Bootstrap-Cache.

## 16.2 Lokale Schlüssel

| Inhalt | Schlüssel |
|---|---|
| Bootstrapdaten | `dienstplanrad:bootstrap` |
| Monatsdaten | `dienstplanrad:month:YYYY-MM` |
| einmalige Legacy-Neustartsperre | `dienstplanrad:legacy-reload` in `sessionStorage` |

Zusätzlich setzt das Dokument den Diagnosemarker `data-asset-cleanup="dienstplanrad:legacy-cleanup"` am Root-Element.

## 16.3 Startablauf

1. Build-Stempel in DOM und Statustooltip übernehmen.
2. frühe Legacy-Service-Worker-Bereinigung abwarten;
3. Bootstrapdaten laden;
4. Monatsfarbe initial ohne Animation setzen;
5. aktuelle Monats- und Jahresauswahl herstellen;
6. aktuellen Monat ausdrücklich vom Server laden;
7. benachbarte Monate vorwärmen;
8. bisherige Monate des Jahres laden, soweit für Jahreskontext erforderlich;
9. bei Serverfehler auf lokalen Stand zurückfallen;
10. bei vollständig fehlenden Daten einen normierten leeren Monat erzeugen.

## 16.4 Monatshistorie und Quellenstatus

Ein Monat kann stammen aus:

- bestätigtem Serverstand;
- ausdrücklich unsynchronisiertem lokalen Arbeitsstand;
- lokalem Cache;
- leerem Fallback nach Ladefehler.

Ein Fallback gilt nicht als vollständige Historie und darf den Jahresverlauf nicht freischalten.

## 16.5 Änderungsmarkierung

Jede echte Änderung:

- markiert exakt den betroffenen Monat als dirty;
- schreibt unmittelbar einen normalisierten lokalen Snapshot;
- startet einen Debounce von 1.100 ms;
- aktualisiert Darstellung und Status.

## 16.6 Persistierung

Beim Speichern:

- wird ein unveränderlicher Snapshot erstellt;
- steigt `revision`;
- wird `updatedAt` gesetzt;
- wird zuerst lokal gespeichert;
- folgt der Server-PUT;
- wird der Dirty-Status nur gelöscht, wenn seit Start des Requests keine neuere Änderung entstanden ist.

Saves desselben Monats werden serialisiert. Eine ältere Serverantwort kann weder einen neueren Datenstand zurücküberschreiben noch eine spätere Änderung fälschlich als gespeichert markieren.

## 16.7 Browserende

Bei `beforeunload` versucht die Anwendung, noch schmutzige Monate zu persistieren. Die lokale Sicherung bleibt unabhängig davon die erste Verlustbegrenzung.

## 16.8 Bedeutung des Offline-Status

„Offline – lokaler Stand“ oder „nur lokal gespeichert“ bedeutet:

- Daten liegen im `localStorage` dieses Browsers;
- zentrale Bestätigung fehlt;
- andere Browser oder Geräte sehen den Stand nicht;
- Löschen der Browserdaten kann ihn entfernen;
- ein vollständig frischer Start ohne Netz ist nicht garantiert.

DienstplanRAD besitzt keinen aktiven Service Worker und ist daher keine vollständige Offline-PWA. Die lokale Sicherung schützt eine bereits geladene Arbeitssitzung, nicht die komplette App-Shell.

---

# 17. Cloudflare-Backend und HTTP-API

## 17.1 Architektur

Das Backend besteht aus Cloudflare Pages Functions und einem Cloudflare-KV-Binding mit dem exakten Namen:

```text
DIENSTPLAN_KV
```

Es gibt keinen separaten Serverprozess und keine relationale Datenbank.

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
| GET | `/api/month/:year/:month` | normierten Monat lesen |
| PUT | `/api/month/:year/:month` | normierten Monat schreiben |
| GET/PUT | `/api/settings` | Einstellungen lesen oder ersetzen |
| GET/PUT | `/api/staff` | Personal lesen oder ersetzen |
| GET/PUT | `/api/rbn-names` | Legacy-RBN-Liste lesen oder ersetzen |
| GET | `/api/export` | vollständigen Serverstand exportieren |
| POST | `/api/import` | validierten Gesamt- oder Teilstand importieren |
| GET | `/sw.js` | neutralisierenden historischen Service-Worker-Grabstein ausliefern |

## 17.4 API-Antworten

- JSON mit UTF-8;
- `Cache-Control: no-store`;
- klare Fehlerantwort bei fehlendem KV-Binding;
- keine stille In-Memory-Ersatzpersistenz;
- gemeinsame Normalisierung mit dem Frontend.

## 17.5 Serverexport

Der Export listet alle KV-Schlüssel mit Präfix `year:` paginiert auf, filtert ausschließlich valide Monatsschlüssel und besitzt kein fest codiertes Endjahr. Jeder gelesene Monat wird vor der Ausgabe erneut normiert.

## 17.6 Serverimport und Rollback

Der Serverimport:

1. parst und validiert die vollständige Nutzlast strikt;
2. erzeugt die vollständige Schreibmenge;
3. liest vor dem ersten Schreibzugriff die bisherigen Rohwerte aller Zielschlüssel;
4. schreibt die Zielwerte sequenziell;
5. setzt bei einem späteren Fehler bereits geschriebene Schlüssel in umgekehrter Reihenfolge zurück;
6. meldet ausdrücklich, ob die Rücksetzung vollständig oder unvollständig war.

Ein spät erkannter Fehler darf dadurch keinen unbemerkten Teilimport hinterlassen.

---

# 18. Excel-Import

## 18.1 Laufzeitabhängigkeit

Excel-Funktionen verwenden SheetJS `0.20.3` aus dem CDN `cdn.sheetjs.com`. Das Skript wird mit `defer`, derzeit aber weder lokal vendort noch mit Subresource-Integrity-Attribut geladen.

Fällt die Bibliothek aus:

- Kernplanung bleibt funktionsfähig;
- JSON-Sicherung bleibt funktionsfähig;
- Druck/PDF bleibt funktionsfähig;
- Excel-Import und -Export melden einen Fehler.

## 18.2 Merge-Sicherheit

Vor dem Merge wird jeder erkannte Zielmonat geladen. Akzeptiert wird nur:

- ein bestätigter aktueller Serverstand oder
- ein ausdrücklich unsynchronisierter lokaler Arbeitsstand.

Ein lediglich gecachter oder leerer Fallback-Monat nach fehlgeschlagenem Serverabruf ist nicht merge-sicher. Der Import bricht sichtbar ab, statt möglicherweise unbekannte manuelle Serverwerte zu überschreiben.

## 18.3 Unterstütztes Format A: Jahresmappe

Erwartet werden Monatsblätter `Jan` bis `Dez`. Für März werden zusätzlich `Mär`, `März` und entsprechende ASCII-Varianten erkannt.

Erkennung:

- Tageskopf ab dritter Spalte;
- mindestens 15 Tageswerte zwischen 1 und 31;
- Tageswerte können Zahl, Zahl mit Punkt oder Datumswert sein;
- Personalzeile: Name in erster Spalte, `Arbeitsplatz` in zweiter Spalte;
- unmittelbar folgende Zeile mit `Dienst/Hintergrund` gilt als Dienstzeile.

Dienstcodes:

- `D` → BD;
- `HG` → HG.

Abwesenheitscodes:

- `U` → Urlaub;
- `F`, `FZA`, `Frei` → FZA;
- `WB`, `FB` → Weiterbildung;
- `K`, `KK`, `ZU`, `§15C`, `DR` → sonstige Abwesenheit.

## 18.4 Unterstütztes Format B: einzelner Monatsplan

Erkannt wird ein Blatt mit Kopfzeile, die mindestens `BD` und `HG` enthält. Zusätzlich werden `Tag`, `RBN` beziehungsweise `1. RBN` und `2. RBN` ausgewertet.

Monat und Jahr können stammen aus:

- echtem Excel-Datum;
- Excel-Seriennummer;
- `TT.MM.JJJJ`;
- ISO-Datum;
- ausgeschriebenem Monatsnamen mit Jahr.

Der Blattname ist für dieses Format nicht maßgeblich. Tageszeilen beginnen mit einer gültigen Tageszahl und enthalten mindestens einen relevanten Wert; nachgelagerte Statistikblöcke werden dadurch nicht als Tage interpretiert.

## 18.5 Fehlende Jahresangabe

Fehlt in einem erkannten Blatt jede Jahresangabe, muss die Zuordnung zum aktuell ausgewählten Jahr ausdrücklich bestätigt werden. Nicht auswertbare Blätter werden übersprungen und in der Abschlussmeldung genannt.

## 18.6 Namensauflösung

Namen werden gegen folgende Formen geprüft:

- Personal-ID;
- vollständiger Name;
- Kurzname;
- Name ohne Anrede und Titel.

Beispiele:

- `Dr. Lurz` und `Lurz`;
- `Hr. El Houba` und `El Houba`.

## 18.7 Unbekannte Namen

Ein unbekannter Dienstname geht nicht verloren. Er wird als externer Importwert gespeichert und bleibt sichtbar.

Abwesenheiten können dagegen nur einer bekannten Personal-ID zugeordnet werden. Eine Abwesenheit zu einem unbekannten Namen wird nicht gespeichert und in der Importzusammenfassung gemeldet.

## 18.8 RBN beim Import

Importierte RBN-Namen werden auf den am jeweiligen Datum gültigen Pool abgebildet. Beispielsweise kann `Schüngel` zu `Dr. Schüngel` normalisiert werden. Nicht zuordenbare Werte bleiben als Altwerte sichtbar und werden durch die Sammelprüfung gemeldet.

## 18.9 Ersetzungslogik

Der Import folgt dem Grundsatz:

> **Ein vorhandener nichtleerer Importwert darf einen abweichenden bestehenden Wert ersetzen; ein leeres Importfeld löscht niemals einen bestehenden Wert.**

Dies gilt für:

- BD;
- HG;
- erste RBN;
- zweite RBN;
- Abwesenheiten.

Vor einer Ersetzung wird der Umfang benannt und ausdrücklich bestätigt. Dienstwünsche und Optionen werden nicht aus Excel importiert.

## 18.10 Abschlussmeldung

Je Blatt beziehungsweise Zielmonat werden ausgewiesen:

- gelesene Werte;
- neu ergänzte Werte;
- ersetzte Werte;
- unveränderte Werte;
- unbekannte Namen;
- übersprungene Abwesenheiten;
- nicht auswertbare Blätter;
- nur lokal gespeicherte Zielmonate.

---

# 19. Excel-Export

Der sichtbare Monat wird als neue Arbeitsmappe exportiert.

## 19.1 Inhalt

Kopfzeilen:

- Bereitschaftsdienstplan;
- Monatsbezeichnung;
- Tag;
- Wochentag;
- BD;
- HG;
- 1. RBN;
- 2. RBN.

Unter den Tageszeilen folgt eine kompakte Statistik mit Name, BD, HG, Wochenend-Äquivalent und Zielwert.

## 19.2 Darstellung

- bekannte Personen werden vollständig exportiert;
- externe Importnamen werden vollständig exportiert;
- Blattname: `YYYY-MM`;
- Dateiname: `dienstplan_YYYY_MM.xlsx`;
- definierte Spaltenbreiten verbessern die unmittelbare Lesbarkeit.

Der Excel-Export ist eine Momentaufnahme des sichtbaren Monats und keine vollständige Systemsicherung.

---

# 20. JSON-Sicherung und Wiederherstellung

## 20.1 JSON als verlustarmes Sicherungsformat

JSON erfasst:

- Einstellungen;
- Personalstammdaten;
- Legacy-RBN-Liste;
- alle verfügbaren Monate;
- Dienste und RBN;
- Abwesenheiten und Herkunft;
- Wünsche und Optionen;
- Override- und Importprotokolle;
- reservierte und kompatible Felder.

## 20.2 Erzeugung einer Sicherung

Ist der Server erreichbar, bildet der Serverexport die Basis. Lokale Daten überschreiben diesen Stand nur, wenn sie nachweislich unsynchronisiert sind.

Priorität:

1. aktueller Serverexport;
2. ausdrücklich dirty markierte lokale Monate;
3. ausdrücklich unsynchronisierte lokale Bootstrapdaten.

Ein rein lokal gecachter, aber unveränderter Altstand ersetzt keinen frisch exportierten Serverstand.

Im Offlinefall werden alle auffindbaren gültigen lokalen Monatsschlüssel einbezogen, nicht nur aktuell im Arbeitsspeicher geöffnete Monate.

## 20.3 Lokale Importvalidierung

Vor der ersten Zustandsänderung wird die Datei vollständig geparst und geprüft:

- `settings` muss ein Objekt sein;
- `staff` muss ein Array sein;
- `rbnNames` muss ein Array sein;
- jeder Monat muss ein gültiges Paar aus `YYYY-MM` und Monatsobjekt bilden;
- doppelte Monatsschlüssel sind unzulässig;
- alle enthaltenen Strukturen werden tief normalisiert.

## 20.4 Serverfehler nach lokalem Import

Schlägt die Serverübertragung nach erfolgreichem lokalen Import fehl:

- bleibt der lokale Stand erhalten;
- die Statusanzeige meldet ausdrücklich „lokal importiert – Serverfehler“;
- der Benutzer erhält keinen irreführenden zentral gespeicherten Erfolg;
- eine erneute JSON-Sicherung kann den lokalen Zustand sichern.

---

# 21. Monat vollständig leeren

„Monat leeren“ entfernt ausschließlich im sichtbaren Monat:

- alle BD-Einträge;
- alle HG-Einträge;
- alle ersten RBN-Werte;
- alle zweiten RBN-Werte;
- alle Abwesenheiten;
- alle Abwesenheitsquellen;
- alle Dienstwünsche;
- alle Optionen.

Andere Monate bleiben unverändert.

## 21.1 Umfangsanzeige

Vor der Ausführung nennt die Rückfrage:

- Zahl der Kalendertage mit mindestens einem Dienst- oder RBN-Wert;
- Zahl der unterschiedlichen Personen mit Abwesenheits-, Wunsch- oder Optionsmarkierungen.

Ist der Monat bereits leer, erscheint nur ein Hinweis.

## 21.2 Erhaltene Nachweise

Erhalten bleiben:

- `overrideLog`;
- `importLog`;
- bisherige `revision` als Ausgangspunkt der nächsten Speicherung;
- bisheriges `updatedAt` bis zur anschließenden Persistierung.

Die Löschfunktion erzeugt zunächst ein vollständiges normiertes leeres Monatsschema und verändert das ursprüngliche Objekt nicht seiteneffekthaft.

## 21.3 Speicherung und Wiederherstellung

Der geleerte Monat wird sofort als geändert markiert und unmittelbar persistiert. Bei Serverfehler bleibt der lokale Löschstand mit ausdrücklichem Offline-Hinweis erhalten.

Eine Rückgängig-Funktion existiert nicht. Wiederherstellung ist nur über eine zuvor erzeugte JSON-Sicherung möglich.

---

# 22. Drucken und PDF-Export

„PDF exportieren“ verwendet den nativen Browserdruckdialog. Die Ausgabe ist auf **genau eine DIN-A4-Seite hochkant** ausgelegt.

## 22.1 Gedruckte Inhalte

Gedruckt werden:

- kompakter Kopf mit „Bereitschaftsdienstplan“;
- Monat und Jahr;
- Monatskontrast-Abzeichen;
- Tag;
- Wochentag;
- BD;
- HG;
- RBN;
- 2. RBN;
- kompakte Statistik mit Name, BD und HG.

Nicht gedruckt werden:

- Ambient-Hintergrund;
- Kopfleiste;
- Werkzeugleiste;
- Legende;
- Dialoge;
- „Offene Punkte“;
- Abwesenheits-/FZA-Spalte;
- Wunsch-/Optionsspalte;
- erweiterte Statistikfelder.

## 22.2 Satzspiegel und Stabilität

- Satzbreite 168 mm;
- definierter vertikaler Bedarf innerhalb des A4-Satzspiegels;
- feste Millimetermaße;
- aufgehobene Eckenrundung und `overflow: hidden` im Druck;
- keine Filter, Verläufe, Animationen oder Containment-Effekte, die Chromium zur Vollseitenrasterung zwingen könnten;
- leere RBN-Platzhalter werden ausgeblendet;
- Monatsfarben bleiben über `print-color-adjust: exact` erhalten.

## 22.3 Monatsfarbe vor dem Druck

Vor jedem Druck wird die Monatsanimation auf den endgültigen Zustand gesetzt. Dadurch kann ein Druck während eines laufenden Monatswechsels keine Zwischenfarbe des vorherigen Monats einfrieren.

## 22.4 Dateiname

Für die Dauer des Druckdialogs wird der Dokumenttitel auf

```text
Dienstplan JJJJ-MM
```

gesetzt und anschließend wiederhergestellt. Dies steuert in üblichen Browsern den vorgeschlagenen PDF-Dateinamen.

Safari besitzt nicht überall ein zuverlässiges `beforeprint`; deshalb bereitet die Export-Schaltfläche den Druck zusätzlich ausdrücklich vor und räumt nach Rückkehr aus dem Dialog auf.

---

# 23. Sicherheit, Datenschutz und Datenintegrität

## 23.1 Datenminimierung

Gespeichert werden:

- Dienstplanbelegungen;
- Personal- und Rollenstammdaten;
- Abwesenheitstypen;
- Wünsche und Optionen;
- RBN-Werte;
- bestätigte rote Ausnahmen;
- optionale Override-Kommentare.

Patientendaten sind nicht Bestandteil des Datenmodells.

## 23.2 HTML-Sicherheit

Personalnamen und andere aus KV oder Import stammende Texte werden vor Einbettung in `innerHTML` maskiert. Wo möglich, verwendet die Anwendung `textContent` und native DOM-Erzeugung.

## 23.3 HTTP-Header

`_headers` setzt:

| Pfad | Cache-Regel |
|---|---|
| `/` | `no-cache, no-store, must-revalidate` |
| `/index.html` | `no-cache, no-store, must-revalidate` |
| `/styles.css` | `no-cache, must-revalidate` |
| `/js/*` | `no-cache, must-revalidate` |

Global gesetzt werden:

- `X-Frame-Options: SAMEORIGIN`;
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `Permissions-Policy` mit deaktivierter Geolocation, Kamera und Mikrofon.

## 23.4 Verbleibende Sicherheitsgrenzen

- keine Content-Security-Policy im Repository;
- externe SheetJS-Laufzeitabhängigkeit ohne SRI;
- keine eigene Benutzerverwaltung;
- keine eigene Anmeldung;
- keine serverseitige Rollen- oder Mandantenlogik;
- `localStorage` ist nicht anwendungsseitig verschlüsselt;
- öffentliche Repository-Sichtbarkeit ersetzt keine Lizenz.

Das Repository enthält derzeit keine ausdrückliche Open-Source-Lizenz. Öffentliche Lesbarkeit bedeutet daher nicht automatisch eine allgemeine Nutzungs-, Änderungs- oder Weitergabeberechtigung.

## 23.5 Einzelbearbeiter-Modell

DienstplanRAD ist für einen Einzelbearbeiter beziehungsweise eine koordinierte serielle Bearbeitung ausgelegt.

Es gibt:

- keine Echtzeit-Collaboration;
- keine serverseitige Bearbeitungssperre;
- keinen Compare-and-Swap-Abgleich;
- keine automatische Zusammenführung paralleler Monatsstände.

Die Revision schützt den lokalen Speicherablauf, nicht vor zwei gleichzeitig schreibenden Browsern. Bei paralleler Bearbeitung gilt praktisch „letzter erfolgreicher Schreibzugriff gewinnt“.

## 23.6 Freitext

Optionale Override-Kommentare sollten keine unnötigen medizinischen Patienteninformationen enthalten. Sie werden zentral und lokal zusammen mit dem Monatsdatensatz gespeichert.

---

# 24. Barrierefreiheit, responsive Nutzung und Installation

## 24.1 Semantik und Bedienbarkeit

- semantische Tabellenstruktur;
- echte Buttons und Selects;
- native Dialoge;
- sichtbare Textlabels zusätzlich zu Farben;
- Tooltips und sichtbare Begründungen;
- deaktivierte graue Kandidaten;
- datumsbezogene `aria-label`-Texte für RBN-Felder;
- sichtbarer Fokus;
- tabellarische Ziffern;
- kontrastgeprüfte Monatsfarbtexte;
- Unterstützung reduzierter Bewegung und Transparenz.

Farbe ist nie die einzige Informationsquelle. Jede Kandidatenkarte enthält einen Textchip und Klartextgründe.

## 24.2 Responsive Nutzung

Auf kleinen Bildschirmen bleiben alle acht Fachspalten vorhanden. Die Anwendung wird nicht in eine inhaltlich reduzierte Kartenansicht umgebaut. Stattdessen bleibt die vollständige Tabelle horizontal scrollbar.

Die produktive Hauptnutzung ist auf Desktop- und größere Tabletansichten ausgerichtet, bleibt aber auf kleineren Geräten vollständig erreichbar.

## 24.3 Web-App-Manifest

Das Manifest definiert:

- Name und Kurzname `DienstplanRAD`;
- App-ID `/`;
- Start-URL `/`;
- Scope `/`;
- Darstellung `standalone`;
- dunkle Hintergrund- und Theme-Farbe;
- SVG-Icon für `any` und `maskable`.

## 24.4 Installierbarkeit ohne Offlinegarantie

Die Anwendung kann je nach Browser als eigenständige Web-App beziehungsweise Startbildschirm-Verknüpfung installiert werden. Da kein aktiver Service Worker registriert wird, folgt daraus keine garantierte Offlineverfügbarkeit der App-Shell.

---

# 25. Technische Architektur und Module

## 25.1 Technologieübersicht

| Bereich | Umsetzung |
|---|---|
| Frontend | HTML, CSS, native JavaScript-ES-Module |
| Framework | keines |
| Bundler | keiner |
| Transpiler | keiner |
| Backend | Cloudflare Pages Functions |
| Persistenz | Cloudflare KV und `localStorage` |
| Excel | SheetJS 0.20.3 über CDN |
| Unit-/Regressionstests | `node:test`, `node:assert/strict` |
| End-to-End | Playwright 1.61.1 mit Chromium |
| Installation | Web-App-Manifest, `standalone` |
| Service Worker | keiner; nur neutralisierender Grabstein-Endpunkt |

## 25.2 `index.html`

Enthält:

- Metadaten und Build-Stempel;
- frühe Legacy-Worker-Bereinigung vor eigenen Assets;
- Manifest, Stylesheet und App-Einstieg mit einheitlichem Release-Token;
- SheetJS-CDN;
- Kopfleiste;
- Werkzeugleiste;
- Monatsplan;
- Statistik und offene Punkte;
- alle vier Dialoge.

## 25.3 `styles.css`

Enthält:

- KSG- und App-Token;
- Ambient-Hintergrund;
- Glasflächen und Kanten;
- Tabellen- und Dialoglayout;
- Status- und Bewertungsfarben;
- responsive Regeln;
- Fokusdarstellung;
- Bewegungs- und Transparenzreduktion;
- vollständiges Druckstylesheet am Dateiende.

## 25.4 `js/app.js`

Verantwortlich für:

- Initialisierung;
- DOM-Caching und Ereignisbindung;
- Build-Markierung;
- Monatsnavigation und Wettlaufschutz;
- Rendering der Tabelle;
- Kandidatendialog und Override-Ablauf;
- RBN-Steuerelemente;
- Tages- und Sammeldialoge;
- Statistik und offene Punkte;
- Excel-Import und -Export;
- JSON-Sicherung und -Import;
- Monatslöschung;
- Druckvorbereitung;
- zusätzliche Legacy-Worker-Bereinigung.

## 25.5 `js/defaults.js`

Definiert:

- Monats- und Blattnamen;
- Wochentagskürzel;
- Einstellungen;
- Personalreihenfolge;
- Standardpersonal;
- Abwesenheits-, Wunsch- und Optionstypen;
- leeres Monatsschema;
- Datumsvalidierung;
- Personalnormalisierung;
- Monatsnormalisierung;
- Backupnormalisierung.

## 25.6 `js/holidays.js`

Einzige Quelle für:

- lokale ISO-Tagesarithmetik;
- Osterberechnung;
- sächsische Feiertage;
- reguläre Werktage;
- erster regulärer Werktag nach einem Ereignis;
- Oster- und Pfingstblöcke.

## 25.7 `js/rbn.js`

DOM-freie Fachquelle für:

- ersten RBN-Pool;
- zweiten RBN-Pool;
- Aktivierungsgrenze von Fr. Hellmann;
- Anzeige ohne Titel;
- tagesgültige Zulässigkeit;
- Trigger der zweiten RBN.

## 25.8 Regelmodule

### `js/rules-core.js`

- Personal- und Rollenlookup;
- Kurznamen und externe Importwerte;
- Getter und Setter;
- wirksame Abwesenheiten;
- Becker-FZA;
- Optionen;
- Monatslöschung und Umfangszählung;
- Monats- und Wochenendzählungen;
- tagesbezogene geeignete Vergleichsgruppen;
- Historienvollständigkeit;
- Formatierungshelfer.

### `js/rules-evaluation.js`

- vollständige Kandidatenbewertung;
- Stufenaggregation;
- positive Empfehlungen;
- neutrale Kontexttexte;
- Kopplungsregeln;
- Monatsfairness;
- HG-Ausgleich;
- Wochenendfairness;
- Urlaubsnähe;
- Personensonderregeln.

### `js/rules-reporting.js`

- Statistik;
- offene Rollen;
- Prüfung bestehender Einteilungen;
- externe Namen und unbekannte IDs;
- RBN-Altwerte und Trigger;
- CT-Leitungsprüfung.

### `js/rules.js`

DOM-freie öffentliche Fassade und gebündelter Export der Regelmodule.

## 25.9 `js/state.js`

Verwaltet:

- Laufzeitzustand;
- lokale Bootstrap- und Monatssicherung;
- Monatsquellen;
- Dirty-Sets;
- Serverbootstrap;
- Monatsladen;
- Vorwärmung;
- Save-Debounce;
- Snapshot-Persistierung;
- Serialisierung pro Monat;
- Schutz vor verspäteten Antworten;
- Backup-Prioritäten.

## 25.10 `js/api.js`

Zentraler Fetch-Wrapper mit:

- einheitlicher JSON-Verarbeitung;
- Fehlerweitergabe;
- Methoden für Bootstrap, Monate, Export und Import.

## 25.11 `js/excel-import.js`

Reine, testbare Importanalyse für:

- Jahresmappen;
- einzelne Monatspläne;
- Datums- und Jahreserkennung;
- Namensauflösung;
- externe Namen;
- RBN-Normalisierung;
- Merge-Änderungslisten;
- Abschlussstatistik.

## 25.12 `js/theme.js`

Definiert:

- zwölf Paletten;
- Farbparsing;
- Kontrastberechnung;
- OKLab-/OKLCH-nahe Interpolation;
- Easing;
- Dauer;
- konkrete CSS-Variablen;
- Bewegungsreduktion.

## 25.13 Pages Functions

- `functions/_utils.js`: KV-Zugriff, JSON-Antworten, Schlüssel, Defaults und Normalisierung;
- `functions/api/bootstrap.js`: Startdaten;
- `functions/api/month/[year]/[month].js`: Monats-GET und -PUT;
- `functions/api/settings.js`: Einstellungen;
- `functions/api/staff.js`: Personal;
- `functions/api/rbn-names.js`: Legacy-RBN-Liste;
- `functions/api/export.js`: dynamischer Gesamtserverexport;
- `functions/api/import.js`: strikter Import mit Rollback;
- `functions/sw.js.js`: neutralisierender Grabstein für `/sw.js`.

## 25.14 Fachreferenz

`Eignungsregeln.txt` dokumentiert die Kandidatenregeln in kompakter, versionsgeführter Textform. Sie ist keine zweite Implementierung, sondern der menschlich lesbare Fachvertrag zur Regelengine.

---

# 26. Vollständige Projektstruktur

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── Eignungsregeln.txt
├── README.md
├── _headers
├── index.html
├── manifest.webmanifest
├── package.json
├── package-lock.json
├── playwright.config.js
├── styles.css
├── icons/
│   ├── icon.svg
│   └── icon-animated.svg
├── js/
│   ├── api.js
│   ├── app.js
│   ├── defaults.js
│   ├── excel-import.js
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
    ├── bughunt-regressions.test.js
    ├── data-integrity.test.js
    ├── delivery.test.js
    ├── excel-import.test.js
    ├── final-consistency.test.js
    ├── functions.test.js
    ├── historical-loading.test.js
    ├── month-clear.test.js
    ├── month-navigation.test.js
    ├── rbn.test.js
    ├── recommendation-rules.test.js
    ├── rule-matrix.test.js
    ├── rules.test.js
    ├── state-persistence.test.js
    ├── theme.test.js
    ├── timezone.test.js
    ├── e2e/
    │   ├── app.spec.js
    │   └── bughunt.spec.js
    └── fixtures/
        └── excel-import-samples.json
```

---

# 27. Tests, End-to-End-Prüfung und Continuous Integration

## 27.1 Syntaxprüfung

```bash
npm run check
```

Geprüft werden sämtliche ausgelieferten JavaScript-Module unter `js/` und `functions/` sowie die Playwright-Konfiguration mit `node --check`.

## 27.2 Unit- und Regressionstests

```bash
npm test
```

Verwendet werden `node:test` und `node:assert/strict`. Der Glob `tests/*.test.js` umfasst die browserunabhängigen Testdateien im Testwurzelverzeichnis.

## 27.3 End-to-End-Tests

```bash
npm run test:e2e
```

Playwright-Konfiguration:

- Testverzeichnis `tests/e2e`;
- Chromium;
- Base-URL `http://127.0.0.1:4173`;
- lokaler Server `python3 -m http.server 4173`;
- ein Worker;
- keine vollständige Parallelisierung;
- lokal keine Wiederholung;
- in Continuous Integration eine Wiederholung;
- Trace bei Fehlschlag erhalten;
- lokaler Listenreporter;
- GitHub-Reporter in Continuous Integration.

## 27.4 Gesamtprüfung

```bash
npm run verify
```

führt nacheinander aus:

1. Syntaxprüfung;
2. Unit-/Regressionstests;
3. End-to-End-Tests.

## 27.5 Abgedeckte Invarianten

Die Tests decken unter anderem ab:

- Aktivität und Qualifikation;
- harte und weiche Regeln;
- Personensonderregeln;
- Becker-FZA;
- unmittelbar aufeinanderfolgende BD;
- monatsübergreifende Abstände;
- BD–FZA–BD;
- Kopplungen in beiden Eingabereihenfolgen;
- Selbstkonsistenz bestehender Einteilungen;
- bedingten Start des BD-Monatsausgleichs;
- tagesbezogene Vergleichsgruppen;
- ersten Lurz-Überhang;
- neutralen Jahresverlauf;
- HG- und AA-HG-Ausgleich;
- Wochenendäquivalente und Verteilungsrunden;
- RBN-Pools und Stichtage;
- historische RBN-Altwerte;
- Feiertage und Zeitzonen;
- Monatsfarben, Kontrast und Interpolation;
- Monatsnavigation und Wettlaufschutz;
- lokale Persistenz und Save-Reihenfolge;
- Tiefennormalisierung;
- JSON-Importvalidierung und Rollback;
- Excel-Formaterkennung und Mergeverhalten;
- externe Importnamen;
- Monatslöschung;
- Release-Token und Modulauflösung;
- Service-Worker-Neutralisierung;
- Cloudflare-Header und Function-Routen;
- reale Browserinteraktion in Chromium.

## 27.6 Testdateien nach Schwerpunkt

| Datei | Schwerpunkt |
|---|---|
| `rules.test.js` | allgemeine Regelengine |
| `rule-matrix.test.js` | Kombinationen und Reihenfolgeunabhängigkeit |
| `recommendation-rules.test.js` | Fairness, Empfehlungen und Jahreskontext |
| `rbn.test.js` | RBN-Pools, Trigger und Stichtage |
| `timezone.test.js` | lokale Tagesarithmetik und Feiertage |
| `theme.test.js` | Paletten, Kontrast und Interpolation |
| `state-persistence.test.js` | Dirty-Status, Snapshot-Saves und Reihenfolge |
| `historical-loading.test.js` | vollständige Historie und Fallbackquellen |
| `month-navigation.test.js` | schnelle Monatswechsel und Wettlaufschutz |
| `excel-import.test.js` | Excel-Erkennung, Mapping und Merge |
| `data-integrity.test.js` | Normalisierung und strukturelle Validierung |
| `functions.test.js` | Pages-Functions und API-Verhalten |
| `delivery.test.js` | Auslieferung, Tokens, Header und Worker-Grabstein |
| `month-clear.test.js` | Umfang, Löschung und Erhalt der Nachweise |
| `bughunt-regressions.test.js` | gezielte frühere Fehlerklassen |
| `final-consistency.test.js` | querschnittliche Endkonsistenz |
| `e2e/app.spec.js` | Kernbedienung im Browser |
| `e2e/bughunt.spec.js` | Browserbasierte Regressionsfälle |

## 27.7 GitHub Actions

Die permanente CI läuft:

- bei Push auf `main`;
- bei Pull Requests gegen `main`.

Job:

- `ubuntu-latest`;
- Timeout 15 Minuten;
- minimale Berechtigung `contents: read`;
- Node.js 24;
- npm-Cache;
- `npm ci`;
- `npm run check`;
- `npm test`;
- Installation von Chromium samt Systemabhängigkeiten;
- `npm run test:e2e`.

---

# 28. Lokale Entwicklung

## 28.1 Voraussetzungen

- Node.js mit `node:test`;
- npm;
- moderner Browser;
- Python 3 für den von Playwright gestarteten statischen Testserver;
- optional Cloudflare Pages/Wrangler für Functions und KV;
- Internetzugriff auf das SheetJS-CDN für Excel-Funktionen.

## 28.2 Installation

```bash
npm ci
```

## 28.3 Prüfung

```bash
npm run check
npm test
npx playwright install --with-deps chromium
npm run test:e2e
```

oder vollständig:

```bash
npm run verify
```

## 28.4 Statische lokale Ausführung

Native ES-Module und Fetch erfordern einen lokalen HTTP-Server. Die Anwendung sollte nicht über `file://` geöffnet werden.

Beispiel:

```bash
python3 -m http.server 4173
```

Die statische Oberfläche kann so geladen werden. Echte Pages Functions und KV benötigen eine Cloudflare-kompatible Entwicklungsumgebung oder geeignete Mocks.

## 28.5 Entwicklungsprinzipien

- Fachlogik DOM-frei halten.
- Neue Module in `npm run check` aufnehmen.
- Jede neue Regel mit positivem und negativem Gegenbeispiel testen.
- Zeitliche Regeln in beiden Eingabereihenfolgen prüfen.
- Den betrachteten Tag bei Zählregeln explizit ausschließen.
- Reine Kontexttexte niemals über bewertungswirksame Funktionen hinzufügen.
- Keine automatische Gegenbelegung einführen.
- Stabile Personal-IDs nicht leichtfertig ändern.
- Release-Token bei ausgelieferten Funktionsänderungen konsistent erhöhen.
- README und `Eignungsregeln.txt` im selben Änderungsvorgang aktualisieren.

---

# 29. Deployment, Release-Kennung und Cache-Sicherheit

## 29.1 Cloudflare Pages

Das Repository wird aus dem Projektstamm bereitgestellt. Pages Functions werden aus `functions/` erkannt. Das KV-Binding muss exakt `DIENSTPLAN_KV` heißen.

## 29.2 Release-Token

Alle releasekritischen Browserassets und internen ES-Modulimporte verwenden denselben `?v=`-Token. Der Build-Stempel in `index.html` muss exakt dazu passen.

Aktueller Token:

```text
20260801.11
```

Der laufende Stand ist prüfbar über:

```js
document.documentElement.dataset.build
```

und über den Tooltip des Speicherstatus.

## 29.3 Kein Build-Schritt

Es gibt keinen Bundler und keinen Transpiler. Cloudflare Pages liefert die Repositorydateien direkt aus. Ein fehlerhafter relativer Modulimport oder uneinheitlicher Release-Token ist deshalb unmittelbar produktionsrelevant.

## 29.4 Historischer Service Worker

Die Anwendung registriert keinen aktiven Service Worker. Ein früherer Cache-First-Worker konnte veraltete Releases dauerhaft ausliefern. Deshalb bestehen zwei Schutzschichten:

1. Inline-Bereinigung im `<head>` vor den eigenen Asset-Anfragen;
2. zusätzliche Bereinigung beim App-Start.

Die Bereinigung:

- berücksichtigt nur Registrierungen mit Scriptpfad `/sw.js`;
- löscht nur Cache-Namen mit Präfix `dienstplanrad`;
- prüft, ob der aktuelle Tab tatsächlich noch von einem Worker kontrolliert wird;
- lädt höchstens einmal neu;
- verhindert Schleifen über `sessionStorage`.

`functions/sw.js.js` liefert weiterhin einen neutralisierenden `/sw.js`-Grabstein mit korrektem JavaScript-MIME-Typ und `no-store`.

## 29.5 Release-Checkliste

1. `npm ci` erfolgreich;
2. `npm run check` erfolgreich;
3. `npm test` erfolgreich;
4. `npm run test:e2e` erfolgreich;
5. alle relativen Browserimporte auflösbar;
6. einheitlicher Release-Token;
7. Build-Stempel entspricht dem Token;
8. kein aktiver Service Worker registriert;
9. `_headers` geprüft;
10. Function-Routen geprüft;
11. Monatsnavigation und schnelle Richtungswechsel geprüft;
12. BD-/HG-Dialoge und rote Bestätigung geprüft;
13. RBN-Abhängigkeit geprüft;
14. Excel-Import und Ersetzungsbestätigung geprüft;
15. JSON-Backup und -Import geprüft;
16. Monatslöschung geprüft;
17. Druckansicht und Dateiname geprüft;
18. Live-Build-Stempel nach Deployment kontrolliert.

---

# 30. Betrieb und Fehlerdiagnose

## 30.1 Anzeige bleibt auf „Lädt …“

Prüfen:

- Browserkonsole;
- Netzwerkantwort von `/api/bootstrap`;
- KV-Binding `DIENSTPLAN_KV`;
- ob ein historischer Worker den Tab kontrolliert;
- Build-Stempel;
- tatsächlich geladene Asset-Token;
- ob die Inline-Bereinigung einen einmaligen Neustart angekündigt hat.

## 30.2 „Offline – lokaler Stand“

Die Anwendung verwendet lokale Daten. Vor erzwungenem Serverreload:

- JSON-Sicherung erstellen;
- prüfen, ob lokale Änderungen neuer sind;
- anderen Browser beziehungsweise Parallelbearbeitung ausschließen;
- Servererreichbarkeit kontrollieren.

## 30.3 Falscher oder alter Stand sichtbar

- Seite vollständig neu laden;
- `document.documentElement.dataset.build` prüfen;
- `/sw.js` auf JavaScript-MIME-Typ und `no-store` prüfen;
- Service-Worker-Registrierungen kontrollieren;
- Cloudflare-Deployment-Branch kontrollieren;
- Asset-Token in `index.html` und Modulimporten vergleichen.

## 30.4 Monat wechselt zurück oder zeigt falsche Daten

Dies wäre eine Regression des Anforderungszählers. Zu prüfen sind:

- `monthRequestId`;
- `requestedYear` und `requestedMonth`;
- Abbruch nach jedem asynchronen Ladeschritt;
- Tests in `month-navigation.test.js`.

## 30.5 Monatsausgleich erscheint zu früh

Mindestens eine aktive planbare Person mit positivem BD-Soll muss ihr Soll bereits erreicht haben. Zu prüfen:

- Zählung unter Ausschluss des betrachteten Tages;
- globale Startgruppe;
- tagesbezogene Vergleichsgruppe;
- `recommendation-rules.test.js`.

## 30.6 Jahresverlauf verändert Farbe oder Reihenfolge

Dies ist unzulässig. Der Jahresverlauf darf nur als neutraler Kontextgrund ergänzt werden und weder Stufe noch Empfehlungswert verändern.

## 30.7 Zweite RBN fehlt

Prüfen:

- erste RBN ist Dr. Schüngel, Fr. Hellmann, Dr. Martin oder Hr. El Houba;
- Fr. Hellmann liegt am oder nach 01.10.2026;
- gespeicherter Erstwert entspricht exakt einem gültigen Poolwert;
- Altwert wird nicht irrtümlich als Trigger interpretiert.

## 30.8 Excel-Funktionen fehlen

Prüfen:

- `window.XLSX`;
- Erreichbarkeit des SheetJS-CDN;
- Content-Blocker;
- Browserkonsole;
- Netzwerkfehler.

## 30.9 PDF umfasst mehr als eine Seite

Prüfen:

- Browserpapierformat DIN A4;
- Hochformat;
- Skalierung 100 Prozent beziehungsweise Standard;
- Browserkopf- und Fußzeilen;
- ungewöhnlich große Systemschrift;
- ob das Druckstylesheet am Dateiende unverändert greift;
- ob nicht vorgesehene Spalten sichtbar bleiben.

## 30.10 Monat versehentlich geleert

Es existiert keine Undo-Funktion. Wiederherstellung erfolgt über eine zuvor erzeugte JSON-Sicherung. Override- und Importprotokoll allein rekonstruieren den vollständigen operativen Monatsstand nicht.

---

# 31. Gezielte Anpassungen

## 31.1 Personal und Sollwerte

Standardwerte liegen in `js/defaults.js`. Personal-IDs sind persistente Fremdschlüssel in Monatsdaten und dürfen nicht ohne Migrationskonzept geändert werden. Anzeigenamen und Kurzformen können dagegen angepasst werden, ohne historische Zuordnungen umzuschreiben.

## 31.2 Aktivierung und Beförderung

- Aktivierungsgrenzen: `activeFrom`, `activeUntil`;
- Beförderungsstichtag: `promotionDate`;
- tagesgültige Eigenschaften: `promotedRoleLabel`, `promotedCanHg`, `promotedCanSaturdayBd`.

Grenzfälle müssen am Tag davor, am Stichtag und am Tag danach getestet werden.

## 31.3 RBN-Pools

Pools, Stichtage, Anzeigenamen und Trigger liegen ausschließlich in `js/rbn.js`. Änderungen benötigen Tests für:

- ersten Pool;
- zweiten Pool;
- Trigger;
- historische Altwerte;
- Stichtagsgrenzen;
- automatische Entfernung der zweiten RBN bei bewusster Änderung.

## 31.4 Regeln

- gemeinsame Helfer: `rules-core.js`;
- Bewertung: `rules-evaluation.js`;
- Statistik und offene Punkte: `rules-reporting.js`.

Neue reine Informationen müssen als neutraler Grund ergänzt werden. Neue Empfehlungen dürfen keine Konfliktstufe kompensieren. Neue Kopplungen dürfen keine automatische Gegenbelegung erzeugen.

## 31.5 Monatsfarben

Paletten liegen in `theme.js`. Jede Änderung muss geprüft werden gegen:

- Textkontrast;
- konkrete RGB-/RGBA-Ausgabe;
- Interpolation;
- Druckfarben;
- Bewegungsreduktion;
- reduzierte Transparenz.

## 31.6 Feiertage

Die Region ist derzeit fest Sachsen. Eine Erweiterung auf weitere Regionen benötigt eine gemeinsame neue Fachquelle. UI, Regelengine und Import dürfen keine voneinander abweichenden Feiertagsimplementierungen erhalten.

## 31.7 Importformate

Neue Excel-Varianten sollten zunächst als reine Zeilenmatrizen in `excel-import.js` analysiert und durch Fixtures sowie Unit-Tests abgesichert werden. Der Browserteil soll ausschließlich Datei-Einlesen, Bestätigung und Merge orchestrieren.

---

# 32. Bewusste Grenzen und unveränderliche Grundsätze

- Keine automatische Dienstplanerstellung.
- Keine automatische Umbesetzung.
- Keine automatische Tauschlogik.
- Keine automatische Gegenbelegung bei Kopplungsregeln.
- Genau ein BD- und ein HG-Feld je Tag.
- Rote Konflikte sind nur nach ausdrücklicher Bestätigung zulässig.
- Graue Kandidaten sind nicht auswählbar.
- Positive Empfehlungen heben Konflikte niemals auf.
- Jahresverlauf ist ausschließlich neutraler Kontext.
- BD-Monatsausgleich beginnt erst nach erster Soll-Erfüllung.
- Relative Fairness vergleicht am Tag grundsätzlich geeignete Personen.
- Historische Altwerte werden sichtbar erhalten und nicht ungefragt gelöscht.
- Externe Importnamen bleiben lesbar, aber nicht erneut auswählbar.
- Keine serverseitige Mehrbenutzer-Sperre.
- Keine eigene Benutzerverwaltung im Repository.
- Keine garantierte vollständige Offline-Nutzung.
- Keine vollständige serverseitige Fachvalidierung jeder möglichen Dienstkombination; die Browser-Regelengine ist die primäre Fachschicht.
- Kein Bundler und kein Transpiler.
- Kein aktiver Service Worker.
- Keine Content-Security-Policy im aktuellen Repository.
- Keine ausdrückliche Open-Source-Lizenz.
- Farbe ist niemals die einzige Informationsquelle.

---

# 33. Glossar

| Begriff | Erklärung |
|---|---|
| **AA/AÄ** | Assistenzarzt beziehungsweise Assistenzärztin |
| **FA/FÄ** | Facharzt beziehungsweise Fachärztin |
| **OA/OÄ** | Oberarzt beziehungsweise Oberärztin |
| **BD** | Bereitschaftsdienst |
| **HG** | Hintergrunddienst |
| **RBN** | Rufbereitschaft Neuroradiologie |
| **FZA** | Freizeitausgleich/Frei |
| **Soll** | angestrebte monatliche BD-Anzahl |
| **Maximum** | harte monatliche BD-Obergrenze |
| **Überhang** | BD oberhalb des individuellen Sollwerts |
| **Stufe** | sichtbarer Bewertungszustand einer Kandidatenkarte |
| **Empfehlungswert** | interne positive Metadaten ohne Konfliktkompensation |
| **Tie-Breaker** | Zusatzinformation bei sonst gleicher Vergleichslage; hier ohne Bewertungswirkung |
| **Override** | ausdrücklich bestätigte rote Einteilung |
| **Altwert** | historischer gespeicherter Wert außerhalb des aktuellen Auswahlpools |
| **externer Importwert** | Name ohne zuordenbare Personal-ID, gespeichert mit Präfix `extern:` |
| **KV** | Cloudflare Key-Value-Speicher |
| **Bootstrap** | globale Startdaten aus Einstellungen, Personal und Legacy-RBN-Liste |
| **Dirty** | lokal geändert und noch nicht abschließend zentral synchronisiert |
| **Debounce** | verzögertes Zusammenfassen schneller Änderungen vor dem Speichern |
| **Snapshot** | unveränderliche Kopie eines Monats für einen konkreten Speichervorgang |
| **Fallback** | normierter Ersatzstand nach fehlgeschlagenem Server- und Lokalladen |
| **Release-Token** | Versionsparameter der Browserassets und Modulimporte |
| **Build-Stempel** | sichtbare Kennung des tatsächlich geladenen Releases |
| **Service-Worker-Grabstein** | neutraler `/sw.js`-Endpunkt zur Ablösung eines historischen Workers |
| **SRI** | Subresource Integrity für externe Browserressourcen |
| **CSP** | Content Security Policy |

---

## Schlussbild

DienstplanRAD verbindet eine kompakte, klinisch vertraute Monatsliste mit einer transparenten, vollständig begründeten Regelprüfung. Die Anwendung wahrt die Entscheidungshoheit des Menschen, dokumentiert harte Ausnahmen, behandelt historische Daten defensiv, schützt lokale Änderungen vor typischen Speicher- und Navigationsrennen und stellt den fertigen Dienstplan sowohl digital als auch druckoptimiert bereit.

Die drei zentralen Leitplanken des aktuellen Fachmodells lauten:

1. **Die Anwendung bewertet und erklärt, sie plant niemals selbstständig.**
2. **Der relative BD-Monatsausgleich beginnt erst nach der ersten tatsächlichen Soll-Erfüllung und vergleicht anschließend nur am Tag grundsätzlich geeignete Personen.**
3. **Der Jahresverlauf bleibt ein reiner Kontexttext und verändert weder Farbe noch Empfehlungswert.**
