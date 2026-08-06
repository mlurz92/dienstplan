# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion** `0.10.5` · **Regelwerk** Eignungsregeln `v4.11` · **Auto-Plan** `v10` — *Exact Boolean Rostering Core*
> **Feiertagsregion** Sachsen (`SN`) · **Betrieb** Cloudflare Pages · Pages Functions · Workers KV · lokale Browsersicherung
> **Technik** reines ES-Modul-Frontend ohne Build-Schritt, ohne Bundler, ohne Laufzeitabhängigkeit von fremden Diensten

DienstplanRAD ist der Dienstplaner einer radiologischen Klinik. Er verbindet
kontrollierbare Handplanung mit einer bestätigungspflichtigen automatischen
Komplettierung offener Dienste. Was von Hand gesetzt wurde, ist unantastbar;
was die Maschine vorschlägt, wird vollständig gegen dasselbe Regelwerk geprüft,
das auch die Handplanung bewertet — und erst nach ausdrücklicher Übernahme Teil
des Plans.

---

## Inhalt

1. [Was die Anwendung leistet](#1-was-die-anwendung-leistet)
2. [Fachlicher Rahmen](#2-fachlicher-rahmen)
3. [Das Regelwerk](#3-das-regelwerk)
4. [Die Oberfläche](#4-die-oberfläche)
5. [Erscheinungsbild und Farbsystem](#5-erscheinungsbild-und-farbsystem)
6. [Auto-Plan v10](#6-auto-plan-v10)
7. [Das Auto-Plan Studio](#7-das-auto-plan-studio)
8. [Ein- und Ausgabe](#8-ein--und-ausgabe)
9. [Datenmodell und Persistenz](#9-datenmodell-und-persistenz)
10. [Einstellungen](#10-einstellungen)
11. [Leistung](#11-leistung)
12. [Barrierefreiheit](#12-barrierefreiheit)
13. [Qualitätssicherung](#13-qualitätssicherung)
14. [Projektstruktur](#14-projektstruktur)
15. [Entwicklung und Betrieb](#15-entwicklung-und-betrieb)
16. [Grenzen](#16-grenzen)

---

## 1. Was die Anwendung leistet

- **Tabellarische Monatsansicht** mit Bereitschaftsdienst (BD), Hintergrunddienst (HG),
  neuroradiologischer Rufbereitschaft (RBN) und zweiter RBN — eine Zeile je Kalendertag.
- **Regelgestützte Auswahl** mit fünfstufiger Bewertung (grün, gelb, orange, rot, grau)
  und vollständiger Begründung an jedem einzelnen Kandidaten.
- **Abwesenheiten, Dienstwünsche, Optionen und Notizen** je Person und Tag,
  einzeln oder als Mehrtagesauswahl.
- **Revisionsfähige Ausnahmebestätigungen:** Eine rote Einteilung ist möglich,
  aber nur mit ausdrücklicher Bestätigung und Begründung, die protokolliert wird.
- **Monatsstatistik** mit Sollvergleich, Wochenendäquivalenten und Restwerten
  sowie eine laufende Sammelprüfung „Offene Punkte".
- **Auto-Plan v10** als exakte boolesche Suche (CP-SAT) mit lexikografischer
  Zielkaskade, Leximin-Fairness, Optimalitätsnachweis, Konfliktdiagnose und
  vollwertiger Heuristik als Warmstart *und* Rückfallebene.
- **Ein Eingang für alle Dateien:** Excel-Mappen, PDF-Ausdrucke und
  JSON-Sicherungen über dieselbe Schaltfläche.
- **Ausgabe** als Excel-Arbeitsmappe, als direkt heruntergeladene PDF-Datei
  `Dienstplan JJJJ-MM.pdf` (A4 hochkant, garantiert eine Seite) und als
  vollständige JSON-Sicherung.
- **Server-first-Synchronisierung** mit lokaler Offline-Sicherung und
  Wiederabgleich.

### Die acht Leitprinzipien

1. Die produktive Regelengine ist die einzige fachliche Wahrheitsquelle.
2. Auto-Plan verändert ausschließlich zuvor **leere** BD-/HG-Felder des sichtbaren Monats.
3. Fixpunkte, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
4. Graue, also technisch nicht wählbare Besetzungen sind in jeder Stufe ausgeschlossen.
5. Personengebundene BD-, HG- und Gesamtobergrenzen gelten in Konstruktion, Rescue,
   Reparatur und Perfektion gleichermaßen.
6. Rote Abweichungen sind ausschließlich der letzte, ausdrücklich freigegebene Fallback.
7. Bis zur bewussten Übernahme erfolgt keine Mutation des Monatsplans.
8. Vor der Übernahme wird der vollständige Vorschlag erneut gegen das aktuelle
   Regelwerk auditiert.

---

## 2. Fachlicher Rahmen

### 2.1 Die vier Dienstfelder

| Feld | Bedeutung | Geplant durch |
|---|---|---|
| **BD** | Bereitschaftsdienst | Hand **und** Auto-Plan |
| **HG** | Hintergrunddienst | Hand **und** Auto-Plan |
| **RBN** | neuroradiologische Rufbereitschaft | ausschließlich Hand |
| **2. RBN** | zweite Rufbereitschaft | ausschließlich Hand |

BD und HG sind Personenfelder aus dem Planungsstamm. RBN und 2. RBN sind
Namensfelder aus einem eigenen, serverseitig gepflegten Namenspool; die zweite
RBN ist nur an Tagen wählbar, an denen sie fachlich vorgesehen ist. Der
Auto-Plan rührt die beiden Rufbereitschaften nicht an — sie folgen einem
eigenen, außerhalb dieser Anwendung abgestimmten Plan und werden in aller Regel
importiert.

### 2.2 Personal

Jede Person im Stamm trägt:

| Feld | Bedeutung |
|---|---|
| `id` | stabile technische Kennung |
| `name` | vollständiger Name (Statistik, Tooltip, Ausdruck) |
| `short` | Kurzname für die schmalen Tabellenspalten |
| `category` | `fa` (Facharzt/Fachärztin) oder `aa` (Assistenzarzt/-ärztin) |
| `roleLabel` | angezeigte Funktionsbezeichnung, etwa `FA/OA`, `FÄ/OÄ`, `AA`, `AÄ` |
| `activeFrom` / `activeUntil` | Zeitraum der Zugehörigkeit |
| `includeInPlanning` | nimmt an der Dienstplanung teil |
| `includeInAbsenceList` | erscheint in der Abwesenheitsverwaltung |
| `bdTarget` | monatlicher BD-Richtwert (Soll) |
| `maxBd` | hartes monatliches BD-Maximum, oder `null` |
| `canHg` | darf Hintergrunddienst übernehmen |
| `canSaturdayBd` | darf Samstags-BD übernehmen |
| `promotionDate`, `promotedRoleLabel`, `promotedCanHg`, `promotedCanSaturdayBd` | Aufstieg zum Stichtag: Ab diesem Datum gelten die neuen Rechte und die neue Bezeichnung |

Der **Aufstieg zum Stichtag** ist keine Kosmetik, sondern regelwirksam: Eine
Assistenzärztin, die zum 22. September Fachärztin wird, ist am 21. September für
den Hintergrunddienst gesperrt und am 22. September dafür freigegeben — in der
Kandidatenliste, in der Statistik und im Optimierungsmodell gleichermaßen.

Der ausgelieferte Standardstamm umfasst neun Personen in fester Reihenfolge
(`STAFF_ORDER`), davon sechs mit Facharztstatus und drei in Weiterbildung. Die
Anwendung liest ihn beim ersten Start; danach ist der auf dem Server
gespeicherte Stand maßgeblich.

### 2.3 Kalender und Feiertage

Der Kalender ist sächsisch. `js/holidays.js` berechnet je Jahr:

- feste Tage: Neujahr, Tag der Arbeit, Tag der Deutschen Einheit,
  Reformationstag, 1. und 2. Weihnachtsfeiertag;
- bewegliche Tage aus dem Ostersonntag (Gaußsche Osterformel):
  Karfreitag (−2), Ostermontag (+1), Christi Himmelfahrt (+39), Pfingstmontag (+50);
- Buß- und Bettag: der Mittwoch vor dem 23. November.

Die Berechnung ist je Jahr zwischengespeichert. Aus ihr leiten sich die
Feiertagszeilen der Tabelle, die Feiertagsregeln des Regelwerks und der Begriff
„nächster regulärer Werktag" ab, der Wochenenden **und** Feiertage überspringt.

---

## 3. Das Regelwerk

`js/rules*.js` ist die verbindliche Wahrheit. Jede Bewertung eines Kandidaten
für ein Feld liefert eine Stufe und eine Liste von Begründungen — dieselbe
Funktion, die die Kandidatenliste färbt, entscheidet auch über jeden
Auto-Plan-Vorschlag.

### 3.1 Die fünf Stufen

| Stufe | Bedeutung | Wählbar |
|---|---|---|
| **grün** | fachlich unbedenklich | ja |
| **gelb** | Hinweis, meist Ausgleichs- oder Abstandsfragen | ja |
| **orange** | Konflikt, fachlich unerwünscht, aber zulässig | ja |
| **rot** | Verstoß; nur mit ausdrücklicher Bestätigung und Begründung | nur bestätigt |
| **grau** | technisch nicht wählbar | nein |

Rot kennt zusätzlich einen **besonderen Bestätigungstyp** für die
Wochenendkette; er verlangt einen begründenden Kommentar.

### 3.2 Graue Sperren — nicht verhandelbar

- unbekannte Dienstrolle;
- Person nicht im aktiven Dienstpool des Tages;
- Person zu diesem Zeitpunkt noch nicht oder nicht mehr aktiv (`activeFrom`/`activeUntil`).

### 3.3 Rote Regeln

**Qualifikation und Person**

- Hintergrunddienst nur für Fachärztinnen und Fachärzte.
- Samstags-BD nur für Fachärztinnen und Fachärzte.
- Dr. Polednia übernimmt dienstags und sonntags weder BD noch HG.

**Verfügbarkeit**

- eingetragene Abwesenheit (Urlaub, FZA/Frei, Weiterbildung, sonstige);
- Dienstwunsch „kein Dienst", „kein BD", „kein HG";
- gleichzeitige Einteilung in BD und HG am selben Tag (beide Richtungen);
- Monatsmaximum an Bereitschaftsdiensten bereits erreicht.

**Ruhezeit und Dienstfolge**

- BD bereits am Vortag;
- BD bereits am Folgetag;
- **Der Tag nach einem BD ist dienstfrei** — auch für den Hintergrunddienst.
  Ausgenommen sind Samstag und Sonntag: Dort ist der HG unmittelbar nach einem
  BD zulässig und bildet die bekannte Wochenendbündelung (Fr-BD · Sa-HG und
  Sa-BD · So-HG). Der **Freitag zählt nicht als Wochenende**: Ein Donnerstags-BD
  lässt den Freitag genauso dienstfrei wie jeden anderen Werktag.
- HG am Werktag (Mo–Do) unmittelbar vor dem eigenen BD des Folgetags.
- Für Dr. Becker ist der nächste reguläre Werktag nach einem Samstags-BD für BD
  gesperrt (Freizeitausgleich).

**Wochenende**

- BD-Wochenende direkt neben einem BD-Wochenende.
- Kopplung: Ein AA-Freitags-BD verlangt dieselbe Person im Freitags-HG und im
  Samstags-BD.
- Kopplung: Ein AA-BD am Feiertagsvortag verlangt dieselbe Person im Vortags-HG
  und im Feiertags-BD.
- Wochenendkette Fr-BD · Sa vollständig frei · So-BD: beide BD-Zellen sind rot
  und **besonders** bestätigungspflichtig. Die Prüfung ist symmetrisch.

### 3.4 Orange Konflikte

- Dienst an aufeinanderfolgenden Wochenenden;
- bereits Dienst im alternierenden Oster-/Pfingstblock;
- Samstags-BD für Dr. Becker nur nachrangig;
- Dalitz-HG an Sonntag/Montag bei Sebastian-BD nur nachrangig;
- BD unmittelbar vor Urlaubsbeginn;
- Freitags-BD vor einem zusammenhängenden Urlaubsblock ab spätestens Montag;
- eigener HG am Vortag vor dem BD (außerhalb der Werktagssperre);
- dritter HG an drei aufeinanderfolgenden Tagen.

### 3.5 Gelbe Hinweise

- zusätzliche, nicht gekoppelte Mehrfachbelastung am selben Wochenende;
- BD–FZA–BD werktags;
- kurzer Abstand zum letzten oder zum nächsten BD;
- BD-Richtwert bereits erreicht;
- erneuter HG innerhalb von drei Kalendertagen;
- **Monatsausgleich:** andere geeignete Personen haben größeren BD-Rückstand
  (mit Angabe der Zahlen);
- erster BD-Überhang nach Monatsausgleich nachrangig;
- **BD/HG-Ausgleich:** andere Fachärzte haben geringere kombinierte Monatslast;
- **AA-HG-Ausgleich:** andere Fachärzte haben weniger HG für Assistenzärzte übernommen.

Die drei Ausgleichsregeln sind die Fairnessschicht der Handplanung: Sie nennen
Zahlen statt Meinungen und benennen ausdrücklich, wer stattdessen an der Reihe
wäre.

### 3.6 Abwesenheiten, Wünsche und Optionen

| Kategorie | Werte |
|---|---|
| **Abwesenheit** | Urlaub · FZA/Frei · Weiterbildung · Sonstige Abwesenheit |
| **Dienstwunsch** | Kein BD · Kein HG · Kein Dienst · BD bevorzugt · HG bevorzugt · Dienst bevorzugt |
| **Option** | BD möglich · HG möglich |

Abwesenheiten und Sperrwünsche wirken hart (rot), Bevorzugungen weich: Sie gehen
als Wunscherfüllung in die Zielordnung des Auto-Plans ein. Optionen erweitern
die Verfügbarkeit für einen einzelnen Tag, ohne den Personalstamm zu ändern.

Abwesenheiten tragen eine **Quelle** (`absenceSources`): Ein aus einer
Jahresmappe importierter Urlaub bleibt als solcher erkennbar und wird bei einem
erneuten Import derselben Quelle sauber ersetzt statt verdoppelt.

---

## 4. Die Oberfläche

### 4.1 Aufbau

```text
Kopfleiste     Marke · Monats-/Jahreswahl · Vor/Zurück · Speicherstatus
Command Bar    Planung | Daten | Ausgabe            + Theme · Einstellungen (fixiert)
Arbeitsfläche  Monatskopf mit Monatskontrast
               Plantabelle (8 Spalten)
               Statistik
               Offene Punkte
```

### 4.2 Die Command Bar

Semantisch gegliedert in drei Gruppen; jede Aktion trägt ein SVG-Piktogramm:

| Gruppe | Aktionen |
|---|---|
| **Planung** | Aktueller Monat · Abwesenheiten · Wünsche/Optionen · Monat leeren |
| **Daten** | Serverstand neu laden · Datei importieren |
| **Ausgabe** | Excel exportieren · PDF herunterladen · JSON sichern |

Rechts steht ein dauerhaft erreichbarer Block aus **Theme-Umschalter** und
**Zahnrad**. Er ist bewusst keine Gruppe: Als beschriftete Schaltfläche wanderte
er als Erstes ins Überlaufmenü, sobald es eng wurde — ausgerechnet der Zugang,
der immer erreichbar sein soll.

**Fünf Dichtestufen**, gemessen an der tatsächlichen Containerbreite, nicht an
starren Viewport-Schwellen:

1. Gruppenüberschriften und Beschriftungen;
2. ohne Gruppenüberschriften;
3. Beschriftungen nur für primäre Planungsaktionen;
4. reine Symbole;
5. Überlaufmenü für Daten- und Ausgabeaktionen.

### 4.3 Die Plantabelle

Acht Spalten: **Tag · Wochentag · BD · HG · RBN · 2. RBN · Urlaub/FZA ·
Kein Dienst/Wünsche/Optionen**. Die beiden letzten sind Zusammenfassungsspalten
und erscheinen nicht im Ausdruck.

- Die **Tagesspalte** ist rechtsbündig, fett und trägt bei Wochenenden und
  Feiertagen eine farbige Randmarke — Samstag im Monatsakzent, Sonntag im
  kräftigen Akzent, Feiertag in der Monatstinte.
- Die **Wochentagsspalte** trägt in *jeder* Zeile die kräftige Nuance des
  Monats. So entsteht ein durchgehender senkrechter Anker, an dem die hellen
  waagerechten Wäschen entlanglaufen, statt ihn zu unterbrechen. Bei einem
  Feiertag steht dessen Name klein unter dem Wochentag.
- **BD und HG** sind Schaltflächen mit dem Kurznamen; der vollständige Name und
  sämtliche Begründungen stehen im Tooltip. Ein unbesetztes Feld zeigt einen
  Gedankenstrich und die Marke „offen".
- **RBN und 2. RBN** sind Auswahlfelder aus dem Namenspool. Ein Name, der nicht
  mehr zum Pool gehört, bleibt als gesperrter Eintrag lesbar — der Plan zeigt,
  was da steht, statt es zu verschweigen.
- Zeilen werden in einem Dokumentfragment gebaut und in einem Zug eingehängt:
  Einzeln eingehängte Zeilen ließen den Browser den Tabellenfluss 31-mal neu
  bestimmen, mitten in der Wechselanimation.

### 4.4 Der Auswahldialog

Ein Klick auf ein BD- oder HG-Feld öffnet den Auswahldialog. Er ist der Ort, an
dem das Regelwerk sichtbar wird:

- **Kopf:** Rolle, Datum in Langform, aktueller Stand („Noch nicht besetzt" oder
  der bestehende Eintrag).
- **Sofortfilter:** Tippen filtert die Namen; der erste wählbare Eintrag ist
  vorausgewählt, ⏎ übernimmt ihn.
- **Drei Gruppen mit Zählern:** *Empfohlen*, *Nachrangig*, *Nicht verfügbar*.
- **Je Person:** Name, Funktionsbezeichnung, der **wichtigste** Grund im
  Klartext, ein Zähler „+n" für weitere Gründe, die aktuelle BD-Last gegen das
  Soll („BD 2/4") und die farbige Stufenmarke.
- **Detailfeld** unter der Liste: alle Gründe der markierten Person vollständig.
- **Tastatur:** ↑/↓ wählen, ⏎ übernimmt, `Esc` schließt.
- Rote Auswahl führt in den **Bestätigungsdialog**: Er nennt die Gründe, verlangt
  eine Begründung und schreibt beides in das Änderungsprotokoll des Monats.

### 4.5 Mehrtagesauswahl für Abwesenheiten und Wünsche

Ein Raster aus Tageskacheln für den ganzen Monat, je Kachel Tagesnummer,
Wochentag und aktueller Eintrag. Person und Typ werden oben gewählt, Tage per
Klick markiert, „Übernehmen" schreibt alles in einem Zug. Wochenend- und
Feiertagskacheln sind farblich abgesetzt, Feiertage tragen ihren Namen.

### 4.6 Tagesdetails

Die Zusammenfassungsspalten öffnen einen Dialog mit allen Personen des Tages und
je Person drei Reihen aus Auswahlmarken: **Abwesenheit**, **Dienstwunsch**,
**Optionen**. Mehrfachauswahl je Datum, Änderungen werden automatisch gesichert.

### 4.7 Statistik und offene Punkte

Die **Statistik** unter dem Plan zeigt je Person BD, HG, Wochenendäquivalent,
BD-Soll und Rest; die abschließende Zeile „Offen" nennt die noch unbesetzten BD-
und HG-Felder. Das Wochenendäquivalent gewichtet Wochenend- und Feiertagsdienste
und ist auf eine Nachkommastelle gerundet.

**Offene Punkte** ist die sichtbare Sammelprüfung des Monats: jede offene
Einteilung und jede Auffälligkeit als eigene Zeile mit Datum, Rolle und Grund,
farblich nach Stufe abgesetzt. Die Kopfzeile fasst zusammen („62 offene
Einteilungen · 0 Auffälligkeiten"). Die Prüfung ist die teuerste Einzelarbeit
des Renderings und läuft deshalb erst, wenn der Hauptthread wieder frei ist —
Tabelle, Titel und Statistik erscheinen sofort.

### 4.8 Statusanzeige

Ein Punkt mit Text in der Kopfleiste, mit Zuständen für *Lädt*, *Gespeichert*,
*Offline – lokal gesichert*, *Lokale Änderungen noch nicht synchronisiert*,
*Serverfehler* und *Ungültiger Monat*. Der Titel des Blocks nennt den
Auslieferungsstand („DienstplanRAD · Stand JJJJMMTT.n").

### 4.9 Erklärende Tooltips

`js/rich-tooltip-v8-5.js` vereinheitlicht die zuvor verteilten nativen
`title`-Hinweise: Maus **und** Tastaturfokus, `role="tooltip"`, Verknüpfung über
`aria-describedby`, Schließen mit `Esc`, automatische Positionierung ober- oder
unterhalb des Auslösers, native `title`-Rückfallebene, wenn die Rich Tooltips in
den Einstellungen abgeschaltet sind.

### 4.10 Monatswechsel

Der Wechsel ist eine gerichtete Bewegung: Inhalte ziehen in die Richtung des
Wechsels ein, ein Sättigungspuls verbindet Farb- und Inhaltswechsel zu *einer*
wahrgenommenen Bewegung. Benachbarte Monate werden vorgeladen, damit der
Wechsel nicht auf das Netz wartet. Bei `prefers-reduced-motion: reduce`
entfallen die Animationen vollständig.

---

## 5. Erscheinungsbild und Farbsystem

### 5.1 Der Monatskontrast

Jeder Monat trägt eine eigene Farbe aus einem Trend-Atlas
(`js/color-atlas-*.js`). Sie ist nicht dekorativ, sondern Orientierung: Beim
Blättern erkennt man den Monat an seiner Farbe, bevor man die Überschrift liest.
Die Plakette rechts im Kopf nennt sie beim Namen („Monatskontrast · Festival
Fuchsia"), ihr Tooltip die Herkunft (Saison, Familie, Ton, Stimmung, Jahrgang).

Der Atlas ist kein Zufallsgenerator: Er hält Mindestabstände zwischen benachbarten
Monaten, über das Jahr, gegenüber den zuletzt verwendeten Farben und in der
Verteilung der Farbsektoren ein. Aus der Akzentfarbe leitet
`spectrumVariables()` alle abhängigen Token ab — kräftiger Akzent, Tinte,
Schein, Panel-Tönung sowie die Flächen für Wochentag, Samstag, Sonntag und
Feiertag.

Der Farbwechsel läuft als Interpolation in OkLCh über eine rAF-Schleife; ein
heller Sweep begleitet ihn. Der Direktor besitzt die sichtbare Farbe: Das
Basistheme schreibt die Farbvariablen nicht, solange er geladen ist.

**Drei Farbsysteme** stehen zur Wahl: `spectrum` (Trend-Atlas, Standard),
`classic` (feste Monatspalette) und `neutral` (keine Einfärbung).

### 5.2 Hell und Dunkel

Der Umschalter wechselt direkt zwischen `light` und `dark` und trägt
ausschließlich das Sonnen- beziehungsweise Mondpiktogramm. Die Anwendung startet
im hellen Erscheinungsbild; eine ausdrücklich gespeicherte Auswahl bleibt
erhalten. Die Auswahl wird lokal und **vor** dem Server-Bootstrap angewendet,
damit kein Farbblitz entsteht.

**Die Monatstoken werden für das aktive Erscheinungsbild gerechnet.**
`spectrumVariables(palette, { scheme })` bildet denselben Farbton einmal auf
Weiß und einmal auf eine dunkle Grundfläche ab: Im Dunkeln ist die Tinte hell,
der kräftige Akzent hellt auf statt abzudunkeln, und eine Wochenendzeile ist
eine angehobene dunkle Fläche statt einer aufgehellten. Das ist keine Feinheit:
Der Direktor schreibt seine Variablen mit `!important` inline an `<html>` — was
er falsch rechnet, kann kein Stylesheet mehr korrigieren.

**`dark-contrast.css`** löst, was an der Quelle nicht lösbar ist. Die
Grundregeln setzen für Bedienelemente eine weiße Fläche mit fester dunkler
Schrift; alles, was davon erbt, trug im Dunkeln dunkle Schrift auf dunklem
Grund. Die Datei wird zuletzt geladen, wirkt ausschließlich über
`html[data-color-scheme="dark"]` und ist im Hellmodus ohne jede Wirkung.

Für den Druck gelten immer die hellen Werte: Papier ist weiß, und
`prepareForPrint` stellt sie für die Dauer des Drucks her.

### 5.3 Glasoptik ohne Weichzeichner

Milchglas entsteht nicht durch Durchsichtigkeit, sondern durch die Kante:
Lichtlinie oben, feine Brechung unten, ein präziser, farbig gefasster Rand. Der
frühere `backdrop-filter: blur(22px)` lag auf Kopfleiste, Werkzeugleiste,
Einfassungen, Dialogkarte und Plakette — gemessen kostete er ein Viertel der
Bildrate beim Monatswechsel (15 statt 19 fps) und trug hinter einer zu 97,5
Prozent deckenden Fläche nichts mehr bei. Geblieben ist er an genau einer
Stelle: hinter einem geöffneten Dialog.

### 5.4 Weitere Darstellungsschalter

| Schalter | Wirkung |
|---|---|
| **Informationsdichte** | `comfortable` (mehr Luft) oder `compact` (mehr Plan auf einmal) |
| **Wochenenden hervorheben** | verstärkt die farbliche Absetzung von Samstag, Sonntag und Feiertag; abgeschaltet tragen sie den Werktagsgrund |
| **Atmosphärischer Hintergrund** | die weichen Farbfelder hinter der Arbeitsfläche; abgeschaltet wird die Seite spürbar ruhiger und auf schwacher Grafik flüssiger |
| **Erklärende Tooltips** | Rich Tooltips an oder aus (dann native `title`) |
| **Bewegung** | folgt der Systempräferenz |

---

## 6. Auto-Plan v10

### 6.1 Architektur

```text
Fixpunkte/Domänen · Fairness-Gedächtnis der Vormonate
  → Warmstart-Heuristik (vollständige v8.5-Pipeline)
  → Modellbau: je Feld und zulässiger Person eine Binärvariable
  → lexikografische Kaskade: Stufe minimieren, Wert per Sperrschnitt
    festschreiben, Lösung als Hinweis in die nächste Stufe
  → Regelengine-Schlussaudit (einzige fachliche Wahrheitsquelle)
  → bei erreichter unterer Schranke: Optimalitätsnachweis je Stufe
  → bei Unlösbarkeit: Korrekturmengen-Diagnose in einem einzigen Lauf
  → ohne WebAssembly: die Heuristik trägt den Lauf vollständig allein
```

Acht Stufen werden im Studio einzeln ausgewiesen: *Fixpunkte und Domänen*,
*Warmstart*, *Modellbau*, *Lexikografische Kaskade*, *Reparatur und
Nachbarschaft*, *Perfektion*, *Regelengine-Schlussaudit*, *Optimalitätsnachweis*.

### 6.2 Warum ein boolesches Modell

Die Vorgängerfassung führte je offenem Feld eine ganzzahlige Variable mit einem
Personencode als Wert. In dieser Darstellung ist „Person p hat höchstens vier
Bereitschaftsdienste" linear **nicht** ausdrückbar — die Summe von
Personennummern ist keine Einsatzzahl. v10 stellt deshalb je Paar aus Feld und
zulässiger Person eine Binärvariable `y[f][p]` und fordert `Σ_p y[f][p] = 1`.
Erst damit werden Kardinalität, Fairness, Wünsche und Stabilität überhaupt
formulierbar. Auf derselben Instanz (30 Tage, 60 offene Felder, 8 Personen)
sinkt die Zahl der harten Bedingungen von 2.036 auf 684, die der Hilfsvariablen
von 1.058 auf 47.

### 6.3 Was das Modell hart fordert

1. **Qualifikation** — strukturell: Für unzulässige Paare aus Feld und Person
   entsteht gar keine Variable. Diese Gruppe ist damit nicht relaxierbar und
   erscheint folgerichtig in keiner Korrekturmenge.
2. **Vollständige Besetzung** — genau eine Person je offenem Feld.
3. **Keine Doppelbelegung** am selben Tag.
4. **Kein BD an zwei aufeinanderfolgenden Kalendertagen.**
5. **Ruhezeit nach BD** — der Folgetag ist dienstfrei, auch für den HG;
   ausgenommen Samstag und Sonntag.
6. **HG an einem Werktag (Mo–Do)** schließt den BD am Folgetag aus.
7. **Freizeitausgleich Becker** — aus jedem BD folgt ein wirksamer FZA am
   nächsten regulären Werktag, dort weder BD noch HG. Modelliert als Implikation
   über zwei Literale, ohne big-M.
8. **Personengebundene Obergrenzen** für BD, HG und Gesamtlast.

### 6.4 Die weichen Ziele

Als Stufen einer lexikografischen Kaskade, im Studio frei sortierbar:

| Stufe | Ziel |
|---|---|
| `fairness` | gleichmäßige Gesamtlast (Leximin) |
| `wishes` | erfüllte Dienstwünsche |
| `bdTarget` | Abweichung vom BD-Soll |
| `weekendChain` | Wochenendkette Fr-BD · Sa frei · So-BD |
| `weekend` | Wochenendlast |
| `saturday` | Samstagslast |
| `hgBurden` | Hintergrunddienstlast |
| `ctLeadership` | CT-Leitung am Freizeitausgleichstag |

**Lexikografisch statt gewichtet.** Gewichte über unvergleichbare Ziele sind
Scheingenauigkeit — niemand kann angeben, wie viele Wunscherfüllungen eine
Einheit Ungleichverteilung wert sind. Stattdessen wird stufenweise optimiert und
jeder erreichte Wert per Sperrschnitt festgeschrieben. Die Rangfolge der Stufen
*ist* die ehrliche Form der Gewichtung.

**Leximin über sortierte Lastvektoren.** Zuerst wird die Höchstlast gesenkt,
dann die nächstniedrigere Stufe — umgesetzt über die Summe der Überschüsse
oberhalb absteigender Schwellen, die lineare Form der geordneten
Mittelwertbildung. Varianz und Summenstrafen tauschen eine sehr ungleiche
Verteilung gegen viele kleine Abweichungen ein; Leximin tut das nicht.

**Minimal-Perturbation** ist die letzte Stufe: Stabilität entscheidet
Gleichstände, kostet aber nie Qualität.

### 6.5 Fairness über Monatsgrenzen

Ein Fairness-Gedächtnis über bis zu sechs abgeschlossene Monate hebt den
Startwert derjenigen an, die zuletzt über dem Mittel lagen, und entlastet sie
damit in der Lastminimierung. Der Vergleichskreis ist das planbare Personal des
*aktuellen* Monats — nicht nur, wer in den Vormonaten vorkam. Sonst bestünde die
Gruppe aus genau den Personen mit Vorlast, ihr Mittel wäre deren eigenes, und
der Versatz aller Beteiligten wäre null: Das Gedächtnis wäre wirkungslos.

Fenster und Gewicht sind einstellbar (Standard: drei Monate, 50 Prozent).

### 6.6 Die Heuristik — Warmstart und Rückfallebene

```text
Fixpunkte/Domänen
  → striktes Konstruktionsportfolio (Beam-Suche mit Vorwärts-Checking)
  → profilabhängige Null-Rot-Intensivierung („Rescue")
  → Minimal-Rot-Fallback nur nach ausgeschöpfter strikter Suche
  → iterative Tausch- und lokale Reparatur
  → diversifizierte ALNS-Perfektion (Ruin-and-Recreate)
  → vollständige Zertifizierung
```

Die Perfektionsphase nutzt acht Zerstörungs- und drei Wiederaufbauoperatoren
einschließlich Regret-2, segmentweise adaptive Operatorgewichte,
Late-Acceptance-Annahme, Luby-Neustarts und absteigende Nachbarschaften mit
Einzelumsetzung, Paartausch, Rollentausch, Dreierkette, Tages- und
Wochenendpaket.

| Profil | Reparaturrunden | lokales Neuplanungsbudget | Late Acceptance | strikte Wellen | Rescue-Breite |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ausgewogen | 4 | 4.000 | 300 | 2 | 148 % |
| Intensiv | 6 | 6.500 | 500 | 3 | 180 % |
| Exhaustiv | 8 | 10.000 | 900 | 4 | 225 % |

Jede strikte Welle erhöht begrenzt Beam-Breite, Kandidatenfächer und Budget des
exakten Restbacktrackings. `allowRedFallback`, `maxRedViolations` und
`profileFilter` werden für sämtliche strikten Wellen hart auf Null-Rot gesetzt.

#### Gerichtete Regeln brauchen einen Blick zurück

Die Kandidatenprüfung bewertet immer nur das Feld, das gerade besetzt wird.
Mehrere harte Regeln sind aber **gerichtet**: „Der Tag nach einem BD ist
dienstfrei" wertet den *Hintergrunddienst* ab, nicht den Bereitschaftsdienst,
der ihn ungültig macht. Wird der HG zuerst gesetzt und der BD des Vortags
später, sieht die Prüfung des BD nichts — und die Bewertung des HG stammt aus
einer Zeit, in der es den BD noch nicht gab.

Deshalb prüft die Konstruktion bei jedem Kandidaten zusätzlich, ob die bereits
gesetzten Dienste **derselben Person** in einem Fenster von drei Kalendertagen
gültig bleiben. Drei Tage sind die Reichweite der weitesten gerichteten Regel:
Der Freizeitausgleich nach einem Samstags-BD sperrt den nächsten regulären
Werktag, über ein Wochenende hinweg also den übernächsten Tag. Alles darüber
hinaus prüft das Regelwerk symmetrisch und fällt schon bei der zweiten Zuweisung
auf.

Ohne diese Prüfung trug der Suchstrahl fehlerhafte Knoten bis zum Ende durch,
das Schlussaudit verwarf den fertigen Monat, und der Lauf meldete am Ende null
Vorschläge bei 56 offenen Feldern. Nicht die Suche war zu schwach — sie prüfte
nur in die falsche Richtung. `tests/auto-plan-neighbour-validity.test.js` hält
den Fall fest.

Zusätzlich bewahrt die Konstruktion den tiefsten Suchstrahl, der noch Varianten
getragen hat. Bricht der Strahl zusammen, ist damit nicht alles verloren: Der
beste Teilstand bleibt als Vorschlag erhalten und zeigt, wo der Monat wirklich
klemmt.

### 6.7 Audit, Nachweis und Diagnose

- **Schlussaudit.** Jeder Vorschlag durchläuft die vollständige produktive
  Regelengine. Gewonnen wird ausschließlich nach deren lexikografischer
  Zielordnung: Laufgrenzen, graue Besetzungen, offene Felder, rote Obergrenze,
  rote Verstöße, besondere rote Verstöße, orange, gelb, danach die weichen
  Ziele. Das Modell ist eine Suchhilfe, kein zweites Regelwerk.
- **Optimalitätsnachweis.** Trifft der Zielwert einer Stufe ihre bewiesene
  untere Schranke, ist sie beweisbar optimal. Das Ergebnis weist aus, wie viele
  Stufen den Nachweis erreicht haben.
- **Korrekturmengen-Diagnose.** Bei Unlösbarkeit wird jede relaxierbare
  Regelgruppe an ein Literal gebunden und die gewichtete Summe der eingehaltenen
  Gruppen maximiert. Ein einziger Lauf sagt, welche Regeln aufgegeben werden
  müssten, und liefert den zugehörigen Plan mit. Ausgewiesen wird ehrlich als
  „im Zeitbudget nachgewiesen", nicht als Minimum.
- **Verteilungskennzahlen.** Jain-Index und Gini-Koeffizient stehen an jedem
  Ergebnis, gleich ob es aus der exakten Suche oder aus der Heuristik stammt.
- **Determinismus.** Der Heuristik-Seed leitet sich aus Konfiguration und
  Monatszustand ab. Für die exakte Kaskade gilt: reproduzierbar, solange jede
  Stufe innerhalb ihres Budgets den Optimalitätsnachweis erreicht.

### 6.8 Der Solver

`cpsat-js` (Apache-2.0) läuft als WebAssembly im Browser, als selbsttragendes
Bündel unter `vendor/cpsat-js/dist/cpsat-portable.bundle.js`. Der portable Build
braucht **keine** Cross-Origin-Isolation; `Cross-Origin-Embedder-Policy`
entfällt dadurch und mit ihr das Risiko, Fremdressourcen ohne CORP-Kopfzeile zu
blockieren. Ist der Solver nicht ladbar, trägt die Heuristik den Lauf allein —
kontrolliert und ausgewiesen, nicht stillschweigend.

### 6.9 Übernahme

Der Vorschlag ist bis zur Übernahme reine Anzeige. Die Übernahme prüft vor dem
Schreiben:

- den **Fingerabdruck des Ausgangsmonats** — hat sich der Plan zwischenzeitlich
  geändert, wird abgewiesen;
- die **Unversehrtheit jedes Fixpunkts** — eine veränderte gesetzte Einteilung
  bricht den Vorgang ab;
- den **Fingerabdruck der Perfektionsparameter**.

Erst danach werden die Änderungen atomar in den Monat geschrieben.

### 6.10 Reparatur nach Änderung

Nach einer manuellen Änderung wird ein Fenster um die Änderung geöffnet und
alles außerhalb fixiert — exakt für das Fenster, der Rest des Plans bleibt in
Ruhe.

### 6.11 Parallelität

Die Zahl der Perfektionsstränge ist automatisch oder explizit einstellbar. Das
effektive Worker-Budget ist das Minimum aus verfügbaren logischen Kernen,
reservierten UI-Kernen, Leistungsprofil, Gerätespeicher und Zahl offener
Dienstfelder. Die fachliche Regelberechnung ist in Web Workers identisch zur
manuellen Bewertung — es existiert keine vereinfachte zweite Regelengine.

---

## 7. Das Auto-Plan Studio

### 7.1 Sachgruppen statt Spaltenraster

Alle Regler sind unabhängig von ihrer Herkunft in aufklappbare Sachgruppen
sortiert: *Ziele und ihre Reihenfolge*, *Exakte Suche*, *Heuristik, Reparatur
und Perfektion*, *Grenzen und Freigaben*, *Darstellung des Laufs*. Die Gruppen
sind voreingestellt offen — Einklappen ist ein Angebot, keine Voreinstellung;
der zuletzt gewählte Zustand wird lokal gemerkt. Die Spaltenzahl folgt über
Container-Abfragen dem tatsächlich verfügbaren Platz, nicht der Fensterbreite.

### 7.2 Kein Regler ohne Wirkung

| Regler | Wirkung |
| --- | --- |
| Rangfolge der Ziele | die lexikografische Priorität — ersetzt jede Gewichtung |
| Leximin-Tiefe | Ränge des sortierten Lastvektors, die exakt festgezurrt werden |
| HG-Gewicht in der Last | wie stark ein HG gegenüber einem BD als Belastung zählt |
| Fairness-Gedächtnis | Anzahl berücksichtigter Vormonate |
| Gewicht des Gedächtnisses | Wirkung der Vorlast auf den Startwert |
| Stabilität | Rang der Minimal-Perturbation in der Kaskade |
| Bei Unlösbarkeit | melden, Korrekturmenge anzeigen oder anwenden |
| Laufansicht | Kristallisation, Weberei, Kaskade oder Orbit |

Entfallen sind die neun `cpSat*Weight`-Gewichte, das nie umgesetzte
Fairness-Profil, der beim portablen Build bedeutungslose Worker-Regler sowie
`infeasibilityMode` und `musAutoRelax`. Jedes verbliebene Bedienelement trägt
einen erklärenden Tooltip; wo eine frühere Fassung keinen hinterlegt hat, wird
er aus Beschriftung und Beschreibung gebildet.

### 7.3 Harte individuelle Grenzen

Eine eigene Karte führt je Person BD-Fix, BD-Maximum, HG-Fix, HG-Maximum und
Gesamtmaximum. Leere Felder bedeuten keine zusätzliche Laufgrenze; hinterlegte
Personalmaxima und sämtliche fachlichen Regeln gelten unabhängig davon weiter.
Zwei Schaltflächen füllen die Vorschlagswerte ein beziehungsweise leeren alle
Grenzen.

### 7.4 Die vier Laufansichten

Dieselben Meldungen des Laufs, vier Fragen. Die Wahl steht im Studio unter
„Darstellung des Laufs" und wird lokal gemerkt; sie kostet keine Rechenzeit der
Suche, sondern liest nur mit. Alle vier speisen sich ausschließlich aus echten
Ereignissen — nichts wird interpoliert, um Betrieb vorzutäuschen —, und alle
respektieren `prefers-reduced-motion` sowie die Bewegungseinstellung der
Anwendung.

| Ansicht | Frage |
| --- | --- |
| Kristallisation | Wie fällt der Suchraum zusammen? (Voreinstellung) |
| Weberei | Was steht am Ende im Plan — Person für Person, Tag für Tag? |
| Kaskade | Wie arbeitet sich das Verfahren durch seine Rangfolge? |
| Orbit | Die frühere Ringdarstellung, unverändert erhalten |

**Der Glanz folgt der Farbe.** Der Glow ist keine feste Größe: Wärme, Sättigung
und Helligkeit bestimmen Radius und Intensität. Ein warmer, satter Ton trägt
weiter als ein kühler, blasser; eine dunkle Farbe braucht mehr Radius, um
überhaupt zu leuchten, eine sehr helle würde sonst ausbrennen. Rote Warnungen
wirken dadurch heiß und drängend, grüne Bestätigungen ruhig. Die Regel steht
einmal im gemeinsamen Unterbau `js/auto-plan-visual-kit.js` und gilt für alle
Ansichten; dort liegen auch Farbwelt, Auflösungsanpassung, Zeitschleife,
Zonenschnitt und Textkürzung.

**Lesbarkeit geht vor Vollständigkeit.** Jede Liste hat eine Mindestzeilenhöhe.
Passen nicht alle Einträge, zeigt die Ansicht einen Ausschnitt und weist die
Zahl der übrigen aus, statt die Zeilen ineinanderlaufen zu lassen.

#### „Kristallisation"

Die Ansicht zeigt nicht, *dass* gerechnet wird, sondern *was* gerechnet wird.
Vier Ebenen, alle aus echten Ereignissen des Laufs gespeist — nichts wird
interpoliert:

1. **Domänenfeld** — ein Raster aus Tagen und Rollen. Jede Zelle trägt anfangs
   ihre Kandidatenmenge als Fächer. Trifft eine Entscheidung ein, fallen die
   nicht gewählten Marken heraus und die gewählte rastet ein: Der Suchraum
   fällt sichtbar zusammen.
2. **Schranken-Schere** — der Zielwert der besten bekannten Lösung von oben, die
   bewiesene untere Schranke von unten. Die Fläche dazwischen ist genau das, was
   noch nicht bewiesen ist. Berühren sich beide, läuft **einmal** ein heller
   Puls über das gesamte Feld: die Kristallisation.
3. **Prioritätsleiter** — die lexikografischen Stufen als Sprossen. Eine gelöste
   Stufe schließt ihr Schloss und graviert ihren Wert ein; ein Konflikt bricht
   die Sprosse heraus.
4. **Lastwaage** — Balken je Person, aufsteigend sortiert. Leximin wird dadurch
   sichtbar, wie es arbeitet: Der kürzeste Balken hebt sich zuerst.

**Der Glanz folgt der Farbe.** Der Glow ist keine feste Größe: Wärme, Sättigung
und Helligkeit bestimmen Radius und Intensität. Ein warmer, satter Ton trägt
weiter als ein kühler, blasser; eine dunkle Farbe braucht mehr Radius, um
überhaupt zu leuchten, eine sehr helle würde sonst ausbrennen. Rote Warnungen
wirken dadurch heiß und drängend, grüne Bestätigungen ruhig.

Bei reduzierter Bewegung entfallen Fächern und Puls; Raster, Kurven und Balken
bleiben als ruhige Zustandsanzeige.

#### „Weberei"

Der Monat als Gewebe — genau die Tabelle, die am Ende im Dienstplan steht:

1. **Kette** — ein senkrechter Faden je Kalendertag. Solange ein Tag offene
   Felder hat, steht sein Faden unter Spannung und schwingt; ist er vollständig
   belegt, kommt er zur Ruhe. Wochenenden liegen in einer dunkleren Bahn.
2. **Schuss** — eine waagerechte Zeile je Person, in fester Reihenfolge. Sie
   springt nie um, damit das Auge einer Person folgen kann; die geplante
   Belegschaft steht von Beginn an im Stoff, auch ohne Dienst.
3. **Knoten** — eine getroffene Zuordnung. Der Bereitschaftsdienst webt einen
   vollen Knoten in die obere Hälfte der Zeile, der Hintergrunddienst einen
   offenen in die untere. Fixpunkte sind von Beginn an eingewebt und ruhig; was
   die Suche entscheidet, rastet sichtbar ein.
4. **Schiffchen** — nach jeder Entscheidung fährt ein Lichtschiffchen die
   betroffene Zeile bis zum neuen Knoten: die einzige schnelle Bewegung der
   Ansicht, und damit die Antwort auf „wo wird gerade gearbeitet?".
5. **Lastwaage rechts** — die Last je Person im selben Zeilenraster.
   Leximin wird ablesbar: Die Kante rechts wird gerade, während links der Stoff
   wächst. Bis zur ersten Lastmeldung zählt der Stoff selbst.
6. **Webkante unten** — Anteil der gewebten an allen Feldern des Monats.

Ist die Optimalität bewiesen oder der Lauf fertig, läuft **einmal** die
Abschlusskante durch den Stoff: ein heller Schuss von oben nach unten.

#### „Kaskade"

Die Ansicht zeigt das Verfahren selbst. Der Kern löst nicht ein Ziel, sondern
eine geordnete Folge — erst die wichtigste Stufe bis zum Beweis, dann die
nächste unter der Auflage, die erste nicht mehr zu verschlechtern:

1. **Becken** — eines je Zielstufe, treppab in der Rangfolge der Kaskade.
2. **Wasserlinie** — die Höhe des Bandes am Beckenboden ist die verbliebene
   Ungewissheit zwischen Zielwert und bewiesener unterer Schranke. Sie sinkt im
   Takt der Zwischenlösungen auf eine Linie: Der Beweis wird zum Standbild.
   Der Maßstab ist die größte je gesehene Lücke *dieser* Stufe — sonst stünde
   das Band scheinbar still, obwohl es sich schließt.
3. **Gefrieren und Überlauf** — eine bewiesene Stufe erstarrt, bekommt Haken und
   eingravierten Wert, und lässt Wasser ins nächste Becken fallen: Ihr Ergebnis
   wird zur Auflage der folgenden Stufe. Ein bewiesenes Becken taut nicht wieder
   auf; eine unlösbare Stufe bricht, eine am Zeitbudget gescheiterte bleibt
   offen.
4. **Entscheidungsstrom** — jede erstmals gesehene Zuordnung fällt als Tropfen
   in der Farbe ihrer Person. Die Dichte ist die tatsächliche
   Entscheidungsrate, kein Taktgeber.

Eine geschlossene Lücke gilt nur dann als Beweis, wenn überhaupt ein Ziel
minimiert wird: Die vorgeschaltete Zulässigkeitssuche läuft ohne Zielfunktion
und meldet Zielwert wie Schranke als null. Alle drei jüngeren Ansichten prüfen
das ausdrücklich — bis v10.4 kristallisierte die Darstellung sonst sofort beim
ersten Zwischenergebnis und stand die restliche Optimierung still.

### 7.5 Ergebnisansicht

Die Ergebnisansicht führt den vollständigen Monatsvorschlag als Tabelle, dazu
Kennzahlen (Vorschläge, rote Ausnahmen, Fairness-Index, Jain, Gini), das
Protokoll der Phasen, zusätzliche Wellen, Knoten, Rescue-Breite,
Reparaturprofil, gegebenenfalls den nachgelagerten Fallback sowie den
Exaktheitsnachweis mit Status, Schranke und Phasenspur. Erst die
Übernahme-Schaltfläche schreibt in den Plan.

### 7.6 Der Layoutvertrag der drei Zustände

Parameter, Lauf und Ergebnis sind drei Zustände desselben Dialogs. Für alle drei
gilt: `min-width: 0` überall, `min-height: 0` **ausschließlich** für Zonen, die
ihren Überlauf selbst scrollen. Die automatische Mindesthöhe ist der einzige
Mechanismus, der eine Karte davor bewahrt, unter ihren Inhalt zusammenzufallen;
wer sie pauschal abschaltet, macht Inhalte unerreichbar statt sie unterzubringen.
`tests/e2e/studio-layout-v10-5.spec.js` prüft alle drei Zustände in beiden
Erscheinungsbildern gegen drei Zusagen: nichts verschwindet, nichts überlagert
sich, alles bleibt lesbar.

---

## 8. Ein- und Ausgabe

### 8.1 Ein Eingang für alle Dateien

Wer eine Datei hat, will sie importieren — und nicht zuvor entscheiden, welcher
Knopf für sie zuständig ist. Die Endung und, wo sie lügt, die Dateisignatur
entscheiden über den Weg.

| Datei | Inhalt | Übernommen wird |
|---|---|---|
| Jahresmappe `.xlsx` | zwölf Monatsblätter, Personen in Zeilen, Tage in Spalten | BD, HG und Abwesenheiten |
| Monatsplan `.xlsx` | Tag, Wochentag, BD, HG, RBN, 2. RBN | alle vier Felder |
| Monatsplan `.pdf` | derselbe Plan als Ausdruck | alle vier Felder |
| Neuroradiologie-Hintergrunddienstplan `.pdf`/`.xlsx` | Datum, Wochentag, 1. Dienst, 2. Dienst | **nur** 1. und 2. RBN |
| Sicherung `.json` | vollständiger Stand | Gesamtwiederherstellung |

Jeder Import zeigt zuerst einen **Vorabbericht**, fragt vor dem Ersetzen
bestehender Werte nach und schreibt dann atomar.

**Wie ein PDF zur Tabelle wird.** Ein PDF kennt keine Tabellen, sondern
Zeichenfolgen mit Koordinaten. `js/pdf-import.js` baut daraus wieder Zeilen und
Spalten: Zeilen aus gleicher Grundlinie, Spalten aus wiederkehrenden
*Mittelpunkten*. Die linke Kante taugt dafür nicht — bei zentriertem Zelltext
wandert sie mit der Wortlänge, und ein kurzer Wochentag landet in der
Nachbarspalte. Beide Schwellen (Zeilentoleranz, Spaltenabstand) leiten sich aus
den Daten ab, nicht aus geratenen Konstanten.

**Der Neuroradiologieplan** trägt nur die beiden Rufbereitschaften; BD und HG
kommen darin nicht vor und bleiben unangetastet. Sein Kopf nennt den Monat als
„Juli 26" — zweistellig und damit für die Jahreserkennung unbrauchbar.
Verlässlich ist die Datumsspalte, und genau daraus kommt der Monat.

**Beide Fremdbibliotheken liegen im Repository und werden erst bei Bedarf
geladen** — pdf.js unter `vendor/pdfjs/`, SheetJS unter `vendor/sheetjs/`. Die
Tabellenbibliothek hing zuvor als blockierendes `<script>` im Seitenkopf: 950
Kilobyte bei jedem Aufruf für einen Vorgang, der die Ausnahme ist. Damit
entfällt zugleich ein Fehlerfall, den Nutzende nicht beheben konnten — die
Meldung „Excel-Bibliothek noch nicht geladen" trat auf, während die Seite noch
lud. `npm run vendor:libs` holt beide in der Fassung, die der Quelltext
festlegt.

### 8.2 PDF-Ausgabe — als Datei, nicht als Druckauftrag

„PDF" schreibt die Datei selbst und bietet sie zum Herunterladen an. Der frühere
Weg über `window.print()` lieferte kein verlässliches Ergebnis: Papierformat,
Ränder, Kopf- und Fußzeilen und selbst die Frage, ob Hintergrundflächen
überhaupt gedruckt werden, hingen an den Einstellungen des Druckdialogs, und den
Dateinamen aus dem Dokumenttitel übernahm nicht jeder Browser. Erzeugt wird
jetzt immer dasselbe Blatt: **A4 hochkant, eine Seite**, Dateiname immer
`Dienstplan JJJJ-MM.pdf`.

Das Blatt trägt in dieser Reihenfolge:

1. **Kopf:** links zweizeilig „Bereitschaftsdienstplan" über „Monat JJJJ",
   rechts auf derselben Höhe die Plakette mit der Bezeichnung des Monatskontrasts.
2. **Planungstabelle** mit Tag, Wochentag, BD, HG, RBN und 2. RBN — samt
   Monatsfarbe, Wochenend- und Feiertagsflächen, farbiger Randmarke und der
   Feiertagsbeschriftung unter dem Wochentag.
3. **Statistik**, bewusst reduziert auf Mitarbeitende, BD und HG, abgeschlossen
   von der Zeile „Offen".

**Wie das Dokument entsteht.** `js/pdf-document.js` ist ein minimaler
PDF-Schreiber: Flächen, Linien, Plaketten und Text in Helvetica und
Helvetica-Bold mit WinAnsi-Kodierung, Koordinaten in Millimetern mit Ursprung
oben links. Mehr braucht dieses Blatt nicht, und die Standardschriften bringt
jeder Betrachter mit — es wird deshalb weder eine Schrift eingebettet noch eine
Fremdbibliothek ausgeliefert. Das Ergebnis ist echter Vektortext: durchsuchbar,
beim Vergrößern scharf und rund 20 statt 150 Kilobyte groß.

`js/pdf-export.js` setzt darauf das Satzbild und leitet die Farben aus demselben
Monatsprofil ab wie die Oberfläche. Der Export ist damit unabhängig davon, wo
der Farbverlauf auf dem Bildschirm gerade steht: Er trägt immer die Zielfarbe
des Monats, nie einen Zwischenton. Beide Module kennen kein DOM und sind
deshalb in Node prüfbar.

**Samstag, Sonntag und Feiertag bleiben unterscheidbar.** Die Oberfläche mischt
den Monatsakzent zu 16, 25 und 34 Prozent mit Weiß. Bei einem hellen Akzent
liegen die drei Ergebnisse dicht beieinander — im Juni 2026 auf 240, 232 und 223
— und auf dem Papier sahen die drei Tagesarten gleich aus. Am Bildschirm hilft
dort noch der Zusammenhang, der Ausdruck hat nur die Fläche. Die drei Stufen
sind deshalb nicht als Mischanteil, sondern als feste Helligkeit in OkLCh
gesetzt (0,945 / 0,895 / 0,845), im Farbton des Monats; die Wochentagsspalte
liegt immer eine Stufe tiefer als die Zeile, auf der sie steht. Der Abstand ist
damit in jedem Monat derselbe.

**Höhenbudget statt fester Zeilenhöhen.** Feste Zeilenhöhen in Millimetern sind
für genau einen Fall gerechnet und laufen in jedem anderen über: Mit zwölf statt
acht Mitarbeitenden brauchte ein 31-Tage-Monat 289 mm und riss auf eine zweite
Seite. Stattdessen steht je Block ein festes Budget — 172 mm für den Plan, 44 mm
für die Statistik —, und die Zeilenhöhe ergibt sich als Budget geteilt durch die
tatsächliche Zeilenzahl, gedeckelt auf das gewohnte Satzbild.

### 8.3 Der Druckdialog bleibt bestehen

Wer die Seite mit Strg+P ausgibt, bekommt weiterhin das druckoptimierte Blatt
aus `@media print` in `styles.css`: dieselbe Regel, ein Monat auf eine Seite,
mit Reserve für die von Chrome voreingestellten Kopf- und Fußzeilen. Die Höhen
leiten sich dort aus denselben Budgets ab, geteilt durch die tatsächliche
Zeilenzahl (`--print-plan-rows`, `--print-stat-rows`).

### 8.4 Excel und JSON

Der **Excel-Export** schreibt eine Arbeitsmappe mit Kopfzeile, allen Tagen und
der Statistik, benannt nach Jahr und Monat. Die **JSON-Sicherung** enthält den
vollständigen Stand — Einstellungen, Personal, RBN-Namen und alle Monate — und
ist über denselben Importeingang wieder einlesbar.

---

## 9. Datenmodell und Persistenz

### 9.1 Der Monat

```jsonc
{
  "schemaVersion": 1,
  "year": 2026, "month": 9,
  "revision": 7,
  "updatedAt": "…",
  "days": {
    "2026-09-01": { "bd": "lurz", "hg": "becker", "rbn1": "…", "rbn2": "", "notes": "" }
  },
  "absences":       { "lurz": { "2026-09-04": "urlaub" } },
  "absenceSources": { "lurz": { "2026-09-04": "jahresmappe" } },
  "preferences":    { "martin": { "2026-09-03": "kein-dienst" } },
  "options":        { "licenji": { "2026-09-05": ["hg-moeglich"] } },
  "overrideLog": [ /* bestätigte rote Ausnahmen mit Begründung */ ],
  "importLog":   [ /* Herkunft und Umfang jedes Imports */ ]
}
```

### 9.2 Cloudflare

- **Pages** liefert die statische Anwendung aus.
- **Pages Functions** unter `functions/api/` bedienen Bootstrap, Monatsdaten,
  Personal, RBN-Namen, Einstellungen sowie Import und Export.
- **Workers KV** (Binding `DIENSTPLAN_KV`) ist die gemeinsame Persistenz.

| Endpunkt | Methoden | Zweck |
|---|---|---|
| `/api/bootstrap` | GET | Einstellungen, Personal und RBN-Namen in einem Zug |
| `/api/month/JJJJ/MM` | GET, PUT | ein Monat |
| `/api/settings` | GET, PUT | Anwendungseinstellungen |
| `/api/staff` | GET, PUT | Personalstamm |
| `/api/rbn-names` | GET, PUT | Namenspool der Rufbereitschaft |
| `/api/export` | GET | vollständiger Stand |
| `/api/import` | POST | vollständiger Stand zurückschreiben |

**Lesen legt nichts an.** Das Vorladen öffnet beim Monatswechsel bis zu
dreizehn Monate; jeder unbekannte davon hätte sonst einen leeren Datensatz in
den KV-Speicher geschrieben — Schreiblast und Einträge ohne jeden Inhalt.
Gespeichert wird erst, wenn tatsächlich etwas eingetragen wurde.

### 9.3 Offline und Nebenläufigkeit

KV besitzt Eventual Consistency. Die Anwendung arbeitet deshalb server-first mit
Revisionsständen, Dirty-Markern und Wiederabgleich; konkurrierende Änderungen
dürfen nicht stillschweigend als identisch behandelt werden. Lokale Änderungen
werden gebündelt in den Browserspeicher geschrieben und vor dem Verlassen der
Seite in jedem Fall gesichert — auch ohne Serververbindung geht die jüngste
Änderung nicht verloren.

---

## 10. Einstellungen

Drei Reiter: **Darstellung**, **Arbeitsweise**, **Auto-Plan v10**. Jede
Einstellung ist tatsächlich verdrahtet — es gibt bewusst keinen Schalter, der
nur gespeichert und nirgends gelesen wird.

### 10.1 Darstellung

| Einstellung | Standard | Werte |
|---|---|---|
| Farbschema | hell | `light`, `dark` (lokal, vor dem Bootstrap) |
| Informationsdichte | `comfortable` | `comfortable`, `compact` |
| Monatsfarbsystem | `spectrum` | `spectrum`, `classic`, `neutral` |
| Erklärende Tooltips | an | an, aus |
| Wochenenden und Feiertage hervorheben | an | an, aus |
| Atmosphärischer Hintergrund | an | an, aus |
| Bewegung | `system` | folgt der Systempräferenz |

### 10.2 Arbeitsweise

| Einstellung | Standard |
|---|---|
| Autosave-Verzögerung | 1.100 ms |
| Algorithmus-Kommentar | an |
| Studio-Visualisierung | an |

### 10.3 Auto-Plan

| Einstellung | Standard |
|---|---|
| Leistungsprofil | `adaptive` |
| Suchintensität | `deep` |
| Optimierungsschwerpunkt | `balanced` |
| Zeitbudget | 120 s |
| Minimal-Rot-Fallback erlauben | an |
| Obergrenze roter Verstöße | keine |
| Perfektionsphase | an |
| Parallele Suchen | automatisch |
| Zertifizierungsrunden | 4 |
| Portfolio-Diversität | an |
| Solver-Backend | `auto` |
| CP-SAT-Zeitbudget | 10 s |
| Warmstart | `heuristic` |
| Determinismus | an |
| Reparatur nach Änderung | an |
| Erklärungstiefe | `detailed` |
| Ausgangsplan schützen | an |
| Relaxationstiefe | `deep` |
| Stufenreihenfolge | Fairness · Wünsche · BD-Soll · Wochenendkette · Wochenende · Samstag · HG-Last · CT-Leitung |
| Leximin-Tiefe | 3 |
| HG-Gewicht in der Last | 60 % |
| Fairness-Gedächtnis | 3 Monate |
| Gewicht des Gedächtnisses | 50 % |
| Stabilität | `tiebreak` |
| Bei Unlösbarkeit | `show` |

Alle Werte sind Voreinstellungen jedes Laufs; im Studio bleibt jeder Wert pro
Lauf änderbar.

---

## 11. Leistung

- rechenintensive Konstruktion und Perfektion in Modul-Web-Workern;
- reservierte UI-Kerne für Eingaben, Fortschritt und Animation;
- `requestAnimationFrame()` für visuelle Aktualisierungen;
- passive Scroll-Listener;
- `content-visibility: auto` für nachgelagerte Statistik- und Ergebnisbereiche;
- `contain` für große, unabhängige Layout- und Paint-Bereiche;
- compositorfreundliche Animationen über `transform` und `opacity`,
  keine dauerhaften `will-change`-Flächen;
- kein Weichzeichner außer hinter dem geöffneten Dialog;
- Tabellenzeilen als Fragment statt einzeln;
- die Sammelprüfung des Monats erst in der Leerlaufzeit;
- Vorladen benachbarter Monate;
- idempotente, zielgerichtete DOM-Beobachter ohne selbst erzeugte
  Mutationsschleifen;
- vollständiger funktionaler Rückfall ohne View-Transition-API.

---

## 12. Barrierefreiheit

- Sichtbarer Fokus: 2 px Ring mit 2 px Abstand, in der Monatsfarbe.
- Tooltips reagieren auf Tastaturfokus und sind über `aria-describedby`
  verknüpft, `role="tooltip"`, Schließen mit `Esc`.
- Dialoge sind native `<dialog>`-Elemente: Fokusfalle, `Esc` schließt, der Fokus
  kehrt zum Auslöser zurück.
- Der Auswahldialog ist vollständig mit der Tastatur bedienbar.
- Reiter der Einstellungen folgen dem ARIA-Tabs-Muster mit Pfeiltasten.
- Der Theme-Umschalter trägt `aria-pressed` und einen sprechenden
  `aria-label`-Text statt sichtbarer Beschriftung.
- Ziffern sind durchgehend tabellarisch (`font-variant-numeric`), damit Spalten
  fluchten.
- `prefers-reduced-motion: reduce` hält sämtliche Animationen an.
- Der Lesekontrast beider Erscheinungsbilder ist gemessen, nicht behauptet
  (WCAG 2.1 AA: 4,5:1, bei großer Schrift 3:1).

---

## 13. Qualitätssicherung

### 13.1 Was geprüft wird

**Modultests** (`npm test`, 434 Prüfungen) decken ab: Regelengine und
Regelberichte in allen Stufen; Zeitzonen- und Monatsgrenzen; Import und Export
für Excel, PDF und JSON; Persistenz und Zustandsführung; Toolbar-Dichtestufen;
Auto-Plan-Invarianten, Fixpunktschutz, Zielordnung und Übernahmeprüfung;
Worker-Budget und Portfoliovergleich; Phasenvertrag, Profilableitung und
Fallback-Reihenfolge; CP-SAT-Modellbau, Relaxationsdiagnose und
Exaktheitsnachweis; das Satzbild und die Farbstufen des PDF-Exports.

**Browsertests** (`npm run test:e2e`) decken ab: vollständiger Abschluss des
`load`-Ereignisses und responsiver Event Loop nach späten DOM-Einbauten;
Monatsplanung, Auswahldialog, Mehrtagesauswahl; Toolbar über viele
Fensterbreiten ohne Überlagerung oder Horizontal-Scroll; Auto-Plan Studio in
allen drei Zuständen samt Abbruchpfaden; Theme-Persistenz; tastaturfähige
Tooltips; den Lesekontrast beider Erscheinungsbilder inklusive aller Dialoge;
und den Ausdruck als gemessenes PDF — ein Monat, eine A4-Seite.

### 13.2 Zwei Messungen, die keine Behauptung sind

- **Eine Seite.** `tests/e2e/print-single-page.spec.js` prüft nicht die
  gerechnete Höhe, sondern den Seitenbaum des erzeugten PDF — für den
  teuersten Fall aus zwölf Mitarbeitenden, langen externen Namen und voller
  Belegung, mit eigenem Satzspiegel und mit dem, den Chrome bei eingeschalteten
  Kopf- und Fußzeilen übrig lässt.
- **Laufansichten.** `tests/auto-plan-run-views.test.js` fährt jede der drei
  jüngeren Ansichten durch einen vollständigen Lauf gegen eine aufzeichnende
  Ersatzleinwand — samt der Randfälle, die im Browser sonst nur eine schwarze
  Fläche hinterlassen: winzige Leinwand, leerer Monat, Zwischenlösung vor dem
  Stufenplan, geschlossene Lücke ohne Zielfunktion, fehlender Leinwandkontext.
- **Lesbarkeit.** `tests/e2e/dark-contrast.spec.js` und
  `tests/e2e/layout-contrast-v10-5.spec.js` messen jeden sichtbaren Textknoten
  gegen den *tatsächlich wirksamen* Hintergrund: halbtransparente Schichten
  werden über ihre Elternflächen gerechnet, und aus einem Verlauf zählt der
  hellste Farbstopp — der ungünstigste Fall für helle Schrift.

### 13.3 Testdisziplin

Die vollständige Suite gehört nicht nach jede Änderung. Maßgeblich ist, was die
Änderung berühren kann; die Zuordnung steht in `CLAUDE.md`. Testausgaben werden
gefiltert abgerufen — eine volle Suite schreibt tausende Zeilen, und die Ausgabe
ist der teuerste Posten, nicht die Laufzeit.

---

## 14. Projektstruktur

```text
index.html                         eine Seite, zwei Stylesheets, ES-Module
styles.css                         Grundlayout, Tabellen, Dialoge, @media print
controls.css                       Command Bar und Dichtestufen
transitions.css                    Monatswechsel und Sweep
app-v8-5.css / app-v9.css          Farb- und Oberflächentoken, Formularelemente
app-settings.css                   Einstellungsdialog
toolbar-v8-5.css                   rechter Theme-/Einstellungsblock
auto-plan-studio*.css              Studio, additiv geschichtet bis v10.5
dark-contrast.css                  Lesekontrast im Dunkelmodus (zuletzt geladen)

js/app.js                          Monatsansicht, Rendering, Dialoge, Export
js/state.js                        Zustand, Synchronisierung, lokale Sicherung
js/api.js                          Zugriff auf die Pages Functions
js/defaults.js                     Standardwerte, Personal, Typenlisten, Normalisierung
js/holidays.js                     sächsische Feiertage, Ostern, reguläre Werktage
js/rules*.js                       Regelwerk — die verbindliche Wahrheit
js/rbn.js                          Namenspool und Verfügbarkeit der Rufbereitschaft
js/picker-view.js                  Modell des Auswahldialogs
js/auto-plan-model.js              boolesches Zuordnungsmodell (solverfrei, in Node testbar)
js/auto-plan-solver.js             Brücke zur CP-SAT-WebAssembly-Bindung
js/auto-planner-engine.js          Konstruktion, Zielordnung, Audit, Reparatur
js/auto-planner-v10.js             lexikografische Kaskade, Leximin, Konfliktdiagnose
js/auto-planner-v8-5.js            Heuristik: Warmstart, Rückfallebene, Phasenvertrag
js/auto-planner-optimizer.js       Ruin-and-Recreate-Perfektion
js/auto-plan-studio-*.js           Oberfläche des Studios, additiv geschichtet
js/auto-plan-visual-kit.js         Unterbau der Laufansichten: Farbwelt, Glow-Regel, Leinwand
js/auto-plan-crystallize.js        Laufansicht „Kristallisation": Zusammenfall des Suchraums
js/auto-plan-weave.js              Laufansicht „Weberei": entstehender Plan als Gewebe
js/auto-plan-cascade.js            Laufansicht „Kaskade": Zielstufen als Becken
js/auto-plan-visualizer.js         Laufansicht „Orbit": Ringdarstellung der Suche
js/color-atlas-*.js                Trend-Atlas und Ableitung der Monatstoken
js/color-director.js               Farbverlauf, Plakette, Erscheinungsbild
js/app-theme-v8-5.js               Hell-/Dunkelcontroller (Start: hell)
js/rich-tooltip-v8-5.js            zentrale ARIA-Tooltips
js/ui-controls.js / ui-v8-5.js     Command Bar, Dichtestufen, Stylesheet-Einbau
js/app-settings.js                 Einstellungsdialog
js/pdf-document.js                 minimaler PDF-Schreiber (Flächen, Linien, Text)
js/pdf-export.js                   Satzbild des Monatsblatts, Direktdownload
js/file-import.js                  ein Eingang für Excel, PDF und JSON
js/pdf-import.js                   Textpositionen zu Tabellenzeilen (pdf.js)
js/excel-import.js                 Jahresmappe und Monatsblatt
js/xlsx-engine.js                  Nachladen der Tabellenbibliothek

functions/api/                     Cloudflare Pages Functions (KV-Zugriff)
vendor/cpsat-js/                   CP-SAT-Solver, portables WASM-Bündel (Apache-2.0)
vendor/pdfjs/                      pdf.js für den PDF-Import (Apache-2.0)
vendor/sheetjs/                    Tabellenbibliothek (Apache-2.0)
_headers                           Cache- und Sicherheitskopfzeilen (bewusst ohne COEP)
tests/                             Modultests
tests/e2e/                         Browsertests (Playwright)
```

### Konventionen

- Deutsch in Bezeichnern der Oberfläche, Kommentaren und Commit-Nachrichten.
- Kommentare erklären **warum**, nicht was.
- ES-Module mit Versionsmarke im Bezeichner (`./modul.js?v=20260806.1`). Die
  Marke muss in allen Importen desselben Moduls gleich sein — sonst entstehen
  zwei Modulinstanzen mit getrenntem Zustand.
- Kein Build, kein Bundler. Was ausgeliefert wird, liegt im Repository; ein CDN
  ist Rückfallebene, nie der einzige Weg. Fremde Bibliotheken werden bei Bedarf
  geladen, nicht im Startpfad.
- Keine Geheimnisse, keine `.env`-Dateien, keine Schlüssel im Repository.

---

## 15. Entwicklung und Betrieb

Voraussetzungen: Node.js 24 und npm.

```bash
npm ci              # Abhängigkeiten
npm run check       # Syntaxprüfung aller Module        (~5 s)
npm test            # Modultests                        (~70 s)
npm run test:e2e    # Browsertests                      (~4 min)
npm run verify      # alles                             (~5,5 min)
npm run vendor:libs # pdf.js und SheetJS ins Repository holen
```

Cloudflare Pages wird aus dem Repository-Root gebaut; ein Build-Schritt
existiert nicht. Das KV-Binding lautet `DIENSTPLAN_KV`.

---

## 16. Grenzen

- **Eine vollständige Null-Rot-Belegung kann mathematisch unmöglich sein.** Dann
  ist die ehrliche Antwort nicht ein schöner Plan, sondern die Korrekturmenge:
  welche Regel aufgegeben werden müsste, damit der Monat lösbar wird.
- **Der Auto-Plan ersetzt keine Entscheidung.** Er schlägt vor; übernommen wird
  von Hand, und jede rote Ausnahme verlangt eine Begründung, die im Monat
  protokolliert bleibt.
- **RBN und zweite RBN plant die Anwendung nicht.** Sie werden importiert oder
  von Hand gesetzt.
- **Der Ausdruck passt auf eine A4-Seite hochkant** — ohne Ausnahme. Das ist
  eine Zusage an den Aushang, keine Empfehlung.
- **Jede neue fachliche Regel gehört an beide Orte:** in die Regelengine, die
  verbindlich entscheidet, und als harte Bedingung in das boolesche Modell.
  Fehlt sie im Modell, baut die exakte Suche Vorschläge, die das Schlussaudit
  anschließend verwirft.
