# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – Kalendertabelle aus farbigen Monatsfeldern" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Release-Token:** `20260801.11`  
> **Farbarchitektur:** Seasonal Spectrum Director mit **288 deterministischen Spektrumprofilen**  
> **Monatsfarben:** Pastellfassungen recherchierter Trendfarben 2026, Nachbarmonate auf drei Achsen getrennt  
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
- Sammelerfassung mehrerer Tage – die Auswahl im Raster ist dabei die vollständige Aussage für den gewählten Typ: markiert bedeutet gesetzt, nicht markiert bedeutet für diesen Typ entfernt, andere Typen desselben Tages bleiben unberührt;
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

### 3.8 Hauptthread-Budget des Monatswechsels

Eine Bewegung ist nur so flüssig wie der Thread, der sie zeichnet. Gemessen am gefüllten Monat lag die eigentliche Bremse nicht in der Animation, sondern in der Arbeit daneben. Vier Stellen wurden deshalb aus dem sichtbaren Pfad genommen:

| Arbeit | vorher | jetzt |
|---|---|---|
| Regelbewertung belegter Zellen | Tabelle und Sammelprüfung bewerteten dieselben Zellen zweimal (rund 13 ms doppelt) | ein gemeinsamer Zwischenspeicher je Renderlauf |
| Sammelprüfung (`collectIssues`, rund 18 ms) | im selben Block wie Tabelle und Statistik | erst im nächsten Leerlauf, mit Generationssperre gegen überholte Läufe |
| Übernahme der vorgeladenen Monate | bis zu dreizehn Monate am Stück normalisiert | einzeln, mit `scheduler.yield()` zwischen zwei Monaten |
| Lokale Sicherung | jedes `setMonthData` schrieb sofort in den Speicher | eigene Änderungen weiterhin sofort, Serverstände gebündelt im Leerlauf |

Dazu entsteht die Tabelle in einem `DocumentFragment` und wird in einem Zug eingehängt; einzeln eingehängte Zeilen kosteten je Zeile einen Tabellenumbruch.

Die Zusagen dazu stehen in `tests/rendering-performance.test.js`.

### 3.9 Warum keine externe Animationsbibliothek verwendet wird

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

Die Palette ist **recherchiert, nicht erfunden**. Die Anker jedes Monats sind Farben der Saisonpaletten 2026:

- **Pantone Fashion Color Trend Report** für die New Yorker und Londoner Fashion Week, S/S 26 und A/W 26/27 (u. a. Marina, Tea Rose, Acacia, Muskmelon, Alexandrite, Amethyst Orchid, Foxglove, Festival Fuchsia, Neptune Green, Arabian Spice, Poseidon, Underworld);
- **Key Colours von WGSN und Coloro** (Transformative Teal als Colour of the Year 2026, Jelly Mint, Blue Aura, Amber Haze, Green Glow, Fresh Purple, Cocoa Powder, Future Dusk);
- **Farben des Jahres 2026** der Hersteller (Cloud Dancer bei Pantone, Hidden Gem bei Behr, Universal Khaki bei Sherwin-Williams, Warm Eucalyptus bei Valspar, Divine Damson bei Graham & Brown, Epernay bei C2, Midnight Garden bei Dunn-Edwards, Satin Lagoon bei Rust-Oleum).

Die hinterlegten Hexwerte sind die veröffentlichten sRGB-Näherungen dieser Farben. Jeder Monat trägt **acht Anker** aus seinem saisonalen Umfeld; Farbtonmitte, Korridorbreite, Helligkeit und Buntheit werden aus ihnen berechnet. Der Korridor ist damit vollständig aus der Recherche abgeleitet und nicht nachträglich daran angenähert.

| Monat | Spektralfamilie | Farbtonmitte | Anker (Auswahl) |
|---|---|---|---|
| Januar | Eis · Polarlicht | 245° | Ether, Vapor Blue, Dutch Canal, Blue Aura, Marina, All Aboard, Poseidon, Retro Blue |
| Februar | Beere · Lack | 11° | Primrose Pink, Tickled Pink, Tea Rose, Dusky Rose, Foxglove, Teaberry, Festival Fuchsia, Cherry Lacquer |
| März | Keimgrün · Botanik | 140° | Jelly Mint, Neptune Green, Sage Green, Warm Eucalyptus, Shale Green, Hidden Gem, Green Envy, Palm |
| April | Blüte · Iris | 336° | Burnished Lilac, Amethyst Orchid, Fresh Purple, Orchid Bloom, Damson, Amaranth, Electric Fuchsia, Divine Damson |
| Mai | Blattgrün · Zitrus | 115° | Pale Banana, Celestial Yellow, Acacia, Green Glow, Lemon Grass, Jelly Mint, Green Envy, Palm |
| Juni | Wasser · Küste | 212° | Jelly Mint, Neptune Green, Satin Lagoon, Transformative Teal, Alexandrite, Dutch Canal, Blue Aura, Marina |
| Juli | Frucht · Sonnenglut | 39° | Muskmelon, Mandarin Orange, Amber Haze, Brandied Melon, Burnt Sienna, Chili Oil, Poppy Red, Lava Falls |
| August | Gold · Ernte | 97° | Epernay, Universal Khaki, Pale Banana, Acacia, Lemon Grass, Green Glow, Burnt Olive, Celestial Yellow |
| September | Wein · Pflaume | 352° | Foxglove, Burnished Lilac, Amethyst Orchid, Damson, Mauve Wine, Amaranth, Festival Fuchsia, Divine Damson |
| Oktober | Kupfer · Erde | 47° | Candied Ginger, Caramel, Amber Haze, Muted Clay, Toffee, Arabian Spice, Cocoa Powder, Warm Mahogany |
| November | Mineral · Sturm | 268° | Vapor Blue, Underworld, Future Dusk, Silhouette, Crown Blue, Evening Blue, Rhodonite, Retro Blue |
| Dezember | Immergrün · Festlicht | 176° | Neptune Green, Satin Lagoon, Transformative Teal, Hidden Gem, Shale Green, Sycamore, Midnight Garden, Alexandrite |

**Pastellfassung statt Originalton.** Die Originale reichen von `Primrose Pink` bis `Poseidon`. Für eine Arbeitsfläche, auf die man stundenlang schaut, werden sie als Ganzes in ein helles Band gehoben (OKLCH-Helligkeit 0,695–0,895) und in der Buntheit gedämpft (höchstens 0,145). Der **Farbton bleibt unverändert** – das Kennzeichnende der Farbe. Die Reihenfolge bleibt ebenfalls erhalten: `Poseidon` ist auch als Pastellfassung der tiefere Ton, `Primrose Pink` der hellere.

**Englische Originalnamen.** Das Badge nennt die Farbe so, wie sie in der Saisonpalette heißt: „Monatskontrast · Neptune Green“. Ein Name ist eine Bezeichnung, keine Beschreibung – er wird deshalb nicht übersetzt. Ein Test stellt sicher, dass jeder angezeigte Name tatsächlich aus der Recherche stammt.

**Takt zwischen hell und tief.** Die Monate wechseln reihum zwischen einem helleren und einem tieferen Ton; der Takt kippt zusätzlich mit jedem Jahr. Ohne diesen Wechsel wirkte ein Jahr trotz unterschiedlicher Farbtöne wie eine durchgehende Reihe gleich heller Flächen.

**Keine schnellen Wiederholungen.** Ein Farbname kehrt frühestens nach zwölf Monaten zurück – über Jahresgrenzen hinweg gerechnet. Innerhalb eines Jahres trägt damit jeder Monat eine eigene Trendfarbe. Im gesamten Zyklus erscheinen 56 verschiedene Trendfarben.

Farbton, Helligkeit und Buntheit werden unabhängig voneinander aufgespannt: Pro Monat stehen 96 Kandidaten aus acht Farbton-Bahnen und zwölf Ton-Stufen zur Auswahl, alle drei Achsen bleiben dabei im Korridor des Monats.

### 4.3 24 Jahrescharaktere und 288 Profile

Der 24-jährige Zyklus verwendet zusätzliche stilistische Jahrescharaktere wie Kristall, Juwel, Botanisch, Lack, Mineral, Solar, Nordisch, Velours, Elektrisch, Organisch, Aurora, Signal, Porzellan, Dämmerung, Prisma und Atelier.

Für jeden der 288 kanonischen Kalendermonate werden mehrere Kandidaten innerhalb des saisonalen Korridors erzeugt. Die Auswahl maximiert den wahrnehmbaren Abstand:

1. zum unmittelbar vorherigen Kalendermonat;
2. zum selben Monat des Vorjahres.

Der Abstand wird im **OKLab-Farbraum** berechnet. Niedrig-diskrepante Zahlenfolgen verteilen Farbton, Helligkeit und Chroma deterministisch über den Zyklus.

Verbindliche Mindestabstände. Der reine OKLab-Abstand genügt dafür nicht: Zwei Töne können ihn allein über die Buntheit erfüllen und trotzdem als „dieselbe Farbe, nur etwas kräftiger“ gelesen werden. Gemessen wurden benachbarte Paare mit **1° Farbtonabstand bei identischer Helligkeit**. Benachbarte Monate müssen deshalb auf **drei Achsen gleichzeitig** auseinanderliegen:

| Beziehung | Achse | Mindestabstand | tatsächlich erreicht |
|---|---|---|---|
| aufeinanderfolgende Kalendermonate | OKLab-Gesamtabstand | 0,095 | 0,097 |
| aufeinanderfolgende Kalendermonate | Farbton | 38° | 40° |
| aufeinanderfolgende Kalendermonate | Helligkeit | 0,034 | 0,035 |
| derselbe Monat in Folgejahren | OKLab-Gesamtabstand | 0,040 | 0,044 |
| gleicher Farbname | Abstand in Monaten | 12 | 14 |

Der Gesamtabstand fällt im Pastellband naturgemäß kleiner aus als bei kräftigen Tönen; die wahrnehmbare Trennung tragen dort Farbton und Helligkeit.

Zusätzlich darf jeder sRGB-Wert im gesamten Zyklus nur ein einziges Mal vorkommen. Kandidaten, die nach der Gamut-Begrenzung auf einen bereits vergebenen Wert fallen, scheiden aus.

Lässt sich in einem Fall nicht jede Zusage einhalten, gewinnt zuerst der Abstand zum Vormonat – er ist der sichtbarere – und unter den verbleibenden Kandidaten derjenige mit dem größten Jahresabstand.

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

Die Anker sind die Pastellfassungen der recherchierten Trendfarben (Abschnitt 4.2). Verglichen wird im selben Farbraum, in dem auch die Fläche entsteht – Name und Ton können deshalb nicht auseinanderlaufen.

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

Unterstützt werden zwei Formate: die Jahresmappe mit Monatsblättern (Personenzeilen, Tage als Spaltenköpfe) und der Einzelmonatsplan mit den Spalten Tag, Wochentag, BD, HG, RBN und 2. RBN. **Der Blattname bestimmt nur die Reihenfolge der Versuche, nicht das Format**: Schlägt die zum Namen passende Auswertung fehl, wird die andere versucht. Ein Einzelplan auf einem Blatt namens „April“ wird dadurch ebenso gelesen wie auf einem Blatt namens „Plan“.

Fehlt im Blattkopf die Jahreszahl oder der Monat, wird der angezeigte Zeitraum angenommen – beides wird vor dem Schreiben ausdrücklich bestätigt.

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

### 13.1 Unit- und Regressionstests

```bash
npm test
```

Aktuell umfasst die Suite **216 Unit- und Regressionstests**. Geprüft werden unter anderem:

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
- Ausschluss eines framebasierten Deadlocks im Update-Callback;
- Gruppierung, Rangfolge und Tippfilter des Dienst-Pickers;
- die Regressionen des Bughunts (Abschnitt 13.4);
- das Hauptthread-Budget des Monatswechsels (Abschnitt 3.8);
- Pastellbereich, Dreiachsen-Trennung und Helligkeitstakt der Monatsfarben;
- Herkunft jedes Farbnamens aus der Trendrecherche und die Zwölfmonatssperre gegen Wiederholungen.

### 13.2 End-to-End

```bash
npm run test:e2e
```

Aktuell umfasst die Browser-Suite **22 Playwright-End-to-End-Tests**, die vollständig grün laufen. Sie prüft Navigation, Auswahl- und Konfliktdialoge, Werkzeugleiste, Dateiaktionen, Monatsbadge, Seasonal Spectrum Director, PDF-Export sowie Monats- und Jahresvariation.

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

### 13.3 Vollständige Verifikation

```bash
npm run verify
```

Führt Syntaxprüfung, Unit-/Regressionstests und Playwright-End-to-End-Tests nacheinander aus.

### 13.4 Bughunt vom 02.08.2026

Die Anwendung wurde vollständig durchgesehen und aktiv auf Fehler untersucht: statische Durchsicht aller Module, Invarianten-Fuzzing der Regelengine (400 zufällige Monate, rund 280 000 Einzelbewertungen), feindliche Eingaben für Normalisierung, Sicherung und Excel-Import, die Unit-Suite unter fünf Zeitzonen von UTC−9 bis UTC+14, ein Zufallslauf über die Oberfläche mit Invariantenprüfung nach jeder Aktion sowie gezielte Szenarien für Offline-Betrieb, Jahres- und Schaltjahresgrenzen.

Gefunden und behoben wurden:

| Bereich | Fehlbild | Behebung |
|---|---|---|
| Excel-Import | Ein Einzelplan, dessen Blatt wie ein Monat heißt („April“), wurde ausschließlich als Matrixblatt versucht und dadurch **vollständig ignoriert** | Der Blattname bestimmt nur noch die Reihenfolge der Versuche; schlägt der erste fehl, greift der zweite |
| Excel-Import | Fehlte der Monat im Blattkopf, landete das Blatt stillschweigend im angezeigten Monat | `usedFallbackMonth` wird gemeldet und ausdrücklich bestätigt |
| Excel-Import | Datumszellen wurden über `toISOString()` gelesen – in Deutschland ganzjährig ein Tag zu früh | Lokale Kalenderformatierung |
| Sammeleingabe | Das Raster markierte bestehende Einträge vor, übernahm aber nur Ergänzungen: **eine gesetzte Abwesenheit ließ sich per Sammeleingabe nie wieder entfernen** | Die Auswahl ist die vollständige Aussage für den gewählten Typ; andere Typen desselben Tages bleiben unberührt |
| Dienst-Picker | Bei einem Namen aus einem Altimport meldete der Kopf „Noch nicht besetzt“, während „Eintrag löschen“ angeboten wurde | Benennung über `assignmentLabel`, das auch übernommene Namen und unbekannte IDs abdeckt |
| Server | Der **Lesezugriff** auf einen Monat legte ihn im KV-Speicher an; das Vorladen schrieb dadurch bis zu dreizehn leere Monate pro Monatswechsel | Gelesen wird ohne Schreiben, angelegt wird erst beim PUT |
| Offene Punkte | „Offene Einteilungen“ wurden über eine Textsuche nach „offen“ im Titel gezählt | Jede Meldung trägt ein `kind` (`open` / `finding`) |
| Konfliktdialog | Ein abgebrochener roter Konflikt blieb als offene Absicht im Zustand zurück | Wird beim Schließen des Dialogs verworfen |
| Sicherung | Der Dateiname der JSON-Sicherung entstand aus `toISOString()` und trug abends den Vortag | Lokaler Kalendertag |
| Datenmodell | `revision` akzeptierte Kommazahlen | Ganzzahlig abgeschnitten |
| Tabelle | Toter Zweig in der Abwesenheitszusammenfassung | Entfernt |

Ohne Befund blieben unter anderem: Regelengine und Kopplungsregeln (keine Ausnahme, kein ungültiger Bewertungsgrad, keine fehlende Begründung über alle Fuzz-Läufe), Zeitzonenverhalten, Feiertagsberechnung, Offline- und Wiederherstellungspfad, Persistenz nach schnellem Monatswechsel, RBN-Kette, Schaltjahr- und Jahresgrenzen sowie Prototype-Pollution über Sicherungsdateien.

Jede Behebung ist in `tests/bughunt-2026-08.test.js` und den zugehörigen End-to-End-Suiten festgehalten.

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
