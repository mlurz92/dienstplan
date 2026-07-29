# DienstplanRAD

**DienstplanRAD** ist eine browserbasierte Anwendung zur manuellen Erstellung monatlicher radiologischer Bereitschafts- und Hintergrunddienstpläne. Sie bewahrt die direkte Übersicht einer klassischen Excel-Dienstplanung, ergänzt diese aber um kontextbezogene Regelhinweise, strukturierte Abwesenheits- und Wunschpflege, automatisch berechnete Statistik, Cloud-Speicherung, lokale Rückfallebenen, Excel- und JSON-Datenaustausch sowie eine druckoptimierte Ausgabe.

Die Anwendung ist bewusst **kein automatischer Dienstplanalgorithmus**. Sie weist keine Dienste selbstständig zu, führt keine Optimierungsläufe durch und ersetzt keine fachliche oder organisatorische Entscheidung. Jeder Name wird aktiv durch den planenden Nutzer ausgewählt. Die Regelengine erläutert Risiken und Präferenzen, verhindert die Auswahl aber grundsätzlich nicht; nur rote Konflikte erfordern eine ausdrückliche Bestätigung.

---

## Inhaltsverzeichnis

1. [Zielsetzung und Einsatzbereich](#zielsetzung-und-einsatzbereich)
2. [Leitprinzipien](#leitprinzipien)
3. [Produktionsumgebung](#produktionsumgebung)
4. [Funktionsumfang](#funktionsumfang)
5. [Benutzeroberfläche im Überblick](#benutzeroberflache-im-uberblick)
6. [Aero-Peak- und Liquid-Glass-Designsystem](#aero-peak--und-liquid-glass-designsystem)
7. [Animationen und Bewegung](#animationen-und-bewegung)
8. [Monatliche Kontrastfarbsysteme](#monatliche-kontrastfarbsysteme)
9. [Tabellarischer Monatsplan](#tabellarischer-monatsplan)
10. [Spalten und Datenfelder](#spalten-und-datenfelder)
11. [Monatsnavigation und Serverladen](#monatsnavigation-und-serverladen)
12. [Mitarbeitendenstamm](#mitarbeitendenstamm)
13. [Zeitabhängige Qualifikationen](#zeitabhangige-qualifikationen)
14. [Manuelle BD-Planung](#manuelle-bd-planung)
15. [Manuelle HG-Planung](#manuelle-hg-planung)
16. [RBN-Felder](#rbn-felder)
17. [Abwesenheiten](#abwesenheiten)
18. [FZA-Anzeigelogik](#fza-anzeigelogik)
19. [Dienstwünsche](#dienstwunsche)
20. [Einzel- und Mehrtagespflege](#einzel--und-mehrtagespflege)
21. [Farbige Regelbewertung](#farbige-regelbewertung)
22. [Vollständige Regelmatrix](#vollstandige-regelmatrix)
23. [BD-Abstände](#bd-abstande)
24. [Wochenendlogik](#wochenendlogik)
25. [Oster- und Pfingstlogik](#oster--und-pfingstlogik)
26. [Statistik](#statistik)
27. [Feiertage in Sachsen](#feiertage-in-sachsen)
28. [Excel-Import](#excel-import)
29. [Excel-Export](#excel-export)
30. [PDF- und Druckausgabe](#pdf--und-druckausgabe)
31. [JSON-Sicherung](#json-sicherung)
32. [Speicher- und Synchronisationsmodell](#speicher--und-synchronisationsmodell)
33. [Lokaler Browserstand](#lokaler-browserstand)
34. [Cloudflare Pages Functions](#cloudflare-pages-functions)
35. [Workers KV](#workers-kv)
36. [Datenmodell](#datenmodell)
37. [Progressive Web Application](#progressive-web-application)
38. [Service Worker](#service-worker)
39. [Responsive Verhalten](#responsive-verhalten)
40. [Tastatur und Barrierearmut](#tastatur-und-barrierearmut)
41. [Sicherheit und Datenschutz](#sicherheit-und-datenschutz)
42. [Projektstruktur](#projektstruktur)
43. [Deployment](#deployment)
44. [Qualitätssicherung](#qualitatssicherung)
45. [Fehlerbehebung](#fehlerbehebung)
46. [Bekannte Grenzen](#bekannte-grenzen)
47. [Pflege und Weiterentwicklung](#pflege-und-weiterentwicklung)
48. [Glossar](#glossar)

---

## Zielsetzung und Einsatzbereich

DienstplanRAD wurde für die monatliche Planung radiologischer Dienste mit einer kleinen, namentlich definierten Mitarbeitendengruppe entwickelt. Der primäre Anwendungsfall ist die manuelle Besetzung der täglichen Bereitschaftsdienste und Hintergrunddienste unter Berücksichtigung von Qualifikation, Abwesenheiten, Dienstwünschen, Wochenenden, Feiertagen, persönlichen Richtwerten und einigen personenspezifischen Sonderregeln.

Die Oberfläche orientiert sich absichtlich an der vorhandenen Excel-Dienstplanung:
- jeder Kalendertag entspricht einer Tabellenzeile
- Bereitschaftsdienst, Hintergrunddienst und RBN stehen in getrennten Spalten
- Urlaub, Freizeitausgleich und Wünsche werden direkt am jeweiligen Tag sichtbar
- die Statistik steht unmittelbar unter dem Monatsplan
- es gibt keine separate Checkliste und kein raumgreifendes Dashboard

Der Nutzen liegt nicht in einer automatischen Verteilung, sondern in einer schnelleren, sichereren und nachvollziehbareren manuellen Entscheidung.

## Leitprinzipien

- **Manuelle Entscheidungshoheit:** Die Anwendung schlägt keine fertigen Pläne vor. Jede Einteilung wird aktiv gewählt.
- **Nicht blockierende Regeln:** Auch orange oder rote Kandidaten bleiben auswählbar. Rote Einteilungen verlangen eine explizite Bestätigung.
- **Excel-nahe Dichte:** Der Monatsplan bleibt kompakt und zeilenorientiert. Dekorative Elemente dürfen die Lesbarkeit der Tabelle nicht beeinträchtigen.
- **Server-first beim Öffnen:** Beim Öffnen eines Monats wird zuerst der aktuelle Serverstand angefordert. Ist der Server nicht erreichbar, wird ein vorhandener lokaler Monatsstand verwendet.
- **Automatische Speicherung:** Änderungen werden nach einer kurzen Bündelungszeit lokal und über die Pages-Functions-Programmierschnittstelle in Workers KV gespeichert.
- **Transparente Hinweise:** Jede farbliche Bewertung besitzt eine textliche Begründung im Auswahlfenster und als Tooltip.
- **Keine versteckte FZA-Automatik:** Dienstbedingtes FZA wird nicht pauschal für alle Mitarbeitenden in der Tabelle erzeugt. Nur die ausdrücklich definierte Becker-Ausnahme wird visuell abgeleitet.

## Produktionsumgebung

| Komponente | Konfiguration |
|---|---|
| GitHub-Repository | `mlurz92/dienstplan` |
| Produktionsbranch | `main` |
| Cloudflare-Pages-Projekt | `dienstplanrad` |
| Produktionsadresse | `https://dienstplanrad.pages.dev` |
| Workers-KV-Namespace | `dienstplanrad-kv` |
| KV-Binding | `DIENSTPLAN_KV` |
| Feiertagsregion | Sachsen |
| Nutzung | ein planender Nutzer |
| Zugriffsschutz | kein Anwendungsschutz und keine Cloudflare-Access-Policy |

Jeder Merge in `main` löst über die bestehende GitHub-Verknüpfung ein Cloudflare-Pages-Deployment aus. Die statischen Dateien und die Pages Functions werden gemeinsam veröffentlicht.

## Funktionsumfang

- manuelle tägliche BD-Besetzung
- manuelle tägliche HG-Besetzung
- zwei freie RBN-Felder je Tag
- feste Mitarbeitendenreihenfolge
- zeitabhängige Aktivierung von Mitarbeitenden
- zeitabhängiger Qualifikationswechsel
- Urlaub, FZA/Frei, Weiterbildung und sonstige Abwesenheit
- negative und positive Dienstwünsche
- Einzel- und Mehrtagesbearbeitung
- farbcodierte Kandidatenbewertung
- Pflichtbestätigung bei roten Konflikten
- optionaler Kommentar zu roten Übersteuerungen
- Monatsstatistik direkt unter dem Plan
- Wochenendäquivalente
- Sachsen-Feiertage einschließlich beweglicher Feiertage
- zwölf monatlich wechselnde Kontrastfarbsysteme
- Excel-Import
- Excel-Export
- A4-Druckansicht und PDF über den Browser
- vollständige JSON-Sicherung
- serverseitige KV-Persistenz
- lokale Browserkopie
- installierbare Progressive Web Application
- Service-Worker-Cache für Kernressourcen

## Benutzeroberfläche im Überblick

### Kopfbereich

Der schwebende Kopfbereich enthält die Produktmarke `DR`, den Klinikbezug, den Anwendungsnamen, eine kurze Funktionsbeschreibung, die Monats- und Jahresnavigation sowie den sichtbaren Speicherstatus.

### Toolbar

Die Toolbar fasst die Arbeitsaktionen in zwei Gruppen zusammen:
- **Planung und Pflege:** aktueller Monat, Abwesenheiten, Dienstwünsche, Serverstand neu laden
- **Datenaustausch:** Excel importieren, Excel exportieren, PDF exportieren, JSON sichern, JSON laden

### Monatsblatt

Das Monatsblatt ist die zentrale Arbeitsfläche. Es besteht aus der eigentlichen Dienstplantabelle und der darunterliegenden Statistik. Es gibt keine seitliche Statistik, keine Checkliste und kein separates Prüfprotokoll.

### Dialoge

- Personenauswahl für BD und HG
- tagesbezogene Abwesenheits- und Wunschpflege
- Mehrfachauswahl für mehrere Kalendertage
- Bestätigungsdialog für rote Konflikte

## Aero-Peak- und Liquid-Glass-Designsystem

Das Design verbindet eine nüchterne Excel-Tabelle mit einem schwebenden, halbtransparenten Anwendungsrahmen. Die Tabelle bleibt bewusst deckender als die Umgebung, damit Namen, Kürzel und Konfliktmarkierungen schnell gelesen werden können.

### Glasflächen

- halbtransparente Flächen mit mehrschichtigen linearen Verläufen
- Hintergrundunschärfe über `backdrop-filter`
- erhöhte Farbsättigung hinter Glasflächen
- helle obere Reflexionskante
- dezente innere Schatten
- weiche, tiefe Außenschatten
- monatsabhängiger Farbschein in den Fensterflächen

### Schwebende Umgebung

Drei große, unscharfe Lichtkörper bewegen sich langsam im Hintergrund. Ihre Farbe greift die jeweilige Monatsfarbe auf. Die Lichtkörper sind rein dekorativ, blockieren keine Interaktion und werden in der Druckansicht vollständig ausgeblendet.

### Bedienelemente

- glänzende obere Lichtzone
- sanfter Höhenversatz beim Überfahren
- kurze, nicht aufdringliche Schattenanimation
- deutliche Fokusmarkierung
- farblich mit dem Monat harmonisierte Fokusfarbe

### Tabellenpriorität

Innerhalb des Tabellenrasters werden die Glaseffekte bewusst reduziert. Die Zellgrenzen bleiben dunkel, die Zeilenhöhen kompakt und die Eingabeflächen flach. Damit bleibt der Plan in seiner Informationsdichte näher an Excel als an einem Dashboard.

## Animationen und Bewegung

- **Fensteraufbau:** Kopfbereich, Toolbar und Monatsblatt erscheinen mit einer kurzen vertikalen Einblendung.
- **Zeilenaufbau:** Die Kalendertage erscheinen mit sehr kurzem, gestaffeltem Versatz.
- **Hintergrundbewegung:** Die drei Lichtkörper driften langsam und unabhängig voneinander.
- **Reflexionsbewegung:** Eine diffuse Lichtreflexion bewegt sich sehr langsam über Glasflächen.
- **Speicherstatus:** Der Statuspunkt pulsiert dezent.
- **Dialogöffnung:** Dialoge blenden aus leichter Unschärfe und geringem Größenversatz ein.
- **Interaktionsfeedback:** Auswahlkarten, Mehrtagesfelder und Metadaten-Chips heben sich beim Überfahren minimal an.

Bei aktivierter Betriebssystemeinstellung **Bewegung reduzieren** werden Animationen und Übergänge praktisch vollständig deaktiviert.

## Monatliche Kontrastfarbsysteme

Jeder Monat besitzt ein eigenes harmonisches Farbsystem. Innerhalb dieses Systems werden Samstag, Sonntag und gesetzlicher Feiertag in unterschiedlichen Intensitäten und Kontraststufen dargestellt. Die Grundfarbe wechselt mit jedem Monat, während die Hierarchie gleich bleibt: Samstag ist die leichteste, Sonntag die stärkere und Feiertag die markanteste Variante.

| Monat | Thema | Charakter |
|---|---|---|
| Januar | Eisblau | kühl und klar |
| Februar | Rubinrose | gedämpftes Rosa und Rubin |
| März | Salbeigrün | ruhiges Frühlingsgrün |
| April | Lavendel | kühles Violett |
| Mai | Frühlingsgrün | helles Blattgrün |
| Juni | Türkis | frisches Blaugrün |
| Juli | Koralle | warme Koralltöne |
| August | Bernstein | goldene Sommertöne |
| September | Pflaume | gedecktes Violett |
| Oktober | Kupfer | warme Kupfer- und Erdtöne |
| November | Schieferblau | ruhiges Blau-Grau |
| Dezember | Tannengrün und Rubin | winterliches Grün mit festlichem Feiertagsakzent |

Die Monatsfarbe steuert außerdem Hintergrundlicht, Fokusrahmen, ausgewählte Mehrtagesfelder, die Monatsplakette und Teile der Glasreflexion.

## Tabellarischer Monatsplan

Jeder Kalendertag wird als eigene Zeile gerendert. Die Tabelle bleibt horizontal scrollbar, wenn das verfügbare Fenster schmaler als die definierte Mindestbreite ist. Die Tabellenüberschrift bleibt beim vertikalen Scrollen fixiert.

### Zeilenklassen

- Werktag ohne Feiertag: neutrale Tabellenfarbe
- Samstag: leichte Monatskontrastfarbe
- Sonntag: stärkere Monatskontrastfarbe
- Feiertag: markanteste Monatskontrastfarbe und Feiertagsname im Wochentagsfeld

### Hover- und Fokusverhalten

Beim Überfahren wird eine Zeile nur minimal hervorgehoben. Es erfolgt keine Größenänderung der Zellen. Eingabefelder und Schaltflächen erhalten eine klare, monatsfarbene Fokusmarkierung für Tastaturbedienung.

## Spalten und Datenfelder

| Spalte | Inhalt | Bedienung |
|---|---|---|
| Tag | numerischer Kalendertag | nicht editierbar |
| Wochentag | ausgeschriebener Wochentag und gegebenenfalls Feiertagsname | nicht editierbar |
| BD | Bereitschaftsdienst | Klick öffnet die farbbewertete Personenauswahl |
| HG | Hintergrunddienst | Klick öffnet die farbbewertete Personenauswahl |
| RBN | erstes freies RBN-Feld | direkte Texteingabe mit Vorschlagsliste |
| 2. RBN | zweites freies RBN-Feld | direkte Texteingabe mit Vorschlagsliste |
| Urlaub / FZA | kompakte Abwesenheitszusammenfassung | Klick öffnet die Tagespflege |
| Kein Dienst / Wünsche | kompakte Wunschzusammenfassung | Klick öffnet die Tagespflege |

## Monatsnavigation und Serverladen

Der Monat kann mit Pfeiltasten, Monatsauswahl und Jahresauswahl gewechselt werden. Beim Öffnen eines Monats wird zuerst die Pages-Functions-Programmierschnittstelle abgefragt. Der geladene Serverstand ersetzt den im Browser gespeicherten Stand dieses Monats.

Ist der Server nicht erreichbar, verwendet die Anwendung eine vorhandene lokale Monatskopie. Fehlt auch diese, wird ein leerer Monatsdatensatz erzeugt. Zusätzlich werden der vorherige und der nächste Monat geladen, damit monatsübergreifende Regeln ohne sichtbare Unterbrechung arbeiten können.

## Mitarbeitendenstamm

| Reihenfolge | Person | Rolle beziehungsweise Status | BD-Richtwert | Besonderheit |
|---:|---|---|---:|---|
| 1 | Dr. Lurz | FA/OA | 4 | BD, HG und Samstags-BD möglich |
| 2 | Dr. Polednia | FA/OA | 3 | dienstags und sonntags weder BD noch HG |
| 3 | Fr. Dalitz | FÄ/OÄ | 4 | Sonderhinweis bei Sebastian-BD an Sonntag oder Montag |
| 4 | Dr. Becker | FÄ/OÄ | 3 | Samstags-BD nachrangig; nächster regulärer Werktag FZA und kein BD |
| 5 | Fr. Hellmann | FÄ, 50 Prozent | 2 | ab 1. Oktober 2026; maximal zwei BD pro Monat |
| 6 | Dr. Martin | FA | 4 | BD, HG und Samstags-BD möglich |
| 7 | Hr. El Houba | AA bis 21. September 2026, danach FA | 4 | Qualifikation wechselt datumsgesteuert |
| 8 | Fr. Licenji | AÄ | 4 | kein HG und kein Samstags-BD |
| 9 | Hr. Sebastian | AA | 4 | kein HG und kein Samstags-BD |

**Prof. Schäfer** steht ausschließlich in der Abwesenheitsverwaltung zur Verfügung. Er erscheint weder in BD-/HG-Auswahlmenüs noch in der Statistik.

## Zeitabhängige Qualifikationen

- **Fr. Hellmann:** erst ab dem 1. Oktober 2026 im aktiven Dienstpool sichtbar.
- **Hr. El Houba:** bis einschließlich 21. September 2026 Assistenzarzt; ab 22. September 2026 Facharzt mit HG- und Samstags-BD-Berechtigung.
- Aktive Zeiträume werden bereits beim Aufbau der Personenauswahl berücksichtigt.

## Manuelle BD-Planung

Ein Klick in eine BD-Zelle öffnet die Personenauswahl in der fest definierten Reihenfolge. Jede Person wird mit aktueller Bewertungsfarbe, Kurzlabel und allen zutreffenden Gründen dargestellt. Die Auswahl wird niemals aufgrund einer Regel vollständig gesperrt.

Nach Auswahl wird der Name unmittelbar in die Zelle übernommen, die Monatsstatistik neu berechnet und die automatische Speicherung geplant.

## Manuelle HG-Planung

Die HG-Bedienung entspricht der BD-Bedienung. Die Bewertungslogik berücksichtigt zusätzlich die Facharztqualifikation, kurze HG-Abstände, die definierte Dreierfolge, den Tag vor eigenem BD, Wochenendbelastungen und die Oster-/Pfingstalternanz.

## RBN-Felder

RBN und 2. RBN sind freie Textfelder ohne BD-/HG-Regelprüfung und ohne Statistik. Beim Verlassen eines Feldes wird der Text gespeichert. Neue, noch unbekannte Einträge werden der RBN-Vorschlagsliste hinzugefügt und serverseitig gespeichert.

Die Vorschlagsliste dient ausschließlich der schnelleren Texteingabe. Sie begrenzt die Eingabe nicht.

## Abwesenheiten

Unterstützte Abwesenheitsarten:
- Urlaub
- FZA/Frei
- Weiterbildung
- sonstige Abwesenheit

Abwesenheiten können tagesbezogen oder über die Mehrtagesauswahl gepflegt werden. Manuelle Eingaben werden mit der Quelle `manual` gespeichert. Aus Excel importierte Einträge erhalten die Quelle `import`. Ältere Datensätze ohne Quellenfeld bleiben kompatibel und gelten als Einträge unbekannter Herkunft.

## FZA-Anzeigelogik

Die Spalte **Urlaub / FZA** unterscheidet zwischen echter beziehungsweise manuell gepflegter Abwesenheit und einem typischen dienstbedingten Ausgleichseintrag.

### Grundregel

Es wird **kein allgemeines automatisches FZA nach BD** in die Tabelle geschrieben. Importierte oder ältere FZA-Einträge, die auf dem ersten regulären Werktag nach einem eigenen BD liegen, werden in der kompakten Tabellenspalte nicht angezeigt. Damit erscheinen keine automatischen Einträge wie `Lurz: FZA`, `Polednia: FZA` oder vergleichbare Nachdienstmarker.

### Manuell gepflegtes FZA

Ein bewusst über die Anwendung manuell gesetztes FZA bleibt sichtbar, auch wenn es zeitlich nach einem BD liegt. Die Quelleninformation verhindert, dass eine echte manuelle Planung irrtümlich ausgeblendet wird.

### Becker-Ausnahme

Hat **Dr. Becker an einem Samstag BD**, wird am **nächsten regulären Werktag** ein FZA-Vermerk `Becker: FZA` angezeigt. Regulärer Werktag bedeutet Montag bis Freitag unter Ausschluss gesetzlicher Feiertage in Sachsen. Fällt der Montag auf einen Feiertag, wandert die Anzeige auf den nächsten regulären Werktag.

Der Becker-Vermerk ist eine **abgeleitete Anzeige**. Er wird nicht als zusätzliche Abwesenheit in den Monatsdatensatz geschrieben. Besteht für Becker an diesem Tag bereits eine andere explizite Abwesenheit, wird diese explizite Abwesenheit angezeigt und nicht durch den abgeleiteten FZA-Vermerk überschrieben.

## Dienstwünsche

Unterstützte Wunschtypen:
- Kein BD
- Kein HG
- Kein Dienst
- BD bevorzugt
- HG bevorzugt
- Dienst bevorzugt

Negative Wünsche führen in der passenden Dienstart zu einer roten Bewertung. Positive Wünsche erzeugen eine grüne Begründung, überschreiben aber keine höher priorisierte Warnung.

## Einzel- und Mehrtagespflege

### Tagesdialog

Ein Klick auf die Abwesenheits- oder Wunschspalte öffnet für den gewählten Tag eine Liste aller abwesenheitsberechtigten Personen. Abwesenheit und Dienstwunsch werden getrennt gepflegt.

### Mehrfachauswahl

Über die Toolbar kann eine Person, ein Typ und eine beliebige Menge einzelner Tage gewählt werden. Die Tage müssen nicht zusammenhängen. Samstag, Sonntag und Feiertag übernehmen im Auswahlraster dieselbe Monatskontrastfarbe wie im Hauptplan.

## Farbige Regelbewertung

| Stufe | Bedeutung | Auswahl |
|---|---|---|
| Grün | geeignet oder positive Präferenz | direkt möglich |
| Gelb | Hinweis beziehungsweise kurze Belastungsfolge | direkt möglich |
| Orange | deutlicher organisatorischer Konflikt | direkt möglich |
| Rot | starker Konflikt oder Qualifikationsproblem | nur nach Bestätigung |
| Grau | nicht aktiv oder nicht im Dienstpool | nur in internen Sonderfällen |

Treffen mehrere Gründe gleichzeitig zu, bestimmt die höchste Stufe die sichtbare Gesamtfarbe. Sämtliche Gründe bleiben im Auswahlfenster sichtbar.

## Vollständige Regelmatrix

| Regel | BD | HG | Stufe |
|---|---|---|---|
| Person am Tag abwesend | ja | ja | Rot |
| Wunsch Kein Dienst | ja | ja | Rot |
| Wunsch Kein BD | ja | nein | Rot |
| Wunsch Kein HG | nein | ja | Rot |
| Positive Präferenz | passend | passend | Grün |
| gleiche Person am selben Tag bereits in anderer Dienstart | ja | ja | Rot |
| Samstags-BD ohne Facharztqualifikation | ja | nein | Rot |
| HG ohne Facharztqualifikation | nein | ja | Rot |
| Polednia Dienstag oder Sonntag | ja | ja | Rot |
| Becker Samstags-BD | ja | nein | Orange |
| Dalitz So/Mo-HG bei Sebastian-BD | nein | ja | Orange |
| Hellmann BD-Maximum erreicht | ja | nein | Rot |
| persönlicher BD-Richtwert erreicht | ja | nein | Gelb |
| BD unmittelbar vor Urlaub | ja | nein | Orange |
| Becker nächster regulärer Werktag nach Samstags-BD | ja | nein | Rot |
| BD am Vortag | ja | nein | Gelb |
| BD–FZA–BD werktags | ja | nein | Gelb |
| anderer kurzer BD-Abstand | ja | nein | Gelb |
| dritter HG an drei aufeinanderfolgenden Tagen | nein | ja | Orange |
| erneuter HG innerhalb von drei Kalendertagen | nein | ja | Gelb |
| HG am Tag vor eigenem BD | nein | ja | Orange |
| Freitag-HG vor eigenem Samstags-BD | nein | ja | zulässige Ausnahme |
| Dienst an aufeinanderfolgenden Wochenenden | ja | ja | Orange |
| BD-Wochenende direkt nach BD-Wochenende | ja | nein | Rot |
| Dienst sowohl im Oster- als auch im Pfingstblock | ja | ja | Orange |

## BD-Abstände

Kurze BD-Abstände werden **nicht allein wegen des Abstands orange oder rot** bewertet.

- BD am direkt vorherigen Kalendertag: gelber Hinweis
- BD–FZA–BD an Werktagen: gelber Hinweis
- anderer Abstand von weniger als drei Kalendertagen: gelber Hinweis

Eine rote oder orange Gesamtfarbe kann trotzdem entstehen, wenn gleichzeitig ein anderer unabhängiger Grund vorliegt, beispielsweise Urlaub, fehlende Qualifikation, ein aufeinanderfolgendes BD-Wochenende oder die Becker-Sonderregel.

## Wochenendlogik

Ein Wochenende umfasst Freitag bis Sonntag. Pro Person und Wochenende wird für die Statistik höchstens ein Äquivalent gezählt:
- mindestens ein BD: `1,0`
- ausschließlich HG: `0,5`
- BD und HG am selben Wochenende: insgesamt `1,0`

Ein Dienst am direkt folgenden Wochenende erzeugt einen orangefarbenen Hinweis. Zwei direkt aufeinanderfolgende Wochenenden mit jeweils BD erzeugen einen roten Hinweis.

## Oster- und Pfingstlogik

Der Osterblock umfasst Karfreitag bis Ostermontag. Der Pfingstblock umfasst Pfingstsamstag bis Pfingstmontag. Hat eine Person bereits BD oder HG in einem Block, wird eine Einteilung im jeweils anderen Block orange markiert.

## Statistik

Die Statistik steht direkt unter dem Monatsplan und wird bei jeder Änderung neu aufgebaut. Sie enthält je aktiver Person:
- Anzahl BD
- Anzahl HG
- Wochenendäquivalente
- persönliches BD-Soll
- Differenz zwischen Soll und aktueller BD-Anzahl

Eine zusätzliche Zeile `Offen` zeigt die noch unbesetzten BD- und HG-Zellen des Monats.

## Feiertage in Sachsen

Die Anwendung berechnet folgende gesetzliche Feiertage:
- Neujahr
- Karfreitag
- Ostermontag
- Tag der Arbeit
- Christi Himmelfahrt
- Pfingstmontag
- Tag der Deutschen Einheit
- Reformationstag
- Buß- und Bettag
- 1. Weihnachtsfeiertag
- 2. Weihnachtsfeiertag

Ostern wird algorithmisch bestimmt. Der Buß- und Bettag wird als Mittwoch vor dem 23. November berechnet. Feiertage erhalten eine eigene Zeilenklasse und werden im Wochentagsfeld namentlich angezeigt.

## Excel-Import

Der Excel-Import verwendet SheetJS im Browser. Berücksichtigt werden Monatsblätter mit den Namen `Jan`, `Feb`, `Mrz`, `Apr`, `Mai`, `Jun`, `Jul`, `Aug`, `Sep`, `Okt`, `Nov` und `Dez`. Andere Blätter, insbesondere separate Urlaubsübersichten, werden ignoriert.

### Erkennung der Mitarbeitendenblöcke

Ein Mitarbeitendenblock wird über eine Zeile mit dem Typ `Arbeitsplatz` erkannt. Die direkt folgende Zeile wird als `Dienst/Hintergrund` interpretiert. Die Position im Blatt ist nicht auf feste Zeilennummern angewiesen.

### Erkannte Marker

| Excel-Marker | Ziel |
|---|---|
| D | BD |
| HG | HG |
| U | Urlaub |
| F oder FZA | FZA/Frei |
| WB | Weiterbildung |
| K, KK, ZU, §15C, DR | sonstige Abwesenheit |

### Ergänzendes Merge-Verhalten

Jeder importierte Monat wird zunächst als isolierter leerer Monatsdatensatz aufgebaut. Danach werden Daten ergänzend in den vorhandenen Zielmonat übernommen. Vorhandene BD- oder HG-Einträge werden nicht überschrieben, wenn die Zielzelle bereits belegt ist. Abwesenheiten und Wünsche werden nach Person und Datum ergänzt.

Importierte Abwesenheiten erhalten die Quellenkennung `import`. Diese Information wird insbesondere für die FZA-Anzeigelogik verwendet.

## Excel-Export

Der Export erzeugt eine Arbeitsmappe für den aktuell geöffneten Monat. Enthalten sind Titel, Tag, Wochentag, BD, HG, erstes RBN, zweites RBN sowie eine Statistiksektion. Der Dateiname folgt dem Schema `dienstplan_JJJJ_MM.xlsx`.

Der Export ist funktional und kompakt. Eine vollständig pixelgenaue Reproduktion sämtlicher historischer Excel-Formatdetails ist kein Bestandteil des aktuellen Codes.

## PDF- und Druckausgabe

Die Schaltfläche PDF exportieren öffnet die Browserdruckfunktion. Das Druckstylesheet:
- blendet Kopfbereich, Toolbar, Animationen und dekorative Hintergrundelemente aus
- setzt A4-Hochformat
- reduziert Zeilenhöhe und Schriftgröße
- behält die Tabelle und Statistik bei
- verwendet feste Druckfarben für Samstag, Sonntag und Feiertag

## JSON-Sicherung

Die JSON-Sicherung enthält Einstellungen, Mitarbeitendenstamm, RBN-Vorschlagsliste und alle vom Server exportierten Monatsdatensätze. Ist der Serverexport nicht erreichbar, wird ersatzweise der aktuell im Browser gehaltene Zustand exportiert.

Beim JSON-Import werden vorhandene Einstellungen, Mitarbeitende, RBN-Namen und Monatsdaten in den Browserzustand übernommen. Anschließend versucht die Anwendung, die Sicherung über `/api/import` auch serverseitig zu speichern.

## Speicher- und Synchronisationsmodell

Änderungen wirken sofort im Arbeitsspeicher. Nach etwa 1,1 Sekunden ohne weitere Änderung wird ein Speichervorgang ausgelöst. Dabei wird der aktuelle Monatsdatensatz mit neuem Zeitstempel und erhöhter Revision zunächst in `localStorage` geschrieben und anschließend per `PUT` an die Monatsroute übertragen.

Sichtbare Zustände:
- `Lädt …`
- `Speichert …`
- `Gespeichert`
- `Offline – lokaler Stand`
- `Offline gespeichert`

Das System ist für einen planenden Nutzer ausgelegt. Es gibt keine echte Mehrbenutzer-Sperre, keine zeilenweise Transaktion und keine grafische Konfliktauflösung zwischen gleichzeitig geöffneten Browsern.

## Lokaler Browserstand

Verwendete lokale Schlüssel:
- `dienstplanrad:bootstrap` für Einstellungen, Mitarbeitende und RBN-Namen
- `dienstplanrad:month:JJJJ-MM` für einzelne Monatsdatensätze

Der lokale Stand dient als Rückfalloption, wenn die Serverabfrage fehlschlägt. Beim erfolgreichen Serverladen wird die lokale Monatskopie durch den Serverstand aktualisiert.

## Cloudflare Pages Functions

| Methode | Route | Aufgabe |
|---|---|---|
| GET | `/api/bootstrap` | Einstellungen, Mitarbeitende und RBN-Namen laden |
| GET | `/api/month/:year/:month` | Monat laden oder initialisieren |
| PUT | `/api/month/:year/:month` | Monat speichern |
| GET/PUT | `/api/settings` | Einstellungen lesen oder schreiben |
| GET/PUT | `/api/staff` | Mitarbeitendenstamm lesen oder schreiben |
| GET/PUT | `/api/rbn-names` | RBN-Vorschlagsliste lesen oder schreiben |
| GET | `/api/export` | Gesamtsicherung erzeugen |
| POST | `/api/import` | Gesamtsicherung serverseitig einspielen |

Die dynamische Monatsroute importiert die gemeinsamen Hilfsfunktionen über den korrekten relativen Pfad `../../../../_utils.js`.

## Workers KV

Die Pages Functions erwarten das Binding `DIENSTPLAN_KV`. Wesentliche Schlüssel:
- `app:settings`
- `app:staff`
- `app:rbn-names`
- `year:JJJJ:month:MM`

Workers KV ist für das einbenutzerorientierte Nutzungskonzept ausreichend. Es ist jedoch keine relationale Datenbank und stellt keine transaktionale Mehrbenutzerbearbeitung bereit.

## Datenmodell

### Monatsdatensatz

```json
{
  "schemaVersion": 1,
  "year": 2026,
  "month": 9,
  "revision": 12,
  "updatedAt": "2026-07-29T09:30:00.000Z",
  "days": { "2026-09-01": { "bd": "", "hg": "", "rbn1": "", "rbn2": "", "notes": "" } },
  "absences": {},
  "absenceSources": {},
  "preferences": {},
  "overrideLog": [],
  "importLog": []
}
```

### Abwesenheitsquellen

- `manual`: bewusst über Tages- oder Mehrtagesdialog gesetzt
- `import`: aus einem Excel-Jahresplaner übernommen
- leer: historischer Datensatz ohne Quelleninformation

### Bestätigte rote Konflikte

Der `overrideLog` speichert Zeitstempel, Datum, Dienstart, Person, Regelgründe und optionalen Kommentar.

## Progressive Web Application

Das Manifest definiert DienstplanRAD als eigenständig startbare Progressive Web Application. Es verwendet das vorhandene Symbol `/icons/icon.svg`, einen neutralen dunklen Grundton und den Anzeigemodus `standalone`.

## Service Worker

Der Service Worker verwendet den Cache `dienstplanrad-v6`. Kernressourcen:
- `/`
- `/index.html`
- `/styles.css`
- `/js/app.js`
- `/js/api.js`
- `/js/defaults.js`
- `/js/rules.js`
- `/js/state.js`
- `/manifest.webmanifest`
- `/icons/icon.svg`

Navigationsanfragen werden network-first behandelt; bei Ausfall wird die gespeicherte Startseite verwendet. Andere GET-Anfragen werden cache-first behandelt und nach erfolgreichem Abruf in den Cache übernommen. Alte Cache-Versionen werden bei Aktivierung gelöscht.

## Responsive Verhalten

Auf schmalen Bildschirmen werden Kopfbereich und Toolbar untereinander angeordnet. Monats- und Jahresfelder wachsen auf die verfügbare Breite. Die Regellegende wird ausgeblendet, der Monatsplan bleibt horizontal scrollbar. Die Mehrtagesauswahl reduziert ihre Spaltenzahl.

## Tastatur und Barrierearmut

Die Anwendung verwendet native Schaltflächen, Auswahlfelder, Eingabefelder und Dialoge. Dadurch bleiben grundlegende Tastaturinteraktionen erhalten. Fokusflächen werden monatsfarbig markiert. Dekorative Lichtkörper besitzen `aria-hidden="true"`. Bewegungen werden bei `prefers-reduced-motion: reduce` deaktiviert.

Eine vollständige Prüfung nach WCAG oder BITV ist im aktuellen Projekt nicht dokumentiert.

## Sicherheit und Datenschutz

Die Produktionsadresse besitzt bewusst keinen Zugriffsschutz. Jeder, der die Adresse kennt, kann die statische Anwendung und die ungeschützten Programmierschnittstellen grundsätzlich aufrufen. Im Dienstplan stehen personenbezogene Namen sowie Urlaubs- und Abwesenheitsinformationen.

Für einen produktiven Einsatz mit erhöhten Datenschutzanforderungen sollte Cloudflare Access oder eine vergleichbare vorgelagerte Zugriffskontrolle aktiviert werden. Ein ausschließlich im Frontend gespeichertes Passwort wäre kein wirksamer Schutz.

## Projektstruktur

```text
dienstplan/
├── index.html
├── styles.css
├── manifest.webmanifest
├── sw.js
├── _headers
├── icons/
│   └── icon.svg
├── js/
│   ├── app.js
│   ├── api.js
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
        └── month/[year]/[month].js
```

## Deployment

1. Änderungen werden in einem Feature-Branch erstellt.
2. Ein Pull Request wird gegen `main` geöffnet.
3. Nach Prüfung wird der Pull Request nach `main` gemergt.
4. Cloudflare Pages erkennt den neuen Commit im Produktionsbranch.
5. Statische Dateien und Functions werden neu gebaut und veröffentlicht.
6. Das Binding `DIENSTPLAN_KV` muss im Pages-Projekt auf `dienstplanrad-kv` zeigen.
7. Der Service Worker mit neuer Cache-Version sorgt dafür, dass Browser nicht dauerhaft alte Dateien verwenden.

## Qualitätssicherung

Für diese Version wurden folgende Prüfungen durchgeführt:
- Syntaxprüfung aller geänderten JavaScript-Dateien mit `node --check`
- gezielte Regellogikprüfung für BD am Vortag und BD–FZA–BD
- Prüfung der Abwesenheitsquellen `manual` und `import`
- statische Kontrolle der Becker-FZA-Ausnahme
- Browser-Render der vollständigen Oberfläche
- Kontrolle der Monatsfarbvariablen
- Kontrolle des Service-Worker-Caches
- Prüfung des Branch-Diffs vor dem Merge

## Fehlerbehebung

- **Monat bleibt leer:** Serverstatus prüfen; bei vorhandener lokaler Kopie Browser neu laden; KV-Binding kontrollieren.
- **Speicherstatus bleibt offline:** Netzwerk, Pages Functions und Binding `DIENSTPLAN_KV` prüfen.
- **Alte Oberfläche sichtbar:** Seite hart neu laden oder Service-Worker-Cache löschen; aktuelle Cache-Version ist `dienstplanrad-v6`.
- **Excel-Bibliothek nicht geladen:** Netzwerkzugriff auf den SheetJS-CDN prüfen und Seite neu laden.
- **FZA von Lurz oder anderer Person nach BD sichtbar:** Prüfen, ob der Eintrag bewusst manuell gesetzt wurde; manuelle FZA-Einträge bleiben absichtlich sichtbar.
- **Becker-FZA fehlt:** Prüfen, ob am vorausgehenden Samstag tatsächlich Becker als BD eingetragen ist und ob der angezeigte Tag der erste reguläre Werktag ist.
- **Roter Konflikt kann nicht direkt gewählt werden:** Im Bestätigungsdialog ausdrücklich `Trotzdem eintragen` wählen.
- **Feiertag falsch:** Jahr, Systemdatum und Sachsen-Konfiguration prüfen.

## Bekannte Grenzen

- keine automatische Planerstellung
- keine Mehrbenutzer-Sperre
- keine Transaktionen über mehrere KV-Schlüssel
- kein integrierter Rollen- oder Zugriffsschutz
- keine formale Freigabe- oder Signaturstufe
- keine vollständige Undo-Historie
- kein pixelgenauer Excel-Export aller historischen Formatdetails
- keine serverseitige PDF-Erzeugung
- keine automatische Konfliktauflösung
- kein RBN-Regelwerk und keine RBN-Statistik
- keine grafische Jahresübersicht innerhalb der Anwendung
- keine dokumentierte vollständige WCAG-Konformität

## Pflege und Weiterentwicklung

Sinnvolle Erweiterungspunkte:
- optionaler Cloudflare-Access-Schutz
- versionierte Rücksetzpunkte
- konfliktsicheres Mehrbenutzermodell
- exakter historischer Excel-Layout-Export
- integrierte Importvorschau mit Einzelkonflikten
- bearbeitbarer Mitarbeitendenstamm in der Oberfläche
- weitere regionale Feiertagsprofile
- visuelle Jahresübersicht
- serverseitige PDF-Erzeugung
- automatisierte Browser- und Regeltests

## Glossar

| Begriff | Bedeutung |
|---|---|
| BD | Bereitschaftsdienst |
| HG | Hintergrunddienst |
| RBN | frei gepflegte RBN-Besetzung ohne Regelprüfung |
| FZA | Freizeitausgleich beziehungsweise Frei |
| FA/FÄ | Facharzt beziehungsweise Fachärztin |
| AA/AÄ | Arzt beziehungsweise Ärztin in Weiterbildung |
| KV | Cloudflare Workers KV; Schlüssel-Wert-Speicher |
| PWA | Progressive Web Application |
| Pages Functions | serverseitige Cloudflare-Funktionen innerhalb des Pages-Projekts |
| Override | bewusst bestätigte rote Regelabweichung |

---

## Zusammenfassung

DienstplanRAD verbindet die vertraute, kompakte Struktur einer Excel-Dienstplantabelle mit einer manuellen, erklärbaren Regelprüfung und einer modernen schwebenden Glasoberfläche. Die Anwendung hält die Entscheidung beim planenden Nutzer, zeigt relevante Konflikte transparent an, speichert den Arbeitsstand lokal und in Cloudflare Workers KV und bildet die speziellen organisatorischen Regeln des radiologischen Dienstplans ab. Die aktuelle FZA-Logik verhindert allgemeine automatische Nachdienstvermerke und zeigt ausschließlich die definierte Becker-Ausnahme nach einem Samstags-BD am nächsten regulären Werktag.
