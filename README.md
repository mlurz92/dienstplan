# DienstplanRAD

**DienstplanRAD** ist eine browserbasierte, manuell geführte Anwendung zur monatlichen Planung radiologischer Bereitschafts- und Hintergrunddienste. Die Anwendung bildet den vertrauten Aufbau einer Excel-Dienstplantabelle nach, ergänzt ihn jedoch um regelbasierte Eignungshinweise, automatische Speicherung, Cloudflare-Workers-KV-Persistenz, Excel- und JSON-Datenaustausch, druckoptimierte Ausgabe sowie eine installierbare Progressive Web Application.

Die Anwendung ist bewusst **kein automatischer Dienstplanalgorithmus**. Sie verteilt keine Dienste selbstständig, führt keine Optimierungsläufe aus und ersetzt keine fachliche oder organisatorische Entscheidung. Jede Besetzung wird durch den planenden Nutzer manuell ausgewählt. Die Regelengine dient ausschließlich als kontextbezogene Entscheidungshilfe.

---

## Inhaltsverzeichnis

1. [Zielsetzung und Grundprinzip](#zielsetzung-und-grundprinzip)
2. [Produktionsumgebung](#produktionsumgebung)
3. [Funktionsumfang auf einen Blick](#funktionsumfang-auf-einen-blick)
4. [Benutzeroberfläche und Designphilosophie](#benutzeroberfläche-und-designphilosophie)
5. [Monatliche Kontrastfarbsysteme](#monatliche-kontrastfarbsysteme)
6. [Tabellarischer Monatsplan](#tabellarischer-monatsplan)
7. [Mitarbeitendenstamm und feste Auswahlreihenfolge](#mitarbeitendenstamm-und-feste-auswahlreihenfolge)
8. [Manuelle Bereitschaftsdienst- und Hintergrunddienstplanung](#manuelle-bereitschaftsdienst--und-hintergrunddienstplanung)
9. [RBN-Felder](#rbn-felder)
10. [Abwesenheiten](#abwesenheiten)
11. [Dienstwünsche](#dienstwünsche)
12. [Regelbewertung und Konfliktstufen](#regelbewertung-und-konfliktstufen)
13. [Vollständige fachliche Regelmatrix](#vollständige-fachliche-regelmatrix)
14. [Statistik unterhalb des Monatsplans](#statistik-unterhalb-des-monatsplans)
15. [Gesetzliche Feiertage in Sachsen](#gesetzliche-feiertage-in-sachsen)
16. [Excel-Import](#excel-import)
17. [Excel-Export](#excel-export)
18. [PDF- und Druckausgabe](#pdf--und-druckausgabe)
19. [JSON-Sicherung und Wiederherstellung](#json-sicherung-und-wiederherstellung)
20. [Speicher- und Synchronisationsmodell](#speicher--und-synchronisationsmodell)
21. [Offlinebetrieb und Progressive Web Application](#offlinebetrieb-und-progressive-web-application)
22. [Cloudflare-Pages-Functions-Programmierschnittstelle](#cloudflare-pages-functions-programmierschnittstelle)
23. [Workers-KV-Datenstruktur](#workers-kv-datenstruktur)
24. [Datenmodell](#datenmodell)
25. [Projektstruktur](#projektstruktur)
26. [Deployment auf Cloudflare Pages](#deployment-auf-cloudflare-pages)
27. [Sicherheits- und Datenschutzaspekte](#sicherheits--und-datenschutzaspekte)
28. [Browser- und Systemanforderungen](#browser--und-systemanforderungen)
29. [Bedienablauf im Regelbetrieb](#bedienablauf-im-regelbetrieb)
30. [Fehlerbilder und Fehlerbehebung](#fehlerbilder-und-fehlerbehebung)
31. [Bekannte funktionale Grenzen](#bekannte-funktionale-grenzen)
32. [Qualitätssicherung und technische Prüfungen](#qualitätssicherung-und-technische-prüfungen)
33. [Weiterentwicklung](#weiterentwicklung)

---

# Zielsetzung und Grundprinzip

DienstplanRAD wurde für eine Arbeitsweise entwickelt, bei der der Dienstplan weiterhin bewusst durch eine fachlich verantwortliche Person erstellt wird. Das System soll die Übersichtlichkeit einer klassischen Excel-Dienstplantabelle erhalten, gleichzeitig aber typische Fehlerquellen und wiederkehrende Prüfaufgaben reduzieren.

Das Kernkonzept besteht aus fünf Ebenen:

1. **Manuelle Entscheidungshoheit**  
   Jede Einteilung wird aktiv ausgewählt. Keine Person wird automatisch in einen Dienst eingetragen.

2. **Kontextbezogene Regelprüfung**  
   Vor der Auswahl einer Person bewertet die Anwendung Qualifikation, Abwesenheiten, Wünsche, Abstände, Wochenenden, Urlaubsbeginn und definierte Sonderregeln.

3. **Nicht blockierende Planung**  
   Auch eine fachlich ungünstige oder regelwidrige Einteilung bleibt grundsätzlich möglich. Nur rote Konflikte verlangen eine ausdrückliche Bestätigung.

4. **Excel-nahe Darstellung**  
   Die Tage stehen zeilenweise. Bereitschaftsdienst, Hintergrunddienst, RBN-Felder, Abwesenheiten und Dienstwünsche stehen in klar getrennten Spalten.

5. **Automatische Persistenz**  
   Änderungen werden lokal zwischengespeichert und anschließend über Cloudflare Pages Functions in Workers KV gespeichert.

---

# Produktionsumgebung

| Komponente | Festgelegter Wert |
|---|---|
| GitHub-Repository | `mlurz92/dienstplan` |
| Produktionsbranch | `main` |
| Cloudflare-Pages-Projekt | `dienstplanrad` |
| Produktionsadresse | `https://dienstplanrad.pages.dev` |
| Workers-KV-Namespace | `dienstplanrad-kv` |
| KV-Binding in Pages Functions | `DIENSTPLAN_KV` |
| Feiertagsregion | Sachsen |
| Nutzungskonzept | ein planender Nutzer, keine Mehrbenutzerkoordination |
| Zugriffsschutz | keiner |

Jeder Merge in den Branch `main` löst über die bestehende GitHub-Verknüpfung ein neues Cloudflare-Pages-Deployment aus.

---

# Funktionsumfang auf einen Blick

- monatliche manuelle Bereitschaftsdienstplanung
- monatliche manuelle Hintergrunddienstplanung
- zwei frei beschreibbare RBN-Felder pro Kalendertag
- feste Mitarbeitendenreihenfolge
- zeitabhängige Aktivierung und Qualifikationsänderung einzelner Mitarbeitender
- farbcodierte Eignungsbewertung
- verpflichtende Bestätigung roter Konflikte
- optionale Begründung bei bestätigten roten Konflikten
- Urlaub, Freizeitausgleich, Weiterbildung und sonstige Abwesenheiten
- positive und negative Dienstwünsche
- Einzel- und Mehrtagespflege
- monatsübergreifende Abstandsprüfung
- Wochenendäquivalente
- Oster- und Pfingstblockprüfung
- gesetzliche Feiertage in Sachsen
- monatlich wechselnde Kontrastfarben für Samstag, Sonntag und Feiertag
- Excel-Import aus Jahresplanern
- Excel-Export des aktuellen Monats
- druckoptimierte A4-Hochformatansicht
- JSON-Gesamtsicherung
- serverseitige KV-Speicherung
- lokaler Browserfallback
- installierbare Progressive Web Application
- Service-Worker-Cache für Kernressourcen

---

# Benutzeroberfläche und Designphilosophie

## Grundidee

Die Oberfläche verbindet zwei bewusst unterschiedliche Gestaltungsprinzipien:

- **Excel-nahe Informationsdichte im Monatsplan**
- **Aero-Peak- und Liquid-Glass-Anmutung im Anwendungsrahmen**

Der Tabellenbereich bleibt nüchtern, eng gerastert und sofort scanbar. Kopfbereich, Toolbar, Dialoge, Fensterränder und Bedienelemente verwenden dagegen halbtransparente Flächen, Hintergrundunschärfe, Reflexionskanten, mehrschichtige Schatten und dezente Monatsfarbreflexe.

Dadurch entsteht kein dekoratives Dashboard, sondern eine professionelle Arbeitsoberfläche mit einem klaren Schwerpunkt auf der Tabelle.

## Aero-Peak-Elemente

Die Aero-Peak-Anmutung entsteht durch:

- dunklen neutralen Hintergrund
- farbigen Monatslichtschein im oberen Hintergrundbereich
- stark kontrastierende, halbtransparente Fensterflächen
- helle Reflexionslinie am oberen Rand der Glasflächen
- tiefe, aber weiche Schlagschatten
- leicht metallisch wirkende Bedienelemente
- eingelassene Monats- und Statusfelder
- klare helle Kanten vor dunklem Hintergrund

## Liquid-Glass-Elemente

Die Liquid-Glass-Anmutung entsteht durch:

- `backdrop-filter` mit Unschärfe und erhöhter Farbsättigung
- semitransparente Flächen statt vollständig deckender Karten
- überlagerte lineare Verläufe
- innere Lichtkante
- dezente Spiegelung in der oberen Hälfte von Fenstern und Schaltflächen
- dynamisch an den Monat angepasste Lichtreflexe
- transparente Dialoge mit abgedunkeltem und weichgezeichnetem Hintergrund

## Bewusste Begrenzung der Glaseffekte

Der Tabellenkörper ist absichtlich weniger transparent als der Anwendungsrahmen. Dienstplanung verlangt eine hohe Lesbarkeit, stabile Zellgrenzen und eine schnelle visuelle Orientierung. Zu starke Transparenz innerhalb der Zellen würde Namen, Kürzel und Konfliktmarkierungen unnötig beeinträchtigen.

Die Anwendung verwendet daher:

- Glaswirkung für Rahmen und Interaktion
- Excel-Raster für operative Planung
- Monatsfarben ausschließlich als funktionale Orientierung

## Kopfbereich

Der Kopfbereich enthält:

- Produktmarke `DR`
- Bezeichnung der Klinik
- Anwendungsname DienstplanRAD
- kurze Funktionsbeschreibung
- Navigation zum vorherigen Monat
- Monatsauswahl
- Jahresauswahl
- Navigation zum nächsten Monat
- Speicherstatus

## Speicherstatus

Der Statusbereich zeigt unter anderem:

- `Lädt …`
- `Lädt Serverstand …`
- `Gespeichert`
- `Speichert …`
- `Offline – lokaler Stand`
- `Offline gespeichert`

Der farbige Statuspunkt unterstützt die Textanzeige, ersetzt sie aber nicht.

## Toolbar

Die Toolbar enthält:

- aktuellen Monat öffnen
- Abwesenheiten verwalten
- Dienstwünsche verwalten
- Serverstand neu laden
- Excel-Datei importieren
- aktuellen Monat als Excel-Datei exportieren
- Druck- beziehungsweise PDF-Dialog öffnen
- JSON-Sicherung exportieren
- JSON-Sicherung importieren

## Dialoge

Die Anwendung verwendet native HTML-Dialoge für:

- Auswahl einer Person für Bereitschaftsdienst oder Hintergrunddienst
- tagesbezogene Abwesenheiten und Wünsche
- komfortable Mehrtagesauswahl
- Bestätigung roter Konflikte

Dialoge behalten die Glaswirkung bei, besitzen jedoch einen ausreichend deckenden Hintergrund für eine zuverlässige Lesbarkeit.

---

# Monatliche Kontrastfarbsysteme

Jeder Monat besitzt ein eigenes Farbthema. Das Farbthema verändert nicht die fachliche Bewertung, sondern ausschließlich die visuelle Orientierung für Samstag, Sonntag, gesetzliche Feiertage, Monatsakzent und Hintergrundlichtschein.

| Monat | Bezeichnung des Farbthemas | Charakter |
|---|---|---|
| Januar | Eisblau | kühl, klar, kontrastreich |
| Februar | Rubinrose | gedämpftes Rosa bis Rubin |
| März | Salbeigrün | ruhiges Grün mit natürlichem Kontrast |
| April | Lavendel | violett-lavendelfarbene Abstufung |
| Mai | Frühlingsgrün | frisches, kräftigeres Grün |
| Juni | Türkis | kühles Türkis mit hoher Lesbarkeit |
| Juli | Koralle | warmes Korallrot |
| August | Bernstein | gold- bis bernsteinfarbene Akzente |
| September | Pflaume | gedecktes Pflaumenviolett |
| Oktober | Kupfer | warme Kupfer- und Brauntöne |
| November | Schieferblau | kühles, gedämpftes Blau |
| Dezember | Tannengrün und Rubin | grüne Grundakzente, rubinfarbene Feiertage |

## Semantik der Kalendertagsfarben

Innerhalb eines Monats werden drei unterschiedliche Kontraststufen verwendet:

- **Samstag:** hellste Wochenendkontrastfarbe
- **Sonntag:** stärkerer und dunklerer Wochenendkontrast
- **gesetzlicher Feiertag:** eigenständige Feiertagsfarbe mit stärkster Randmarkierung

Wenn ein Feiertag auf einen Samstag oder Sonntag fällt, erhält die Feiertagsdarstellung visuell Vorrang.

## Feiertagsbezeichnung in der Tabelle

Der Name des Feiertags erscheint direkt unter dem ausgeschriebenen Wochentag. Beispiele:

- Freitag  
  Karfreitag

- Mittwoch  
  Buß- und Bettag

Diese Zusatzbezeichnung wird platzsparend in kleinerer Schrift dargestellt.

## Dynamische Browserfarbe

Beim Monatswechsel wird zusätzlich die `theme-color` des Dokuments angepasst. Unterstützte Browser können dadurch auch Browserrahmen oder installierte Progressive-Web-Application-Fenster an das jeweilige Monatsfarbthema anpassen.

---

# Tabellarischer Monatsplan

Der Monatsplan ist die zentrale Arbeitsfläche.

## Zeilenstruktur

Jeder Kalendertag des ausgewählten Monats belegt genau eine Tabellenzeile.

Die Zeilen werden aus dem Monatsdatenmodell erzeugt. Die Anzahl entspricht automatisch der realen Monatslänge.

## Spalten

| Spalte | Inhalt |
|---|---|
| Tag | numerischer Kalendertag |
| Wochentag | ausgeschriebener Wochentag, gegebenenfalls mit Feiertagsname |
| BD | manuell gewählter Bereitschaftsdienst |
| HG | manuell gewählter Hintergrunddienst |
| RBN | erstes frei beschreibbares RBN-Feld |
| 2. RBN | zweites frei beschreibbares RBN-Feld |
| Urlaub / FZA | kompakte tagesbezogene Abwesenheitsübersicht |
| Kein Dienst / Wünsche | kompakte tagesbezogene Wunschübersicht |

## Zellinteraktion

### Bereitschaftsdienst und Hintergrunddienst

Ein Klick auf die jeweilige Zelle öffnet die farbcodierte Personenauswahl.

### RBN

RBN-Felder werden direkt als Textfeld bearbeitet. Die Eingabe wird beim Verlassen beziehungsweise Ändern des Feldes übernommen.

### Urlaub, Freizeitausgleich und Wünsche

Ein Klick auf die jeweilige Zusammenfassungszelle öffnet den tagesbezogenen Bearbeitungsdialog.

## Tabellenraster

Die Zellgrenzen sind bewusst stärker ausgeprägt als in einer typischen Webanwendung. Dadurch bleibt die Darstellung auch bei längeren Namen, vielen Einträgen und gedruckten Plänen eindeutig.

## Horizontales Scrollen

Bei kleineren Bildschirmen bleibt die Tabelle vollständig erhalten und wird horizontal scrollbar. Spalten werden nicht automatisch entfernt oder semantisch zusammengelegt.

---

# Mitarbeitendenstamm und feste Auswahlreihenfolge

## Feste Planungsreihenfolge

Die Auswahlreihenfolge ist bewusst stabil und wird nicht nach Eignungsfarbe sortiert:

1. Dr. Lurz
2. Dr. Polednia
3. Fr. Dalitz
4. Dr. Becker
5. Fr. Hellmann
6. Dr. Martin
7. Hr. El Houba
8. Fr. Licenji
9. Hr. Sebastian

Die feste Reihenfolge verhindert, dass sich Namen bei jeder Regeländerung im Auswahlmenü verschieben.

## Prof. Schäfer

Prof. Schäfer ist:

- in der Abwesenheitsverwaltung enthalten
- nicht im Bereitschaftsdienst- oder Hintergrunddienstpool enthalten
- nicht Bestandteil der Dienstverteilungsstatistik

## Standarddaten

| Person | Rolle | Bereitschaftsdienst-Richtwert | Besonderheiten |
|---|---|---:|---|
| Dr. Lurz | Facharzt / Oberarzt | ungefähr 4 | Bereitschaftsdienst und Hintergrunddienst möglich |
| Dr. Polednia | Facharzt / Oberarzt | ungefähr 3 | dienstags und sonntags kein Bereitschaftsdienst oder Hintergrunddienst |
| Fr. Dalitz | Fachärztin / Oberärztin | ungefähr 4 | Sonderregel bei Hintergrunddienst an Sonntag oder Montag mit Bereitschaftsdienst von Hr. Sebastian |
| Dr. Becker | Fachärztin / Oberärztin | ungefähr 3 | Samstags-Bereitschaftsdienst nachrangig |
| Fr. Hellmann | Fachärztin | maximal 2 | ab 1. Oktober 2026 aktiv, maximal zwei Bereitschaftsdienste pro Monat, Hintergrunddienst zusätzlich möglich |
| Dr. Martin | Facharzt | ungefähr 4 | Bereitschaftsdienst und Hintergrunddienst möglich |
| Hr. El Houba | zunächst Assistenzarzt, später Facharzt | ungefähr 4 | Facharztstatus ab 22. September 2026 |
| Fr. Licenji | Assistenzärztin | ungefähr 4 | kein Hintergrunddienst, kein Samstags-Bereitschaftsdienst |
| Hr. Sebastian | Assistenzarzt | ungefähr 4 | kein Hintergrunddienst, kein Samstags-Bereitschaftsdienst |

Die Richtwerte sind mit Ausnahme des Maximums von Fr. Hellmann weiche Orientierungswerte.

---

# Manuelle Bereitschaftsdienst- und Hintergrunddienstplanung

## Bereitschaftsdienst

Der Bereitschaftsdienst wird in der Spalte `BD` geplant.

Der Auswahlprozess:

1. Zelle anklicken.
2. Personenauswahl öffnet sich.
3. Jede Person erhält eine Eignungsfarbe.
4. Gründe werden direkt unter dem Namen angezeigt.
5. Auswahl anklicken.
6. Bei roter Bewertung erscheint ein Bestätigungsdialog.
7. Nach Bestätigung wird die Einteilung gespeichert.

## Hintergrunddienst

Der Hintergrunddienst wird identisch in der Spalte `HG` geplant. Zusätzlich wird die fachärztliche Berechtigung geprüft.

## Löschen einer Einteilung

Im Auswahlfenster kann der vorhandene Eintrag über `Eintrag löschen` entfernt werden.

## Keine automatische Zuweisung

Es gibt keine Funktion, die:

- alle offenen Dienste automatisch besetzt
- Dienste zufällig verteilt
- eine mathematische Optimierung startet
- Personen automatisch tauscht
- freie Plätze repariert
- Sollzahlen automatisch erzwingt

---

# RBN-Felder

Die beiden RBN-Spalten sind bewusst von Bereitschaftsdienst und Hintergrunddienst getrennt.

## Eigenschaften

- freie Texteingabe
- keine Qualifikationsprüfung
- keine Abstandsprüfung
- keine Dienststatistik
- keine Wochenendäquivalente
- keine Konfliktfarbe
- Autovervollständigung aus bereits verwendeten Namen

## Vorschlagsliste

Ein neu eingegebener RBN-Name wird in die serverseitig gespeicherte Vorschlagsliste aufgenommen. Die Vorschlagsliste wird alphabetisch sortiert.

## Speicherzeitpunkt

Die RBN-Eingabe wird bei einer tatsächlichen Feldänderung gespeichert, nicht nach jedem einzelnen Tastendruck.

---

# Abwesenheiten

## Unterstützte Abwesenheitsarten

- Urlaub
- Freizeitausgleich oder frei
- Weiterbildung
- sonstige Abwesenheit

## Einzelpflege

Ein Klick auf die Spalte `Urlaub / FZA` öffnet die tagesbezogene Bearbeitung für alle Mitarbeitenden.

## Mehrtagespflege

Über die Toolbar-Schaltfläche `Abwesenheiten` kann eine Person ausgewählt werden. Anschließend können beliebige einzelne Tage markiert und gemeinsam mit einer Abwesenheitsart versehen werden.

Die Tage müssen keinen zusammenhängenden Zeitraum bilden.

## Darstellung in der Tabelle

Die Zusammenfassung verwendet kompakte Kennzeichnungen:

| Interner Typ | Darstellung |
|---|---|
| Urlaub | `U` |
| Freizeitausgleich / frei | `FZA` |
| Weiterbildung | `WB` |
| sonstige Abwesenheit | `abwesend` |

Beispiel:

```text
Lurz: U, Becker: WB
```

## Freizeitausgleich direkt nach Bereitschaftsdienst

Ein Freizeitausgleich am unmittelbaren Folgetag eines eigenen Bereitschaftsdienstes wird in der kompakten Tabellenspalte nicht angezeigt.

Wichtig:

- der Eintrag bleibt im Datenmodell gespeichert
- der Eintrag bleibt im Bearbeitungsdialog sichtbar
- der Eintrag bleibt für Regelprüfungen verfügbar
- es handelt sich nur um eine visuelle Entlastung der Tageszeile

---

# Dienstwünsche

## Negative Wünsche

- kein Bereitschaftsdienst
- kein Hintergrunddienst
- kein Dienst

## Positive Wünsche

- Bereitschaftsdienst bevorzugt
- Hintergrunddienst bevorzugt
- Dienst bevorzugt

## Darstellung

| Wunsch | Kompakte Anzeige |
|---|---|
| kein Bereitschaftsdienst | `kein BD` |
| kein Hintergrunddienst | `kein HG` |
| kein Dienst | `kein Dienst` |
| Bereitschaftsdienst bevorzugt | `+BD` |
| Hintergrunddienst bevorzugt | `+HG` |
| Dienst bevorzugt | `+Dienst` |

## Bearbeitung

Dienstwünsche können:

- tagesbezogen über die Tabellenzeile
- oder für mehrere einzelne Tage über die Toolbar

erfasst werden.

---

# Regelbewertung und Konfliktstufen

## Grün

Grün bedeutet:

- keine relevante Einschränkung erkannt
- oder positiver Wunsch passend zur gewählten Dienstform

Grün ist keine automatische Empfehlung im Sinne eines Autoplaners. Es signalisiert lediglich, dass keine höher gewichtete Regel greift.

## Gelb

Gelb kennzeichnet einen milden Hinweis. Die Einteilung kann ohne zusätzliche Bestätigung vorgenommen werden.

Beispiele:

- Bereitschaftsdienst-Richtwert erreicht
- erneuter Hintergrunddienst innerhalb von drei Kalendertagen
- Bereitschaftsdienst – Freizeitausgleich – Bereitschaftsdienst an Werktagen

## Orange

Orange kennzeichnet einen deutlichen Konflikt oder eine nachrangige Konstellation. Die Auswahl bleibt unmittelbar möglich.

Beispiele:

- weniger als drei dienstfreie Tage zwischen zwei Bereitschaftsdiensten
- Bereitschaftsdienst unmittelbar vor Urlaub
- Dienst an aufeinanderfolgenden Wochenenden
- Hintergrunddienst am Tag vor eigenem Bereitschaftsdienst

## Rot

Rot kennzeichnet einen erheblichen Konflikt. Die Person kann weiterhin eingeteilt werden, aber nur nach ausdrücklicher Bestätigung.

Beispiele:

- Abwesenheit am Diensttag
- kein-Dienst-Wunsch
- fehlende Qualifikation
- Bereitschaftsdienst an zwei aufeinanderfolgenden Tagen
- Überschreitung des Bereitschaftsdienstmaximums von Fr. Hellmann

## Grau

Grau kennzeichnet eine nicht aktive oder nicht planbare Person.

---

# Vollständige fachliche Regelmatrix

## Allgemeine Regeln

### Gleichzeitiger Bereitschaftsdienst und Hintergrunddienst

Dieselbe Person am selben Tag in Bereitschaftsdienst und Hintergrunddienst:

- Bewertung: rot
- Auswahl: nur nach Bestätigung

### Abwesenheit am Diensttag

Jede eingetragene Abwesenheit am geplanten Diensttag:

- Bewertung: rot

### Negative Wünsche

- kein Dienst bei Bereitschaftsdienst oder Hintergrunddienst: rot
- kein Bereitschaftsdienst bei Bereitschaftsdienst: rot
- kein Hintergrunddienst bei Hintergrunddienst: rot

### Positive Wünsche

- Bereitschaftsdienst bevorzugt bei Bereitschaftsdienst: grüne Begründung
- Hintergrunddienst bevorzugt bei Hintergrunddienst: grüne Begründung
- Dienst bevorzugt bei beiden Dienstformen: grüne Begründung

## Qualifikationsregeln

### Hintergrunddienst

Hintergrunddienst ist nur für Personen mit Facharztberechtigung zulässig.

Regelwidrige Auswahl:

- Bewertung: rot

### Samstags-Bereitschaftsdienst

Samstags-Bereitschaftsdienst ist nur für Fachärztinnen und Fachärzte zulässig.

Regelwidrige Auswahl:

- Bewertung: rot

### Hr. El Houba

Bis einschließlich 21. September 2026 gelten die Assistenzarztberechtigungen.

Ab 22. September 2026 gelten:

- Facharztrolle
- Hintergrunddienstberechtigung
- Berechtigung zum Samstags-Bereitschaftsdienst

## Personenspezifische Regeln

### Dr. Polednia

Dienstag und Sonntag:

- kein Bereitschaftsdienst
- kein Hintergrunddienst
- Bewertung: rot

### Dr. Becker

Samstags-Bereitschaftsdienst:

- Bewertung: orange
- Begründung: nur nachrangig

Nächster regulärer Werktag nach einem Samstags-Bereitschaftsdienst von Dr. Becker:

- erneuter Bereitschaftsdienst rot
- Hintergrunddienst wird durch diese Sonderregel nicht gesperrt

### Fr. Dalitz und Hr. Sebastian

Hintergrunddienst von Fr. Dalitz an Sonntag oder Montag bei gleichzeitigem Bereitschaftsdienst von Hr. Sebastian:

- Bewertung: orange

### Fr. Hellmann

- ab 1. Oktober 2026 in der Auswahl sichtbar
- maximal zwei Bereitschaftsdienste pro Monat
- Überschreitung: rot
- Hintergrunddienste zählen nicht in dieses Maximum

## Bereitschaftsdienstabstände

### Bereitschaftsdienst am Vortag

Bereitschaftsdienst derselben Person an zwei aufeinanderfolgenden Tagen:

- Bewertung: rot

### Weniger als drei dienstfreie Tage

Erneuter Bereitschaftsdienst mit weniger als drei dienstfreien Tagen seit dem letzten Bereitschaftsdienst:

- Bewertung: orange

### Bereitschaftsdienst – Freizeitausgleich – Bereitschaftsdienst

Wenn alle drei Tage Werktage sind und der mittlere Tag als Freizeitausgleich geführt wird:

- Bewertung: gelb

Diese Konstellation ersetzt in diesem konkreten Fall die sonst orange Abstandsmarkierung.

### Bereitschaftsdienst-Richtwert

Wenn der persönliche Monatsrichtwert bereits erreicht ist:

- Bewertung: gelb

### Bereitschaftsdienstmaximum

Wenn ein verbindliches Maximum bereits erreicht ist:

- Bewertung: rot

Aktuell betrifft dies Fr. Hellmann mit maximal zwei Bereitschaftsdiensten pro Monat.

### Bereitschaftsdienst vor Urlaub

Bereitschaftsdienst unmittelbar vor dem ersten Urlaubstag:

- Bewertung: orange

## Hintergrunddienstabstände

### Drei aufeinanderfolgende Hintergrunddienste

Dritter Hintergrunddienst an drei aufeinanderfolgenden Tagen:

- Bewertung: orange

### Erneuter Hintergrunddienst innerhalb von drei Kalendertagen

- Bewertung: gelb

### Hintergrunddienst am Tag vor eigenem Bereitschaftsdienst

- Bewertung: orange

Ausnahme:

- Freitag-Hintergrunddienst vor eigenem Samstags-Bereitschaftsdienst
- keine entsprechende Warnung aus dieser Regel

## Wochenendregeln

Ein Dienstwochenende umfasst Freitag bis Sonntag.

### Wochenendäquivalent

- mindestens ein Bereitschaftsdienst am Wochenende: `1,0`
- ausschließlich Hintergrunddienst am Wochenende: `0,5`
- Bereitschaftsdienst und Hintergrunddienst am selben Wochenende: insgesamt `1,0`
- mehrere Dienste desselben Typs erhöhen das Äquivalent nicht weiter

### Aufeinanderfolgende Wochenenden

Dienst am Wochenende direkt nach einem Dienstwochenende:

- normalerweise orange

Bereitschaftsdienstwochenende direkt nach einem Bereitschaftsdienstwochenende:

- rot

## Oster- und Pfingstalternanz

Osterblock:

- Karfreitag
- Karsamstag
- Ostersonntag
- Ostermontag

Pfingstblock:

- Pfingstsamstag
- Pfingstsonntag
- Pfingstmontag

Wenn dieselbe Person bereits im jeweils anderen Block Bereitschaftsdienst oder Hintergrunddienst hat:

- Bewertung: orange

## Becker-Martin-Abwesenheitskonflikt

Die Regelengine kann gleichzeitige werktägliche Abwesenheiten von Dr. Becker und Dr. Martin erkennen. Die aktuelle Hauptansicht enthält bewusst kein separates Prüfprotokoll. Die Abwesenheiten bleiben jedoch in der Datenstruktur vorhanden und stehen für regelbasierte Auswertungen zur Verfügung.

---

# Statistik unterhalb des Monatsplans

Die Statistik steht unmittelbar unter der Tabelle und nicht in einer Seitenleiste.

## Spalten

- Mitarbeitende
- Anzahl Bereitschaftsdienste
- Anzahl Hintergrunddienste
- Wochenendäquivalent
- Bereitschaftsdienst-Soll beziehungsweise Richtwert
- verbleibende Differenz zum Richtwert

## Offene Dienste

Eine zusätzliche Zeile `Offen` zeigt:

- Anzahl unbesetzter Bereitschaftsdienste
- Anzahl unbesetzter Hintergrunddienste

## Überschreitung

Ein negativer Restwert wird hervorgehoben.

## Nicht berücksichtigte Felder

RBN-Einträge werden nicht in der Statistik berücksichtigt.

Prof. Schäfer wird nicht in der Dienststatistik berücksichtigt.

---

# Gesetzliche Feiertage in Sachsen

Die Tabellenansicht markiert folgende implementierte Feiertage:

## Feste Feiertage

- Neujahr
- Tag der Arbeit
- Tag der Deutschen Einheit
- Reformationstag
- erster Weihnachtsfeiertag
- zweiter Weihnachtsfeiertag

## Bewegliche Feiertage

- Karfreitag
- Ostermontag
- Christi Himmelfahrt
- Pfingstmontag
- Buß- und Bettag

## Berechnung

Ostern wird algorithmisch für das jeweilige Jahr berechnet. Die davon abhängigen Feiertage werden durch feste Tagesabstände bestimmt.

Der Buß- und Bettag wird als Mittwoch vor dem 23. November berechnet.

## Nicht enthalten

Gemeindespezifische Sonderregelungen, beispielsweise Fronleichnam in einzelnen sächsischen Gemeinden, sind derzeit nicht Bestandteil der automatischen Markierung.

---

# Excel-Import

## Bibliothek

Der Excel-Import verwendet SheetJS, das im Browser über ein externes Content-Delivery-Network geladen wird.

## Unterstützte Monatsblätter

Es werden ausschließlich folgende Monatsblattnamen erkannt:

```text
Jan
Feb
Mrz
Apr
Mai
Jun
Jul
Aug
Sep
Okt
Nov
Dez
```

Andere Tabellenblätter, einschließlich separater Urlaubsübersichten, werden ignoriert.

## Erwartete Jahresplanerstruktur

Die Importlogik sucht:

1. eine Zeile mit mindestens zwanzig numerischen Kalendertagen ab der dritten Spalte
2. Mitarbeitendenzeilen mit `Arbeitsplatz` in der zweiten Spalte
3. unmittelbar darunter die zugehörige Zeile `Dienst/Hintergrund`

## Jahresbestimmung

Das Jahr wird aus den ersten Zellen der ersten beiden Tabellenzeilen gelesen. Wird dort kein vierstelliges Jahr erkannt, verwendet die Anwendung das aktuell gewählte Jahr.

## Dienstmarker

| Excel-Marker | Importziel |
|---|---|
| `D` | Bereitschaftsdienst |
| `HG` | Hintergrunddienst |

## Abwesenheitsmarker

| Excel-Marker | Importziel |
|---|---|
| `U` | Urlaub |
| `F` | Freizeitausgleich / frei |
| `FZA` | Freizeitausgleich / frei |
| `WB` | Weiterbildung |
| `K` | sonstige Abwesenheit |
| `KK` | sonstige Abwesenheit |
| `ZU` | sonstige Abwesenheit |
| `§15C` | sonstige Abwesenheit |
| `DR` | sonstige Abwesenheit |

## Namenszuordnung

Namen werden normalisiert:

- Mehrfachleerzeichen werden entfernt
- Groß- und Kleinschreibung werden vereinheitlicht
- fest definierte Namensvarianten werden den internen Personenkennungen zugeordnet

## Ergänzender Import

Der Import erzeugt zunächst ein leeres Monatsimportobjekt und führt dieses anschließend mit dem vorhandenen Monat zusammen.

Für Bereitschaftsdienst und Hintergrunddienst gilt:

- vorhandene Einträge bleiben bestehen
- importierte Einträge werden nur in leere Dienstfelder übernommen

Abwesenheiten werden entsprechend der erkannten Marker in die Abwesenheitsstruktur eingetragen.

## Aktuelle Begrenzung des Importdialogs

Die Anwendung zeigt nach dem Import eine textbasierte Zusammenfassung. Ein detaillierter zellweiser Konfliktvergleich mit Einzelentscheidung ist derzeit nicht implementiert.

## Speicherung importierter Monate

Jeder berührte Monat wird nach dem Import über die Monats-Programmierschnittstelle in Workers KV gespeichert.

---

# Excel-Export

Der aktuelle Monatsplan kann als Excel-Datei exportiert werden.

## Enthaltene Inhalte

- Monatsüberschrift
- Tag
- Wochentag
- Bereitschaftsdienst
- Hintergrunddienst
- erstes RBN-Feld
- zweites RBN-Feld
- Statistikzeilen

## Dateiname

```text
dienstplan_JJJJ_MM.xlsx
```

## Arbeitsblattname

```text
JJJJ-MM
```

## Einordnung

Der Export ist funktional und strukturiert. Er bildet derzeit nicht jede Formatierung der historischen Excel-Vorlage pixelgenau nach.

---

# PDF- und Druckausgabe

Die Schaltfläche `PDF exportieren` öffnet den Druckdialog des Browsers.

## Drucklayout

- A4
- Hochformat
- schmale Seitenränder
- ausgeblendete Toolbar
- ausgeblendeter Kopfbereich
- ausgeblendete Farblegenden
- reduzierte Zeilenhöhe
- ausgeblendete Bewertungs-Chips
- Statistik direkt unter dem Plan

## PDF-Erstellung

Die eigentliche PDF-Datei wird durch die PDF-Druckfunktion des Browsers erzeugt. Es existiert kein separater serverseitiger PDF-Generator.

---

# JSON-Sicherung und Wiederherstellung

## Export

Die JSON-Sicherung enthält:

- Einstellungen
- Mitarbeitendenstamm
- RBN-Vorschlagsliste
- gespeicherte Monatsdaten

Die Anwendung versucht zunächst, eine serverseitige Gesamtsicherung über `/api/export` abzurufen. Bei einem Fehler wird eine lokale Sicherung aus dem aktuellen Browserzustand erzeugt.

## Dateiname

```text
dienstplanrad_backup_JJJJ-MM-TT.json
```

## Import

Beim JSON-Import werden übernommen:

- Einstellungen
- Mitarbeitende
- RBN-Vorschläge
- Monate

Anschließend versucht die Anwendung, die Sicherung über `/api/import` auf dem Server zu speichern.

## Aktuelle Importstrategie

Die JSON-Wiederherstellung ersetzt die im Importobjekt enthaltenen Bereiche im aktuellen Anwendungszustand. Eine grafische Auswahl einzelner Monate ist derzeit nicht implementiert.

---

# Speicher- und Synchronisationsmodell

## Server-first-Start

Beim Öffnen eines Monats versucht die Anwendung zuerst, den aktuellen Stand von Cloudflare Workers KV zu laden.

Ablauf:

1. Bootstrap-Daten laden
2. ausgewählten Monat vom Server laden
3. Vormonat und Folgemonat im Hintergrund laden
4. lokalen Browserstand aktualisieren
5. Tabelle rendern

## Warum angrenzende Monate geladen werden

Vormonat und Folgemonat werden benötigt für:

- monatsübergreifende Bereitschaftsdienstabstände
- aufeinanderfolgende Dienstwochenenden
- Hintergrunddienst vor Bereitschaftsdienst
- Jahreswechsel

## Lokale Speicherung

Jeder geladene oder geänderte Monat wird zusätzlich in `localStorage` gespeichert.

Schlüsselstruktur:

```text
dienstplanrad:bootstrap
dienstplanrad:month:JJJJ-MM
```

## Automatische Speicherung

Änderungen werden mit einer kurzen Verzögerung gebündelt. Aktuell beträgt diese ungefähr 1,1 Sekunden.

Ablauf:

1. Änderung im Arbeitsspeicher
2. Zustand als geändert markieren
3. vorherigen Speichertimer zurücksetzen
4. neuen Speichertimer starten
5. Monat lokal speichern
6. Monat über die Pages Function speichern
7. Speicherstatus aktualisieren

## Revisionsnummer

Bei jeder Speicherung wird die Revisionsnummer des Monats erhöht.

## Zeitstempel

Bei jeder Speicherung wird `updatedAt` mit einem ISO-Zeitstempel aktualisiert.

## Offlinefall

Kann der Server nicht erreicht werden:

- wird der letzte lokale Monatsstand verwendet
- zeigt die Oberfläche den Offlinestatus
- bleiben Änderungen im Browser erhalten

## Parallelbearbeitung

Die Anwendung ist für einen planenden Nutzer konzipiert. Es existiert derzeit keine echte Transaktionssperre und kein grafischer Drei-Wege-Merge für parallele Browserinstanzen. Bei konkurrierenden Schreibvorgängen kann der zuletzt gespeicherte Stand gewinnen.

---

# Offlinebetrieb und Progressive Web Application

## Manifest

Die Datei `manifest.webmanifest` definiert:

- Anwendungsname
- Kurzname
- Startadresse
- Standalone-Anzeigemodus
- Hintergrundfarbe
- Themenfarbe
- Programmsymbole

## Service Worker

Der Service Worker verwendet den Cache:

```text
dienstplanrad-v5
```

## Vorgespeicherte Kernressourcen

- Startseite
- HTML-Datei
- Stylesheet
- Anwendungslogik
- Programmierschnittstellen-Client
- Standarddaten
- Regelengine
- Zustandsverwaltung
- Web-App-Manifest

## Navigationsstrategie

Für Seitenaufrufe gilt:

- zuerst Netzwerk
- bei Fehler Fallback auf gecachte Startseite

Dadurch wird beim normalen Öffnen bevorzugt die aktuelle Serverversion geladen.

## Ressourcenstrategie

Für sonstige GET-Anfragen gilt:

- zuerst Cache
- wenn nicht vorhanden Netzwerk
- erfolgreiche Netzwerkantwort im Cache ablegen

## Cachebereinigung

Bei Aktivierung eines neuen Service Workers werden ältere DienstplanRAD-Caches entfernt.

## SheetJS und Offlinebetrieb

Die Excel-Bibliothek wird extern geladen. Ist sie bei einer vollständig offline gestarteten Sitzung nicht verfügbar, zeigt die Anwendung beim Excel-Import oder Excel-Export einen entsprechenden Hinweis.

---

# Cloudflare-Pages-Functions-Programmierschnittstelle

## Bootstrap

```http
GET /api/bootstrap
```

Liefert:

- Einstellungen
- Mitarbeitendenstamm
- RBN-Vorschlagsliste

## Monat laden

```http
GET /api/month/:year/:month
```

Beispiel:

```http
GET /api/month/2026/09
```

## Monat speichern

```http
PUT /api/month/:year/:month
```

Der übermittelte Monat wird normalisiert und in Workers KV gespeichert.

## Einstellungen

```http
GET /api/settings
PUT /api/settings
```

## Mitarbeitendenstamm

```http
GET /api/staff
PUT /api/staff
```

## RBN-Vorschlagsliste

```http
GET /api/rbn-names
PUT /api/rbn-names
```

## Gesamtexport

```http
GET /api/export
```

Der aktuelle Endpunkt durchsucht die Jahre 2025 bis 2030.

## Gesamtimport

```http
POST /api/import
```

## Gemeinsame Hilfsfunktionen

`functions/_utils.js` stellt bereit:

- JSON-Antworten
- JSON-Requestverarbeitung
- Zugriff auf das KV-Binding
- Initialisierung fehlender Schlüssel
- JSON-Speicherung
- Standardsätze
- Monatsschlüssel
- Normalisierung des Monatsobjekts

---

# Workers-KV-Datenstruktur

## Anwendungsschlüssel

```text
app:settings
app:staff
app:rbn-names
```

## Monatsschlüssel

```text
year:JJJJ:month:MM
```

Beispiel:

```text
year:2026:month:09
```

## Binding

Die Pages Functions erwarten:

```text
DIENSTPLAN_KV
```

Fehlt das Binding, werfen die serverseitigen Funktionen den Fehler:

```text
KV Binding DIENSTPLAN_KV nicht vorhanden
```

---

# Datenmodell

## Monatsobjekt

```json
{
  "schemaVersion": 1,
  "year": 2026,
  "month": 9,
  "revision": 14,
  "updatedAt": "2026-07-29T08:00:00.000Z",
  "days": {},
  "absences": {},
  "preferences": {},
  "overrideLog": [],
  "importLog": []
}
```

## Tagesobjekt

```json
{
  "bd": "lurz",
  "hg": "becker",
  "rbn1": "Name 1",
  "rbn2": "Name 2",
  "notes": ""
}
```

## Abwesenheiten

```json
{
  "lurz": {
    "2026-09-14": "urlaub"
  }
}
```

## Dienstwünsche

```json
{
  "becker": {
    "2026-09-18": "kein-bd"
  }
}
```

## Bestätigte rote Konflikte

```json
{
  "timestamp": "2026-07-29T08:00:00.000Z",
  "dateIso": "2026-09-18",
  "role": "bd",
  "staffId": "becker",
  "reasons": [
    "Urlaub eingetragen"
  ],
  "comment": "Mit Mitarbeitender abgestimmt"
}
```

Der Kommentar ist optional.

---

# Projektstruktur

```text
/
├── README.md
├── _headers
├── index.html
├── manifest.webmanifest
├── package.json
├── styles.css
├── sw.js
├── icons/
│   └── icon.svg
├── js/
│   ├── api.js
│   ├── app.js
│   ├── defaults.js
│   ├── rules.js
│   └── state.js
└── functions/
    ├── _utils.js
    └── api/
        ├── bootstrap.js
        ├── export.js
        ├── import.js
        ├── rbn-names.js
        ├── settings.js
        ├── staff.js
        └── month/
            └── [year]/
                └── [month].js
```

## `index.html`

Enthält:

- App-Shell
- Kopfbereich
- Toolbar
- Monatsplan
- Statistikbereich
- Dialogstrukturen
- SheetJS-Einbindung
- Modulstart

## `styles.css`

Enthält:

- Aero-Peak- und Liquid-Glass-System
- Monatsfarbvariablen
- Tabellenraster
- Wochenend- und Feiertagsdarstellung
- Dialogdesign
- responsive Regeln
- Druckregeln

## `js/app.js`

Enthält:

- Benutzerinteraktion
- Monatsnavigation
- dynamische Monatsfarbthemen
- Feiertagsdarstellung Sachsen
- Tabellenrendering
- Personenauswahl
- Abwesenheiten und Wünsche
- RBN-Verwaltung
- Statistik
- Excel-Import und Excel-Export
- JSON-Sicherung
- Service-Worker-Registrierung

## `js/rules.js`

Enthält:

- Mitarbeitendenaktivität
- zeitabhängige Qualifikation
- Eignungsbewertung
- Abstandsregeln
- Wochenendregeln
- Oster- und Pfingstregeln
- Statistikberechnung
- Bezeichnungsfunktionen

## `js/state.js`

Enthält:

- globalen Anwendungszustand
- lokalen Browsercache
- Bootstrap-Ladevorgang
- Monatsladen
- Laden angrenzender Monate
- verzögertes Speichern
- Serverfallback

## `js/api.js`

Enthält den Browserclient für die Pages-Functions-Endpunkte.

## `js/defaults.js`

Enthält:

- Monatsnamen
- Tabellenblattnamen
- Wochentage
- Standardeinstellungen
- feste Mitarbeitendenreihenfolge
- Standardmitarbeitende
- Abwesenheitsarten
- Wunscharten
- Erzeugung leerer Monate

## `functions`

Enthält die serverseitigen Cloudflare-Pages-Functions.

---

# Deployment auf Cloudflare Pages

## Voraussetzungen

- Cloudflare-Konto
- Pages-Projekt `dienstplanrad`
- GitHub-Verknüpfung mit `mlurz92/dienstplan`
- Produktionsbranch `main`
- Workers-KV-Namespace `dienstplanrad-kv`
- Binding `DIENSTPLAN_KV`

## Binding einrichten

Im Cloudflare-Dashboard:

1. Workers & Pages öffnen.
2. Pages-Projekt `dienstplanrad` öffnen.
3. Einstellungen öffnen.
4. Bindings öffnen.
5. KV namespace hinzufügen.
6. Variablenname `DIENSTPLAN_KV` eintragen.
7. Namespace `dienstplanrad-kv` auswählen.
8. speichern.
9. neues Deployment auslösen.

## Build

Die Anwendung benötigt keinen klassischen Framework-Build. Die statischen Dateien liegen im Repositorystamm. Pages Functions werden aus dem Verzeichnis `functions` erkannt.

## Produktionsdeployment

Ein Merge nach `main` löst das Deployment aus.

---

# Sicherheits- und Datenschutzaspekte

## Kein Zugriffsschutz

Die Anwendung besitzt bewusst keinen Zugriffsschutz.

Das bedeutet:

- die Seitenadresse ist öffentlich erreichbar
- die Pages-Functions-Endpunkte sind öffentlich erreichbar
- Personen mit Kenntnis der Adresse können Daten lesen oder verändern

Ein ausschließlich im Browser hinterlegtes Passwort wäre kein wirksamer Schutz.

## Enthaltene Daten

Die Anwendung verarbeitet unter anderem:

- Namen von Mitarbeitenden
- Dienstzeiten
- Urlaubszeiten
- Freizeitausgleich
- Weiterbildungen
- Dienstwünsche

Diese Informationen sind personenbezogen und sollten entsprechend organisatorisch behandelt werden.

## Keine Patientendaten

Die Anwendung ist nicht für Patientendaten vorgesehen. Patientennamen, Diagnosen, Untersuchungsdaten oder andere Gesundheitsdaten dürfen nicht eingetragen werden.

## Sicherheitsheader

Die Datei `_headers` setzt für alle Pfade:

- `X-Frame-Options: SAMEORIGIN`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- eine restriktive Permissions Policy für Geolokalisierung, Mikrofon und Kamera

## Empfehlung für spätere Absicherung

Für einen produktiven Umgang mit Personaldaten wäre Cloudflare Access oder eine andere serverseitige Authentisierung empfehlenswert.

---

# Browser- und Systemanforderungen

Empfohlen werden aktuelle Versionen von:

- Google Chrome
- Microsoft Edge
- Mozilla Firefox
- Safari

Erforderliche Browserfunktionen:

- JavaScript-Module
- Fetch-Programmierschnittstelle
- `localStorage`
- HTML-Dialogelement
- Service Worker
- Cache Storage
- CSS-Hintergrundunschärfe für den vollständigen Glaseffekt
- moderne CSS-Funktionen wie `color-mix`

Fehlt `backdrop-filter`, bleibt die Anwendung funktional, wirkt jedoch weniger stark wie Liquid Glass.

---

# Bedienablauf im Regelbetrieb

## Monat öffnen

1. Anwendung aufrufen.
2. Serverstand wird geladen.
3. gewünschten Monat und gewünschtes Jahr auswählen.
4. Monatsfarbthema wird automatisch aktiviert.
5. gesetzliche Feiertage werden markiert.

## Abwesenheiten erfassen

1. `Abwesenheiten` auswählen.
2. Person auswählen.
3. Abwesenheitsart auswählen.
4. einzelne Tage anklicken.
5. `Übernehmen` auswählen.

Alternativ kann die Tageszeile direkt geöffnet werden.

## Dienstwünsche erfassen

1. `Dienstwünsche` auswählen.
2. Person auswählen.
3. Wunschtyp auswählen.
4. Tage markieren.
5. übernehmen.

## Bereitschaftsdienst eintragen

1. Zelle in der Spalte `BD` auswählen.
2. Begründungen prüfen.
3. Person auswählen.
4. roten Konflikt gegebenenfalls bestätigen.
5. automatische Speicherung abwarten.

## Hintergrunddienst eintragen

Analog zum Bereitschaftsdienst in der Spalte `HG`.

## RBN eintragen

1. RBN-Feld anklicken.
2. Text eingeben oder Vorschlag wählen.
3. Feld verlassen.

## Plan prüfen

1. offene Bereitschaftsdienste und Hintergrunddienste in der Statistik prüfen.
2. Dienstanzahlen und Wochenendäquivalente prüfen.
3. orange oder rote Bewertungs-Chips direkt im Plan kontrollieren.

## Export

- Excel für Weiterverarbeitung
- PDF über den Druckdialog
- JSON für vollständige technische Sicherung

---

# Fehlerbilder und Fehlerbehebung

## `KV Binding DIENSTPLAN_KV nicht vorhanden`

Ursache:

- KV-Binding fehlt
- falscher Variablenname
- Deployment wurde nach Einrichtung des Bindings nicht erneuert

Lösung:

- Binding prüfen
- exakt `DIENSTPLAN_KV` verwenden
- neues Deployment starten

## Anwendung zeigt Offlinestatus

Mögliche Ursachen:

- keine Netzwerkverbindung
- Pages Function nicht erreichbar
- KV-Fehler
- Deploymentfehler

Vorgehen:

1. Seite neu laden.
2. `Serverstand neu laden` auswählen.
3. Cloudflare-Deployment prüfen.
4. Binding prüfen.
5. Browserkonsole prüfen.

## Excel-Bibliothek nicht geladen

Symptom:

```text
Excel-Bibliothek noch nicht geladen.
```

Ursache:

- SheetJS-CDN nicht erreichbar
- vollständig offline gestartete Sitzung
- Browserblockade externer Skripte

Lösung:

- Netzwerkverbindung herstellen
- Seite neu laden
- Content-Blocker prüfen

## Alte Oberfläche bleibt sichtbar

Ursache:

- alter Service Worker oder Browsercache

Lösung:

1. Seite vollständig neu laden.
2. Browser schließen und neu öffnen.
3. gegebenenfalls Websitedaten löschen.
4. prüfen, ob der aktive Cache `dienstplanrad-v5` ist.

## Monat speichert nicht

Prüfen:

- Speicherstatus
- Netzwerk
- `/api/month/JJJJ/MM`
- KV-Binding
- Browserkonsole

## Person fehlt im Auswahlmenü

Mögliche Ursachen:

- Person ist noch nicht aktiv
- Person ist nicht im Planungsdienstpool
- Beschäftigungsende ist überschritten

Beispiel:

- Fr. Hellmann erscheint erst ab Oktober 2026.

---

# Bekannte funktionale Grenzen

- kein automatischer Dienstplan
- keine Benutzerverwaltung
- kein Zugriffsschutz
- keine echte Mehrbenutzersynchronisation
- keine serverseitige Konflikttransaktion
- keine zellweise Excel-Importvorschau
- keine grafische Auswahl einzelner JSON-Importmonate
- Excel-Export nicht vollständig pixelidentisch zur historischen Vorlage
- PDF-Erstellung über Browserdruck statt eigenem PDF-Generator
- RBN ohne fachliche Regelprüfung
- Jahresauswahl in der Oberfläche derzeit 2025 bis 2030
- serverseitiger Gesamtexport derzeit 2025 bis 2030
- keine gemeindespezifischen sächsischen Feiertage
- keine elektronische Signatur
- keine formale Planfreigabe
- kein schreibgeschützter Abschlussstatus
- keine automatische Freizeitausgleichseintragung
- keine automatische Dienstkopplung
- keine automatische Checkliste
- kein separates Prüfprotokoll in der Hauptansicht

---

# Qualitätssicherung und technische Prüfungen

Vor Veröffentlichung der aktuellen Version wurden durchgeführt:

- JavaScript-Syntaxprüfung von `js/app.js`
- JavaScript-Syntaxprüfung von `js/rules.js`
- JavaScript-Syntaxprüfung von `sw.js`
- JavaScript-Syntaxprüfung der dynamischen Monats-Page-Function
- Prüfung der relativen Importtiefe der dynamischen Monatsroute
- Prüfung der Monatsfarbvariablen
- Prüfung der Klassen für Samstag, Sonntag und Feiertag
- Prüfung der Feiertagsberechnung für mehrere Jahre
- Prüfung der Osterberechnung
- Prüfung des Buß- und Bettags
- Prüfung des Service-Worker-Cache-Namens
- Prüfung der Trennung von Excel-Raster und Glasrahmen

---

# Weiterentwicklung

Mögliche nächste Entwicklungsschritte:

- wirksamer Zugriffsschutz über Cloudflare Access
- Importvorschau mit zellweisem Konfliktvergleich
- exakter Nachbau des historischen Excel-Exportlayouts
- serverseitige Revisionserkennung bei parallelen Sitzungen
- benutzerdefinierbare Mitarbeitendenverwaltung
- benutzerdefinierbare Feiertage und klinikinterne Sondertage
- vollständig lokalisierte Farbanpassung
- automatisierte Browser-End-to-End-Tests
- automatisierte Regeltests
- automatische Sicherungsversionen
- selektive JSON-Wiederherstellung
- optionaler schreibgeschützter Monatsabschluss
- zugängliche Tastaturkurzbefehle

Die grundlegende Produktphilosophie sollte auch bei späteren Erweiterungen erhalten bleiben:

> Der Mensch plant. Die Anwendung strukturiert, prüft, dokumentiert und speichert.
