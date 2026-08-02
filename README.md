# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – Kalendertabelle aus farbigen Monatsfeldern" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Release-Token:** `20260801.11`  
> **Farbarchitektur:** Seasonal Spectrum Director mit **288 deterministischen Spektrumprofilen**  
> **Monatsfarben:** deutlich getrennte Nachbarmonate, Farbnamen aus dem tatsächlichen OKLCH-Wert abgeleitet  
> **Monatswechsel:** flüssige, richtungsabhängige High-Framerate-Transition mit durchgehendem OKLCH-Farbverlauf  
> **Bedienung:** kompakte Icon-Werkzeugleiste · tastaturgeführter, nach Eignung sortierter Dienst-Picker  
> **Paketversion:** `0.2.0` · **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD unterstützt die bewusste manuelle Planung von **Bereitschaftsdienst (BD)**, **Hintergrunddienst (HG)** sowie erster und zweiter **Rufbereitschaft Neuroradiologie (RBN)**. Die Anwendung erstellt keinen automatischen Gesamtplan. Jede Einteilung wird ausdrücklich durch den Benutzer vorgenommen und gegen ein transparentes fachliches Regelwerk geprüft.

Die frühere ausführliche Referenz bleibt als historischer Snapshot unter [`docs/README-20260801.11.md`](docs/README-20260801.11.md) erhalten. Diese README beschreibt den aktuellen produktiven Stand einschließlich der compositorbasierten Monatsanimation.

---

## Inhaltsübersicht

1. [Planungsprinzip](#1-planungsprinzip)
2. [Benutzeroberfläche](#2-benutzeroberfläche)
3. [Flüssiger Monatswechsel](#3-flüssiger-monatswechsel)
4. [Seasonal Spectrum Director](#4-seasonal-spectrum-director)
5. [Dienstarten und Personalpools](#5-dienstarten-und-personalpools)
6. [Bewertungs- und Konfliktmodell](#6-bewertungs--und-konfliktmodell)
7. [Abwesenheiten, Wünsche und Optionen](#7-abwesenheiten-wünsche-und-optionen)
8. [RBN-Logik](#8-rbn-logik)
9. [Statistik und offene Punkte](#9-statistik-und-offene-punkte)
10. [Speicherung und Datensicherheit](#10-speicherung-und-datensicherheit)
11. [Import und Export](#11-import-und-export)
12. [Technische Architektur](#12-technische-architektur)
13. [Tests und Qualitätssicherung](#13-tests-und-qualitätssicherung)
14. [Lokale Entwicklung und Deployment](#14-lokale-entwicklung-und-deployment)
15. [Projektstruktur](#15-projektstruktur)
16. [Unveränderliche Grundsätze](#16-unveränderliche-grundsätze)

---

## 1. Planungsprinzip

DienstplanRAD ist ein **assistiertes manuelles Planungssystem**, kein automatischer Optimierer.

- keine automatische Monatsbelegung;
- keine selbstständige Umbesetzung oder Tauschlogik;
- keine verdeckte Gesamtoptimierung;
- keine automatisch erzeugten Gegenposten bei Kopplungsregeln;
- vollständige Klartextbegründung ausgelöster Regeln;
- ausdrückliche Bestätigung und Protokollierung roter Ausnahmen;
- lokale Sofortsicherung und zentrale Cloudflare-KV-Synchronisierung.

Der Monatsplan verwendet eine chronologische Zeile je Kalendertag. Datum, Wochentag, BD, HG, RBN, zweite RBN, Abwesenheiten sowie Wünsche und Optionen liegen in einer gemeinsamen Leserichtung. Dienstfolgen, Feiertage und Wochenendbelastungen bleiben dadurch unmittelbar erkennbar.

---

## 2. Benutzeroberfläche

### 2.1 Monatsnavigation

- Vormonat und Folgemonat über Pfeiltasten;
- direkte Monats- und Jahresauswahl;
- Sprung zum aktuellen Monat;
- dynamische Ergänzung historischer oder zukünftiger Jahre;
- richtungsabhängige Animation bei Vorwärts- und Rückwärtsnavigation;
- unmittelbare Aktualisierung der Auswahlfelder;
- Vorladen benachbarter Monate für monatsübergreifende Regeln;
- sauberer Abbruch überholter Navigationen bei schnellen Folgeeingaben.

Die Navigation bleibt während des Monatswechsels bedienbar. Toolbar, Monatsauswahl und Speicherstatus werden nicht in die große Tabellenanimation einbezogen.

### 2.2 Kompakte Icon-Werkzeugleiste

Die Aktionsleiste ist in drei klar erkennbare Funktionsgruppen gegliedert:

| Gruppe | Aktionen |
|---|---|
| **Planung** | Aktueller Monat, Abwesenheiten, Wünsche / Optionen, Monat leeren |
| **Daten** | Serverstand neu laden, Excel importieren, JSON laden |
| **Ausgabe** | Excel exportieren, PDF drucken, JSON sichern |

Alle Aktionen besitzen:

- ein eigenständiges Inline-SVG-Icon;
- eine kurze sichtbare Beschriftung;
- einen vollständigen Tooltip;
- ein präzises `aria-label`;
- sichtbare Tastaturfokussierung.

Dateiaktionen bleiben per Maus, Tastatur, Enter und Leertaste bedienbar. „Aktueller Monat“, „Neu laden“ und „Monat leeren“ werden über zurückhaltende Tonstufen priorisiert, ohne die Leiste visuell zu überladen.

#### Gemessene Dichte statt fester Schwellen

Die Leiste bestimmt ihre Dichte aus dem tatsächlich vorhandenen Platz. Feste Viewport-Schwellen waren die Ursache eines konkreten Fehlbilds: Zwischen etwa 1120 px und 1400 px behielten die drei Gruppen ihre volle Breite, überlagerten einander und schnitten Beschriftungen ab.

`installToolbarDensity` in `js/ui-controls.js` misst dazu den Bedarf als Summe der Gruppenbreiten samt Abständen und vergleicht ihn mit der Innenbreite der Leiste. Von der reichsten Stufe abwärts gewinnt die erste, die vollständig hineinpasst:

| Stufe | Darstellung |
|---|---|
| `full` | Gruppenüberschriften und alle Beschriftungen |
| `groups` | ohne Gruppenüberschriften |
| `secondary` | nur die Planungsaktionen bleiben beschriftet |
| `icons` | reine Symbolschaltflächen |
| `overflow` | Planung bleibt sichtbar, Daten und Ausgabe ziehen in ein Menü |

Die gewählte Stufe steht als `data-toolbar-density` am Leistenelement und ist damit von außen prüfbar. Gemessen wird nach Größenänderung des Fensters und nach dem Laden der Schriften; Bezugsgröße ist die Fensterbreite, nicht die des Containers – ein Container kann bei waagerechtem Bildlauf breiter bleiben als das Fenster und die Leiste sonst in einer zu weiten Stufe festhalten.

Die Gruppen schrumpfen dabei bewusst nicht. Nur so ist ihr Bedarf eindeutig messbar, statt dass die Schaltflächen zerdrückt werden.

#### Überlaufmenü

Reicht selbst die Symboldarstellung nicht, bleibt die Planungsgruppe in der Leiste und alles Weitere zieht in ein Menü hinter der Schaltfläche „Weitere Aktionen“ (`⋯`):

- die Schaltflächen werden **verschoben, nicht neu erzeugt** – IDs, Ereignisbindungen und die versteckten Datei-Eingaben bleiben unverändert;
- im Menü ist Platz, deshalb tragen die Aktionen dort wieder Gruppenüberschrift und volle Beschriftung;
- das Menü ist `aria-haspopup`/`aria-expanded`-verknüpft, schließt bei Klick daneben, nach ausgelöster Aktion und mit <kbd>Esc</kbd> und gibt den Fokus an die Schaltfläche zurück;
- es hängt am `<body>` und ist fest positioniert: Die Leiste klippt ihren Inhalt und ist wegen ihrer Einblendanimation zugleich Bezugsrahmen fest positionierter Nachfahren – nur außerhalb davon liegt das Menü zuverlässig über der Monatskarte.

Damit gibt es bei keiner Fensterbreite überlagerte, beschnittene oder unerreichbare Aktionen.

### 2.3 Tabellenbearbeitung

- direkte Auswahl für BD und HG;
- native Auswahlfelder für RBN;
- bedingt eingeblendete zweite RBN;
- Löschen bestehender Einteilungen;
- Einzelerfassung tagesbezogener Markierungen;
- Sammelerfassung mehrerer Tage;
- vollständiges Leeren des sichtbaren Monats nach Bestätigung;
- automatische lokale Sicherung und Server-Synchronisierung.

### 2.4 Dienst-Picker

Der Picker beantwortet mitten in der Planung genau **eine** Frage: Wer übernimmt diesen Dienst? Er ist deshalb schmal (max. 600 px), dicht gesetzt und nach Entscheidungsnähe sortiert – nicht als vollständiger Prüfbericht angelegt.

**Alle Mitarbeitenden gleichzeitig im Blick.** Jede Person belegt genau eine Zeile von rund 30 px Höhe. Damit steht die vollständige Belegschaft ohne Rollen auf einem Bild – die Rangfolge ist als Ganzes ablesbar, statt sie sich in mehreren Bildläufen zusammensuchen zu müssen. Erst wenn selbst das nicht mehr in das Fenster passt, rollt die Liste; eine Maske am unteren Rand zeigt das an. Unter 620 px Fensterbreite rückt die Begründung unter den Namen, die Übersicht bleibt erhalten.

**Rangfolge statt Namensliste.** Alle bewerteten Personen werden in Entscheidungsgruppen einsortiert und innerhalb der Gruppe gereiht:

| Gruppe | Bedeutung |
|---|---|
| **Empfohlen** | Wunsch, Ausgleich oder Verlauf sprechen ausdrücklich dafür |
| **Möglich** | keine relevanten Konflikte |
| **Mit Hinweis** | wählbar, aber mit Anmerkung |
| **Nachrangig** | nur, wenn keine bessere Besetzung möglich ist |
| **Bestätigung nötig** | roter Konflikt, ausdrückliche Bestätigung erforderlich |
| **Nicht verfügbar** | nicht im Dienstpool oder zum Termin nicht aktiv |

Innerhalb einer Gruppe entscheidet die Empfehlungsstärke, danach die geringere Monatslast, danach der geringere Jahresverlauf, zuletzt der Name. Leere Gruppen erscheinen nicht.

**Was in der Zeile steht.** Name, Funktion, wichtigste Begründung, Monatslast (`BD 2/4`, ohne den geöffneten Tag) und Bewertung. Weitere Begründungen erscheinen als Zähler (`+2`); die **vollständige** Begründung steht im Detailbereich unter der Liste und wechselt mit der aktiven Zeile, ohne das Layout zu verschieben. Damit bleibt die fachliche Transparenz erhalten, ohne dass acht Textblöcke gleichzeitig um Aufmerksamkeit konkurrieren.

**Tastaturgeführt.** Der Fokus liegt beim Öffnen im Suchfeld, die erste wählbare Person ist vorausgewählt:

- tippen filtert über Name, Kurzname und Funktion, unabhängig von Groß- und Kleinschreibung, Punkten und Umlauten (`fr dal` findet `Fr. Dalitz`);
- <kbd>↑</kbd> / <kbd>↓</kbd> wechseln die aktive Person und überspringen gesperrte Einträge;
- <kbd>⏎</kbd> übernimmt, <kbd>Esc</kbd> schließt;
- die häufigste Entscheidung braucht damit zwei Tastenanschläge.

Semantisch ist die Auswahl eine `combobox` mit `listbox`, gruppierten `option`-Elementen und `aria-activedescendant`; der Detailbereich ist eine `aria-live`-Region.

**Kontext statt Rätselraten.** Der Kopf nennt Dienstart, Wochentag und Datum sowie die aktuelle Besetzung. „Eintrag löschen“ erscheint nur, wenn der Tag tatsächlich besetzt ist; die eingeteilte Person trägt in der Liste die Markierung `aktuell`.

### 2.5 Gestaltungsprinzip

Die Oberfläche kombiniert eine Excel-nahe Tabellenlogik mit kontrollierter Glasoptik:

- ruhige, klar gefasste Panels;
- monatlich gefärbte Kanten und Tabellenflächen;
- deckend weiße Eingabefelder für maximale Lesbarkeit;
- tabellarische Ziffern;
- reduzierte Bewegung über `prefers-reduced-motion`;
- deckende Ersatzflächen über `prefers-reduced-transparency`;
- keine externe Icon- oder UI-Bibliothek.

---

## 3. Flüssiger Monatswechsel

### 3.1 Ziel

Der Monatswechsel soll wie eine zusammenhängende Bewegung wirken und nicht aus mehreren sichtbaren Render-, Farb- oder Ladephasen bestehen. Insbesondere darf nach dem Ende der Bewegung kein zweiter Tabellenaufbau ein Blinken erzeugen.

Die Bewegung besteht aus zwei aufeinander abgestimmten Ebenen:

- der **Kartenbewegung** über 430 ms, ausschließlich auf dem Compositor;
- dem **Farbverlauf** über 760 ms, der alle Monatsvariablen in OKLCH überführt und exakt auf dem Zielprofil endet (Abschnitt 4.8).

Die Umsetzung trennt deshalb klar zwischen:

1. **Datenbeschaffung und DOM-Aufbau**;
2. **visueller Übergabe**;
3. **abschließendem stabilen Zielzustand**.

### 3.2 Native View Transitions

Unterstützte Chromium-Browser verwenden die native **View Transitions API**. Nicht die gesamte Seite, sondern ausschließlich die große Monatskarte `.sheet-panel` erhält den Namen `month-sheet`.

Der Browser erzeugt daraus zwei bereits gerasterte Ebenen:

- den vollständig sichtbaren alten Monatsplan;
- den vollständig aufgebauten neuen Monatsplan.

Nur diese beiden Ebenen werden bewegt. Die eigentliche Tabelle wird während der Animation nicht pro Frame neu layoutet oder neu gezeichnet.

Eigenschaften der Transition:

- Dauer: **430 ms**;
- vorwärts und rückwärts unterschiedliche Bewegungsrichtung;
- `translate3d(...)` für compositorfähige Verschiebung;
- ausschließlich `transform` und `opacity`;
- keine Blur-, Filter- oder layoutwirksamen Effekte;
- abgestimmte Überblendung ohne leeren Zwischenframe;
- unveränderte Toolbar und Navigation außerhalb der Transition.

### 3.3 Daten-Handoff ohne doppelten Abruf

Der Zielmonat wird vor der visuellen Übergabe genau einmal geladen. `js/month-view-transition.js` stellt den geladenen Monatsstand anschließend über einen **einmalig konsumierbaren Handoff** der bestehenden App-Logik zur Verfügung.

Dadurch entstehen nicht zwei konkurrierende Monatsabrufe durch Vorladen und `openCurrentMonth`. Das verhindert:

- einen zweiten identischen Server-GET;
- einen später eintreffenden Datentausch nach der Animation;
- einen erneuten Tabellenaufbau am Übergangsende;
- ein durch nachlaufende Daten ausgelöstes Abschlussblinken.

Der Handoff ist bewusst kurzlebig und gilt nur für den unmittelbar folgenden App-Ladevorgang. Der explizite Befehl „Serverstand neu laden“ bleibt davon unberührt.

### 3.4 Stabiler Ziel-DOM

Innerhalb des View-Transition-Callbacks wartet ein gezielter `MutationObserver` auf einen konsistenten Zielzustand. Geprüft werden insbesondere:

- `data-year` und `data-month` am Wurzelelement;
- Monatsüberschrift;
- erwartete Anzahl der Tageszeilen;
- Abschluss des sichtbaren Ladestatus;
- zusammengehörige Theme- und Monatsmetadaten.

Innerhalb dieses Callbacks wird bewusst **kein `requestAnimationFrame`** zur Bereitschaftsprüfung verwendet. Chromium pausiert die sichtbare Darstellung während der Aktualisierungsphase einer View Transition; ein framebasiertes Warten könnte daher einen Deadlock erzeugen. Der MutationObserver reagiert dagegen ereignisgesteuert auf die tatsächlichen DOM-Änderungen.

### 3.5 Schnelle Folgeeingaben

Jede Navigation erhält eine Generation und einen eigenen `AbortController`. Beginnt eine neuere Navigation, werden ältere Vorgänge konsequent verworfen:

- laufende Vorladevorgänge werden logisch abgebrochen;
- wartende DOM-Beobachter werden beendet;
- eine bereits laufende View Transition wird über `skipTransition()` übersprungen;
- ein aktiver Fallback wird abgebrochen und aufgeräumt;
- nur die zuletzt angeforderte Monatsnavigation darf den Endzustand festlegen.

Damit entstehen auch bei schnellem Klicken oder rascher Auswahl verschiedener Monate keine überlagerten Animationen oder rückwärts eintreffenden Zustände.

### 3.6 Web-Animations-Fallback

Browser ohne View Transitions API verwenden einen visuellen Snapshot der Monatskarte und die native **Web Animations API**.

Der Fallback:

- klont nur die Monatskarte;
- synchronisiert Formularwerte in den Snapshot;
- entfernt IDs und Namen aus dem inaktiven Klon;
- friert die alten Theme-Variablen ein;
- bewegt alte und neue Ebene ausschließlich über `transform` und `opacity`;
- entfernt Snapshot und temporäre Inline-Stile nach Abschluss oder Abbruch vollständig.

Der Fallback benötigt keine externe Bibliothek und folgt demselben visuellen Bewegungsprofil wie der native Pfad.

### 3.7 Barrierefreiheit und Druck

- `prefers-reduced-motion` wird respektiert; Kartenbewegung, Farbverlauf und Lichtwelle entfallen dann und der Zielzustand wird unmittelbar gesetzt.
- Temporäre Snapshot-Ebenen sind `aria-hidden` und inert.
- Beim Drucken werden View-Transition-Pseudoelemente, Fallback-Snapshots und die Lichtwelle ausgeschlossen.
- Bedienelemente bleiben außerhalb der animierten Monatskarte und damit weiterhin fokussierbar.

### 3.8 Warum keine externe Animationsbibliothek verwendet wird

Eine zusätzliche Bibliothek würde JavaScript-Gewicht, Initialisierungsaufwand und Main-Thread-Arbeit erhöhen. Native View Transitions und die Web Animations API bieten für diesen Anwendungsfall bereits:

- direkte Compositorintegration;
- hardwarebeschleunigte Transformationen;
- präzise Abbruchmöglichkeiten;
- keinen zusätzlichen Runtime- oder Framework-Overhead;
- einen klaren progressiven Fallback.

Die bewusste Entscheidung gegen eine zusätzliche Abhängigkeit ist daher eine Performanceentscheidung, keine funktionale Einschränkung.

---

## 4. Seasonal Spectrum Director

### 4.1 Zielsetzung

Der **Seasonal Spectrum Director** erzeugt einen deterministischen, saisonal plausiblen und deutlich variierenden Monatskontrast. Die wahrnehmbare Vielfalt wird auf mehreren unabhängigen Achsen gesteuert:

- Farbton;
- Helligkeit;
- Buntheit beziehungsweise Chroma;
- Wärme- und Kältewirkung;
- helle, mittlere und tiefe Spektralstufen;
- ruhige, mineralische, botanische, juwelenartige und expressive Jahrescharaktere.

Die saisonale Identität bleibt erhalten. Januar wirkt weiterhin winterlich, Mai botanisch, Juli sommerlich, Oktober erdig und Dezember immergrün.

### 4.2 Saisonale Farbkorridore

Jeder Kalendermonat besitzt einen eigenen Farbkorridor:

| Monat | Spektralfamilie | Farbtonmitte | Beispiele |
|---|---|---|---|
| Januar | Eis · Polarlicht | 245° | Gletscherblau, Polarviolett, Aquamarin, Frostindigo |
| Februar | Beere · Lack | 5° | Himbeerlack, Karminrot, Fuchsia, Granatapfel |
| März | Keimgrün · Botanik | 150° | Keimgrün, Kleegrün, Waldjade, Frühlingspetrol |
| April | Blüte · Iris | 305° | Iris, Fliederblitz, Veilchenblau, Amethyst |
| Mai | Blattgrün · Zitrus | 136° | Maigrün, Minzblatt, Lindenblatt, Farngrün |
| Juni | Wasser · Küste | 208° | Lagune, Mineralblau, Küstenblau, Meeresglas |
| Juli | Frucht · Sonnenglut | 34° | Koralle, Persimone, Tomatenrot, Pfirsichglut |
| August | Gold · Ernte | 82° | Bernstein, Erntegelb, Honiggold, Goldolive |
| September | Wein · Pflaume | 340° | Weinlese, Traubenviolett, Burgunder, Dahlienrot |
| Oktober | Kupfer · Erde | 60° | Kupfer, Kürbis, Terrakotta, Strohgold |
| November | Mineral · Sturm | 260° | Sturmblau, Schiefer, Nachtblau, Nebelblau |
| Dezember | Immergrün · Festlicht | 182° | Tannengrün, Jadenacht, Wacholder, Polartürkis |

Die Farbtonmitten sind so gewählt, dass **aufeinanderfolgende Monate weit auseinander liegen**. Farbton, Helligkeit und Buntheit werden unabhängig voneinander aufgespannt: Pro Monat stehen 48 Kandidaten aus sechs Farbton-Bahnen und acht Ton-Ecken zur Auswahl. Farbton, Helligkeit und Buntheit bleiben dabei fest im Korridor des Monats – ein Maigrün kann leuchten oder ruhig wirken, aber nie in ein herbstliches Oliv absinken.

### 4.3 24 Jahrescharaktere und 288 Profile

Der 24-jährige Zyklus verwendet zusätzliche stilistische Jahrescharaktere wie Kristall, Juwel, Botanisch, Lack, Mineral, Solar, Nordisch, Velours, Elektrisch, Organisch, Aurora, Signal, Porzellan, Dämmerung, Prisma und Atelier.

Für jeden der 288 kanonischen Kalendermonate werden mehrere Kandidaten innerhalb des saisonalen Korridors erzeugt. Die Auswahl maximiert den wahrnehmbaren Abstand:

1. zum unmittelbar vorherigen Kalendermonat;
2. zum selben Monat des Vorjahres.

Der Abstand wird im **OKLab-Farbraum** berechnet. Niedrig-diskrepante Zahlenfolgen verteilen Farbton, Helligkeit und Chroma deterministisch über den Zyklus.

Verbindliche Mindestabstände:

| Beziehung | Mindestabstand (OKLab) | tatsächlich erreicht |
|---|---|---|
| aufeinanderfolgende Kalendermonate | 0,120 | 0,120 |
| derselbe Monat in Folgejahren | 0,090 | 0,095 |

Zusätzlich darf jeder sRGB-Wert im gesamten Zyklus nur ein einziges Mal vorkommen. Kandidaten, die nach der Gamut-Begrenzung auf einen bereits vergebenen Wert fallen, scheiden aus.

Eigenschaften:

- derselbe Monat desselben Jahres bleibt auf jedem Gerät identisch;
- kein Zufall bei Seitenaufruf oder Neuladen;
- 288 eindeutige kanonische Akzentfarben;
- definierter 24-Jahres-Zyklus ab 2026;
- sichere positive Modulo-Abbildung für frühere und spätere Jahre;
- breite Verteilung innerhalb jedes Jahres;
- starke Variation desselben Monats über aufeinanderfolgende Jahre;
- mindestens sechs klar unterscheidbare Farbnamen je Kalendermonat über den Zyklus.

### 4.4 Farbnamen aus dem tatsächlichen Farbwert

Der angezeigte Name wird **nicht** aus einer Reihenfolge gezogen, sondern aus dem tatsächlich gewählten OKLCH-Wert bestimmt. Jeder Monat besitzt ein Lexikon aus zwölf Farbankern. Ein Anker beschreibt einen Farbton sowie einen Helligkeits- und Buntheitscharakter, zum Beispiel `Gletscherblau` als hellen, leuchtenden Ton bei 232° oder `Stahlblau` als tiefen, gedämpften Ton bei derselben Lage.

Bewertet werden Farbtonabstand, Helligkeit und Buntheit. Der nächstgelegene Anker benennt die Farbe; Anker des eigenen Monats werden bevorzugt. Dadurch kann das Badge nie einen Namen zeigen, der nicht zum sichtbaren Ton gehört. Ein automatischer Test prüft diese Zusage für alle 288 Profile.

Das Badge zeigt weiterhin nur den Farbnamen:

```text
Monatskontrast · Polarviolett
```

Der Tooltip ergänzt Saison, Spektralfamilie, **Tonbeschreibung**, Jahrescharakter und Jahr:

```text
Winter · Eis · Polarlicht · hell · leuchtend · Kristall · 2026
```

Die Tonbeschreibung stammt aus denselben Messwerten wie der Name (`tief`, `satt`, `mittelhell`, `hell`, `licht` beziehungsweise `zart`, `gedämpft`, `ausgewogen`, `kräftig`, `leuchtend`). Solange der Director aktiv ist, schreibt das Basistheme das Badge nicht mehr.

Am Wurzelelement werden unter anderem folgende Datenattribute gesetzt:

- `data-color-director="seasonal-spectrum-v2"`;
- `data-spectrum-key="JJJJ-MM"`;
- `data-spectrum-palette`;
- `data-spectrum-mood`;
- `data-spectrum-motion="running"` beziehungsweise `"settled"`;
- `data-month-transition="fluid-spectrum-v1"`.

### 4.5 App-Icon

Das App-Icon ist eine **Kalendertabelle ohne Schrift**: Binderringe, ein Spektrumkopf, sieben Spaltenmarken und ein Raster aus 7 × 5 Feldern.

- die Feldfarben sind keine Dekoration, sondern die **zwölf tatsächlichen Monatsakzente** des Referenzjahres 2026, erzeugt aus demselben Modul wie die Oberfläche;
- die Kopfleiste zeigt alle zwölf Farben als durchgehenden Verlauf;
- Wochenendspalten und einzelne belegte Dienstfelder sind kräftiger gesetzt und geben dem Raster den Rhythmus eines Dienstplans;
- `icons/icon-animated.svg` lässt die Felder zeitversetzt durch alle zwölf Monatsfarben wandern; bei `prefers-reduced-motion: reduce` steht die Bewegung still;
- beide Dateien sind reines SVG ohne externe Abhängigkeit, ohne Schrift und ohne Rasterbild.

### 4.6 Vollständige Oberflächenableitung

Aus dem gewählten Profil werden gemeinsam abgeleitet:

- Hauptakzent;
- kräftiger Interaktionsakzent;
- dunkler Schrift- und Konturton;
- Glow;
- Paneltönung;
- Wochentagsspalte;
- Samstag;
- Sonntag;
- Feiertag.

Die Tabellenhierarchie bleibt erhalten: Samstag ist am zurückhaltendsten, Sonntag kräftiger, Feiertage stärker, die Wochentagsspalte trägt die deutlichste Orientierungstönung.

### 4.7 Gamut Mapping und Kontrast

Expressive OKLCH-Farben können außerhalb des darstellbaren sRGB-Farbraums liegen. Das Modul reduziert in diesem Fall iterativ nur die Buntheit, bis ein gültiger sRGB-Wert erreicht ist. Farbton und Helligkeitscharakter bleiben dabei möglichst stabil.

Automatisierte Tests prüfen den WCAG-AA-Kontrast der abgeleiteten Tabellenflächen aller 288 Profile.

### 4.8 Zusammenspiel mit der Monatsanimation

Die Farbarchitektur bleibt dreistufig:

1. `theme.js` liefert ein vollständiges Basistheme und ist die Rückfallebene ohne geladenen Director;
2. `color-director.js` besitzt die sichtbare Farbe und fährt sie als Verlauf an;
3. `month-transition-stability.js` beendet konkurrierende Farbsignale und übergibt den Wechsel an genau einen Verlauf.

Ablauf eines Monatswechsels:

- das Basistheme wird ohne eigene Animation gesetzt und beendet damit seinen privaten rAF-Handle;
- der Director interpoliert anschließend alle neun Farbvariablen in **OKLCH** über 760 ms;
- geschrieben wird mit `important`, dadurch gewinnt der Director in jedem Frame gegen das Basistheme;
- ein bereits laufender Verlauf auf denselben Monat wird nie neu gestartet, wiederholte Synchronisationssignale bleiben wirkungslos;
- die Interpolation nimmt den kürzeren Farbtonbogen, deshalb läuft der Wechsel nie über ausgegraute Zwischentöne;
- die Zeitkurve ist ein Smootherstep und damit in erster und zweiter Ableitung stetig – auf 120-Hz-Displays gibt es keinen sichtbaren Einsatz- oder Abrisspunkt;
- begleitend läuft eine kurze Lichtwelle (`.month-spectrum-sweep`), die ausschließlich `opacity` und `transform` bewegt und damit vollständig auf dem Compositor bleibt.

**Eindeutige Farbhoheit.** Sobald `data-color-director` gesetzt ist, schreibt `theme.js` die neun Monatsvariablen nicht mehr und startet keine eigene Interpolation. Das ist keine Kosmetik, sondern notwendig: `setProperty` ohne Priorität ersetzt nicht nur den Wert, sondern entfernt auch das `important` des Directors. Jeder Aufruf des Basisthemes – bei jedem `render()`, jeder Statusaktualisierung und vor dem Drucken – hätte den kräftigen Monatskontrast sonst gegen den gedämpften Basiston getauscht.

Die View Transition rastert erst den alten und anschließend den neu aufgebauten Monatsplan; der Farbverlauf läuft live weiter und endet exakt auf dem Zielprofil. Bei `prefers-reduced-motion: reduce` entfällt der Verlauf samt Lichtwelle und die Zielfarbe wird sofort gesetzt.

---

## 5. Dienstarten und Personalpools

### Bereitschaftsdienst

BD wird gegen individuelle Sollwerte, harte Maxima, Abwesenheiten, Wünsche, Qualifikation, bestehende Einteilungen und relevante Dienstfolgen bewertet.

### Hintergrunddienst

HG steht nur tagesgültig HG-berechtigten Personen zur Verfügung. Die Prüfung berücksichtigt BD am selben oder folgenden Tag, Diensthäufungen, Kopplungsregeln, Abwesenheiten und kombinierte Monatslast.

### Rufbereitschaft Neuroradiologie

Die erste RBN besitzt einen datumsabhängigen Pool. Die zweite RBN wird nur eingeblendet, wenn die Erstbesetzung fachlich eine zusätzliche Absicherung erfordert. Historische oder importierte Altwerte bleiben lesbar, werden aber nicht automatisch erneut angeboten.

### Tagesgültige Rollen

Personaldefinitionen können Aktivierungsdaten, Deaktivierungsdaten, Beförderungsdaten, Grundrollen, BD-Sollwerte, Maxima und Planungsberechtigungen enthalten. Qualifikationen werden für den konkreten Kalendertag aufgelöst.

---

## 6. Bewertungs- und Konfliktmodell

| Stufe | Bedeutung |
|---|---|
| **Grün** | fachlich geeignet oder positiv empfohlen |
| **Gelb** | Hinweis, Belastung oder nachrangige Konstellation |
| **Orange** | relevanter Konflikt, besonders zu prüfen |
| **Rot** | schwerer Konflikt; Eintragung nur nach Bestätigung |
| **Grau** | am konkreten Tag nicht auswählbar |

Die höchste Konfliktstufe bestimmt die sichtbare Bewertung. Sämtliche relevanten Gründe bleiben in Klartext erhalten. Positive Hinweise heben Konflikte nicht rechnerisch auf.

Geprüft werden unter anderem:

- tagesgültige Aktivität und Qualifikation;
- Urlaub, FZA und Sperrwünsche;
- gleiche Person in inkompatiblen Rollen;
- individuelle BD-Sollwerte und harte Maxima;
- monatsbezogener Ausgleich;
- Dienstabstände und Dienstfolgen;
- Wochenendnachbarschaften;
- HG-Häufungen;
- fachliche Kopplungen zwischen BD und HG;
- personenspezifische Sonderregeln;
- sicher geladene historische Monatsdaten;
- reiner Jahreskontext ohne verdeckte Bewertungswirkung.

Rote Einteilungen bleiben bewusst möglich, erfordern aber eine ausdrückliche Bestätigung. Protokolliert werden Datum, Rolle, Person, Gründe, Zeitpunkt und optionaler Kommentar.

---

## 7. Abwesenheiten, Wünsche und Optionen

Unterstützt werden Urlaub, FZA und echte dienstfreie Tage, der Sperrwunsch „Kein Dienst“, positive BD- und HG-Wünsche sowie die Optionen „BD möglich“ und „HG möglich“.

Wirksame Abwesenheiten entfernen eine Person aus der tagesbezogenen Vergleichsgruppe. Automatisch abgeleiteter FZA wird ausschließlich dort erzeugt, wo er fachlich ausdrücklich definiert ist. Manuelle und abgeleitete Quellen bleiben unterscheidbar; doppelte sichtbare Einträge werden vermieden.

---

## 8. RBN-Logik

- getrennte Felder für erste und zweite RBN;
- zweite RBN nur bei definierten Erstbesetzungen sichtbar;
- datumsabhängige Personalpools;
- defensive Behandlung importierter Altwerte;
- keine Einbeziehung der RBN in die BD-/HG-Statistik;
- vollständige Speicherung im Monatsdatensatz.

---

## 9. Statistik und offene Punkte

Die Statistik wird unmittelbar aus dem sichtbaren Monatsplan berechnet. Sie zeigt insbesondere BD, HG, Sollwerte, Restwerte und Wochenendlast.

Die Liste „Offene Punkte“ priorisiert unbesetzte Rollen, inaktive oder unzulässige Besetzungen, inkonsistente zweite RBN sowie weitere fachliche oder strukturelle Auffälligkeiten. Sie verändert keine Einteilung selbstständig.

---

## 10. Speicherung und Datensicherheit

### Lokaler Zustand

Jede Änderung wird unmittelbar lokal gesichert. Ein Debounce bündelt Serverspeicherungen, ohne die lokale Rückfallebene zu verzögern.

### Cloudflare KV

Monatsdaten und Einstellungen werden über Pages Functions in Cloudflare KV gespeichert. Beim Öffnen eines Monats wird der aktuelle Serverstand geladen, sofern keine schützenswerten lokalen Änderungen entgegenstehen.

### Konfliktvermeidung

- getrennte Dirty-Zustände je Monat;
- keine stillen Überschreibungen lokaler Änderungen;
- serielle Speicherung desselben Monats;
- defensive Normalisierung importierter Daten;
- Revision und Zeitstempel im Monatsobjekt;
- JSON-Sicherung als transportierbares Rückfallformat;
- Schutz lokaler Offline-Änderungen nach einem Neustart.

Ein eigener Service Worker wird nicht verwendet. Historische eigene Registrierungen und Caches werden defensiv entfernt.

---

## 11. Import und Export

### Excel-Import

Der Import analysiert Jahresplaner, ordnet Personalnamen defensiv zu und übernimmt unterstützte Monatsinformationen. Zielmonate werden vor einem Merge verlässlich geladen. Abweichende vorhandene Werte werden nur im vorgesehenen Importmodus ersetzt.

### Excel-Export

Der sichtbare Monatsplan wird als Excel-kompatibles Arbeitsblatt mit Tageszeilen, Diensten, RBN und Markierungen ausgegeben.

### PDF-/Druckausgabe

Die Druckansicht ist auf eine kompakte A4-Ausgabe ausgelegt. **Der Monatskontrast wird unverändert und in voller Intensität gedruckt.** View-Transition-Ebenen und die Lichtwelle sind vom Druck ausgeschlossen.

Vor dem Druck wird ein eventuell laufender Farbverlauf des Directors synchron auf seinem Zielprofil abgeschlossen (`applySpectrumProfile(..., { animate: false })`). Dadurch friert der Ausdruck keinen Zwischenton ein, und die gedruckte Fläche passt exakt zum Monatskontrast-Abzeichen. Das Basistheme wird dabei nicht mehr als Farbquelle herangezogen – es besitzt die Farbhoheit nur noch ohne geladenen Director.

### JSON

Vollständige Sicherung und Wiederherstellung von Stammdaten, Einstellungen und Monatsständen.

---

## 12. Technische Architektur

Die Anwendung verwendet native Webtechnologien ohne Frontend-Framework:

- semantisches HTML;
- CSS Custom Properties und moderne Farbfunktionen;
- ES-Module;
- native View Transitions API;
- native Web Animations API;
- `MutationObserver` und `AbortController`;
- Cloudflare Pages Functions;
- Cloudflare KV;
- SheetJS für Excel;
- Node-Test-Runner;
- Playwright für End-to-End-Tests.

Wesentliche Module:

| Modul | Aufgabe |
|---|---|
| `js/app.js` | UI, Navigation, Dialoge, Rendering, Import-/Exportsteuerung |
| `js/theme.js` | saisonales Basistheme, Farbräume und Rückfallebene |
| `js/color-director.js` | Spektrumprofile, Abstandsoptimierung, Gamut Mapping und Oberflächenableitung |
| `js/month-transition-stability.js` | Übergabe des Monatswechsels an genau einen Farbverlauf |
| `js/month-view-transition.js` | High-Framerate-Monatsbewegung, Daten-Handoff, Abbruchsteuerung und Browser-Fallback |
| `js/ui-controls.js` | kompakte Werkzeugleiste, Icons und Einbindung der progressiven UI-Schichten |
| `js/state.js` | Laden, Speichern, Dirty-Zustände und Monatscache |
| `js/rules*.js` | Regelengine, Auswertung, Statistik und offene Punkte |
| `js/picker-view.js` | Gruppierung, Rangfolge und Tippfilter des Dienst-Pickers |
| `js/rbn.js` | RBN-Pools und zweite RBN |
| `js/holidays.js` | sächsische Feiertage und Werktage |
| `js/excel-import.js` | Arbeitsmappenanalyse und Zuordnung |
| `functions/api/*` | Cloudflare-API und KV-Zugriff |

Die progressive Darstellung wird in folgender Reihenfolge eingebunden:

1. `month-view-transition.js` fängt Monatsnavigation vor den bisherigen UI-Handlern ab;
2. `color-director.js` bestimmt das endgültige Spektrumprofil;
3. `month-transition-stability.js` bündelt die Farbsignale zu einem Verlauf;
4. `ui-controls.js` organisiert die bestehenden Bedienelemente in der kompakten Werkzeugleiste.

Fällt die native View Transitions API aus, übernimmt der WAAPI-Fallback. Fällt die progressive Spektrumebene aus, bleibt die Anwendung mit dem Basistheme vollständig bedienbar.

### 12.1 Performancevertrag

Die Monatsanimation hält sich an folgende Invarianten:

- keine Tabellen-Neuberechnung pro Animationsframe;
- keine JavaScript-Schleife zur manuellen Interpolation der Position;
- keine Filter- oder Bluranimation;
- nur compositorfähige Eigenschaften;
- höchstens ein Monats-GET für die Zielnavigation;
- kein nachgelagerter Daten- oder Theme-Austausch nach dem sichtbaren Abschluss;
- vollständige Bereinigung temporärer Snapshot- und Inline-Zustände;
- deterministischer Abbruch veralteter Navigationen.

---

## 13. Tests und Qualitätssicherung

### Syntaxprüfung

```bash
npm run check
```

Prüft sämtliche produktiven JavaScript-Module, Pages Functions und Testkonfigurationen, einschließlich `js/color-director.js`, `js/month-transition-stability.js` und `js/month-view-transition.js`.

### Unit- und Regressionstests

```bash
npm test
```

Aktuell umfasst die Suite **178 Unit- und Regressionstests**. Geprüft werden unter anderem:

- Regelengine und personenspezifische Sonderregeln;
- Persistenz, Dirty-Zustände und Offline-Schutz;
- Import, Export und Datenvalidierung;
- RBN-Pools und zweite RBN;
- 288 Basispaletten und 288 Spektrumprofile;
- Wahrnehmungsabstände in OKLab;
- Helligkeits- und Chromadynamik;
- Gamut Mapping;
- Kontrast sämtlicher Tabellenflächen;
- Werkzeugleistengruppen und Badgeformat;
- Einbindungsreihenfolge der Übergangsmodule;
- Capture-Interception und einmalige Weitergabe an die App;
- native View Transition und WAAPI-Fallback;
- ausschließlich compositorfähige Animationsmerkmale;
- Abbruch- und Generationensicherung;
- Ausschluss eines framebasierten Deadlocks im Update-Callback.

### End-to-End

```bash
npm run test:e2e
```

Aktuell umfasst die Browser-Suite **19 Playwright-End-to-End-Tests**. Sie prüft Navigation, Auswahl- und Konfliktdialoge, Werkzeugleiste, Dateiaktionen, Monatsbadge, Seasonal Spectrum Director, PDF-Export sowie Monats- und Jahresvariation.

Die Werkzeugleiste wird über eine Breitenreihe von 1500 px bis 340 px geprüft: keine Überlagerung, kein Beschnitt, kein waagerechter Seitenbildlauf, mindestens drei tatsächlich genutzte Dichtestufen sowie Öffnen, Schließen und Rückführung des Überlaufmenüs.

Der Dienst-Picker wird dabei vollständig durchgespielt: kompakte Breite, Gruppenreihenfolge, vorausgewählte Empfehlung, Tippfilter, Pfeiltasten, Übernahme per <kbd>⏎</kbd>, Anzeige der aktuellen Besetzung und Löschen des Eintrags. Ein eigener Fall prüft mit einer 14-köpfigen Belegschaft, dass die Liste ohne Bildlauf auskommt und keine Zeile höher als 34 px wird.

Der spezielle High-Framerate-Regressionsfall verzögert die Monats-API bewusst und zeichnet den Übergang frameweise auf. Geprüft werden:

- Einsatz der nativen View Transitions API im Chromium-Pfad;
- durchgehend vorhandene alte oder neue Monatsdarstellung;
- ausschließlich gültige Tageszeilenzahlen des Ausgangs- oder Zielmonats;
- zugrunde liegende `.sheet-panel`-Deckkraft von `1`;
- korrekte Bewegungsrichtung;
- ausreichend viele gezeichnete Animationsframes;
- konstante finale Monatsfarbe;
- kein Fallback-Snapshot im nativen Pfad;
- exakt ein Server-GET für den Zielmonat;
- korrekter Abschluss an Monats- und Jahresgrenzen;
- sauberer Abbruch schneller, überholter Navigationen.

### Vollständige Verifikation

```bash
npm run verify
```

Führt Syntaxprüfung, Unit-/Regressionstests und Playwright-End-to-End-Tests nacheinander aus.

Der für diese Implementierung maßgebliche vollständige CI-Lauf **#127** bestand `npm ci`, Syntaxprüfung, alle 178 Unit-/Regressionstests und alle 10 Playwright-Tests.

---

## 14. Lokale Entwicklung und Deployment

```bash
npm ci
npm run check
npm test
npm run test:e2e
```

Für die reine Oberfläche genügt ein statischer lokaler Webserver. Backendfunktionen benötigen eine Cloudflare-kompatible Pages-Functions-Umgebung und die vorgesehenen KV-Bindings.

Das Repository wird aus `main` über Cloudflare Pages bereitgestellt. Der vollständige Browser-Modulgraph verwendet einen einheitlichen Release-Token. Neue Module müssen sowohl in die Syntaxprüfung als auch in die Modulauflösungs- und Auslieferungstests aufgenommen werden.

Der Release-Token `20260801.11` bleibt bewusst einheitlich, da die Repositorytests einen einzigen Token für den vollständigen Modulgraphen erzwingen. Neue Dateien wie `js/month-view-transition.js` und `transitions.css` besitzen eigene bisher nicht ausgelieferte Pfade.

---

## 15. Projektstruktur

```text
.
├── index.html
├── styles.css
├── controls.css
├── transitions.css
├── manifest.webmanifest
├── Eignungsregeln.txt
├── icons/
│   ├── icon.svg              # Kalendertabelle in den zwölf Monatsfarben
│   └── icon-animated.svg     # dieselbe Tabelle mit wandernden Monatsfarben
├── js/
│   ├── app.js
│   ├── theme.js
│   ├── color-director.js
│   ├── month-transition-stability.js
│   ├── month-view-transition.js
│   ├── ui-controls.js
│   ├── state.js
│   ├── defaults.js
│   ├── rules.js
│   ├── rules-core.js
│   ├── rules-evaluation.js
│   ├── rules-reporting.js
│   ├── picker-view.js
│   ├── rbn.js
│   ├── holidays.js
│   └── excel-import.js
├── functions/
│   └── api/
├── tests/
│   ├── color-director.test.js
│   ├── month-navigation.test.js
│   ├── month-transition-stability.test.js
│   ├── month-view-transition.test.js
│   ├── theme.test.js
│   └── e2e/
│       ├── app.spec.js
│       ├── color-director.spec.js
│       ├── month-transition-stability.spec.js
│       └── month-view-transition.spec.js
├── docs/
│   └── README-20260801.11.md
├── package.json
└── playwright.config.js
```

---

## 16. Unveränderliche Grundsätze

- Der Mensch plant; die Anwendung unterstützt und prüft.
- Keine verdeckte automatische Gesamtoptimierung.
- Konflikte werden erklärt, nicht nur eingefärbt.
- Positive Hinweise heben Konflikte nicht auf.
- Rote Ausnahmen bleiben möglich, aber protokollpflichtig.
- Historische Daten werden defensiv behandelt.
- Sachsen bleibt die fest definierte Feiertagsregion.
- Monatsfarben sind deterministisch, saisonal, kontrastgeprüft und sichtbar voneinander unterscheidbar.
- Farbvielfalt wird wahrnehmungsbasiert und nicht nur anhand unterschiedlicher Hexwerte bewertet.
- Ein Monatswechsel darf keinen bereits sichtbaren Plan erneut ausblenden oder nachträglich umfärben.
- Der Zielmonat darf innerhalb einer Navigation nicht mehrfach identisch vom Server geladen werden.
- Animationsframes dürfen kein Tabellenlayout und keine Farbinterpolation auf dem Main Thread erzwingen.
- Überholte Navigationen dürfen keinen späteren Zustand mehr festlegen.
- Regelwerk, Tests und Dokumentation werden gemeinsam geändert.
