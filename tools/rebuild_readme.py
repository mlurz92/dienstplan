from pathlib import Path
import re

path = Path("README.md")
text = path.read_text(encoding="utf-8")

def replace_once(old: str, new: str, label: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match, found {count}")
    text = text.replace(old, new, 1)

# A current-state introduction instead of a version-history preamble.
first_rule = text.find("\n---\n")
if first_rule < 0:
    raise SystemExit("README introduction delimiter not found")
intro = r'''# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – abstrakte gläserne Dienstplantabelle" width="144">
</p>

<p align="center"><strong>Manuelle, regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und RBN</strong></p>

> **Referenzstand:** Build `20260731.2` · Paketversion `0.2.0` · Datenregion Sachsen (`SN`)  
> **Betriebsmodell:** Cloudflare Pages + Pages Functions + Cloudflare KV, ergänzt durch eine lokale Browser-Sicherung  
> **Grundsatz:** Der Mensch plant. DienstplanRAD prüft, erklärt, speichert und dokumentiert.

DienstplanRAD ist eine auf den klinischen Alltag der Radiologie zugeschnittene Webanwendung für die **manuelle** Monatsplanung von **Bereitschaftsdiensten (BD)**, **Hintergrunddiensten (HG)** sowie der ersten und zweiten **Rufbereitschaft Neuroradiologie (RBN)**. Die Anwendung verbindet eine chronologische, Excel-nahe Tagesliste mit einer vollständig erklärbaren Regelengine. Sie bewertet jede konkrete Auswahl anhand von Qualifikation, Aktivierungsdaten, Abwesenheiten, Dienstwünschen, Dienstabständen, Monatskontingenten, Wochenendbelastung, Feiertagen, personellen Sonderregeln und deterministischen Kopplungen.

DienstplanRAD ist ausdrücklich **kein automatischer Dienstplaner**. Es gibt keinen Optimierungslauf, keine automatische Gesamtbelegung, keine selbstständige Umbesetzung und keine automatische Tauschlogik. Jeder Dienst entsteht aus einer bewussten Benutzereingabe. Bereits bestehende Einteilungen bleiben unangetastete Fixpunkte, bis sie bewusst geändert oder gelöscht werden.

Die Anwendung berechnet für den angeklickten Tag und die angeklickte Rolle eine aktuelle Bewertung für jede an diesem Tag aktive planbare Person. Alle ausgelösten Gründe bleiben als Klartext sichtbar. Die höchste Konfliktstufe bestimmt die Farbe; positive Empfehlungen und neutrale Kontextinformationen bleiben zusätzlich erhalten. Ein roter Konflikt ist nicht stillschweigend verboten, sondern verlangt eine ausdrückliche Bestätigung und wird mit Gründen, Zeitpunkt und optionalem Kommentar protokolliert. Ein grauer Kandidat ist tatsächlich nicht auswählbar.

Diese README beschreibt den **vollständigen gegenwärtigen Zustand** der Anwendung als zusammenhängende Bedienungs-, Fach-, Design-, Architektur-, Daten-, Betriebs- und Entwicklungsreferenz. Sie ist weder ein Changelog noch eine Sammlung früherer Zwischenstände.
'''
text = intro + text[first_rule:]

# The acronym was previously expanded incorrectly.
text = text.replace("Rufbereitschaft Nuklearmedizin", "Rufbereitschaft Neuroradiologie")

replace_once(
r'''## 6.3 BD- und HG-Zellen

Eine belegte Zelle zeigt:

- den Namen;
- einen farbigen Chip der höchsten Bewertungsstufe;
- alle Gründe im nativen Tooltip.

Eine offene Zelle zeigt einen neutralen Platzhalter und einen „offen“-Chip. Der Klick öffnet in beiden Fällen denselben Personendialog.
''',
r'''## 6.3 BD- und HG-Zellen

Eine **belegte** Zelle zeigt bewusst nur den Namen. Ein sichtbarer Bewertungsbadge wird im fertigen Plan nicht mehr eingeblendet, damit die Monatsansicht ruhig, drucknah und ohne dauerhafte Warnetiketten lesbar bleibt. Die aktuelle Bewertung wird trotzdem bei jedem Rendern berechnet; sämtliche Gründe liegen im nativen Tooltip und werden nach einem erneuten Klick vollständig im Picker angezeigt.

Eine **offene** Zelle zeigt den neutralen Platzhalter und den sichtbaren Chip „offen“. Der Klick öffnet in beiden Fällen denselben Personendialog. Die Bewertung verschwindet damit nicht, sondern wird von der Tabellenoberfläche in den dafür vorgesehenen Entscheidungskontext verlagert.
''',
"occupied-cell behavior"
)

replace_once(
r'''## 7.2 Inhalt einer Kandidatenkarte

Jede Karte enthält:

- vollständigen Namen;
- sichtbaren Stufenchip;
- sämtliche Gründe als einzelne Textzeilen;
- dieselben Gründe zusätzlich im nativen Tooltip.

Die Unterzeile des Dialogs erklärt, dass rote Konflikte ausdrücklich bestätigt werden müssen.
''',
r'''## 7.2 Inhalt einer Kandidatenkarte

Jede Karte enthält:

- vollständigen Namen;
- sichtbaren Stufenchip;
- sämtliche Gründe als einzelne Textzeilen;
- dieselben Gründe zusätzlich im nativen Tooltip.

Die Unterzeile des Dialogs erklärt, dass harte und strukturelle Regeln sofort greifen, relative Ausgleichshinweise jedoch erst nach der ersten Verteilungsrunde gelb werden können. Rote Konflikte müssen ausdrücklich bestätigt werden.

Die Karten bleiben in der stabilen fachlichen Personalreihenfolge. Der interne `recommendationScore` sammelt positive Begründungen, wird derzeit jedoch nicht verwendet, um die Liste verdeckt umzusortieren. Position, Farbe und Empfehlungswert sind damit klar getrennte Konzepte.
''',
"candidate-card details"
)

replace_once(
r'''## 7.4 Rote Bestätigung

Der rote Dialog zeigt Person, Rolle, Datum und alle roten beziehungsweise mitgeführten Gründe. Ein optionaler Kommentar kann die fachliche Abstimmung dokumentieren. Bei Bestätigung wird ein Eintrag in `overrideLog` angelegt. Ohne Bestätigung bleibt der Monatsdatensatz unverändert.
''',
r'''## 7.4 Rote Bestätigung

Der rote Dialog zeigt Person, Rolle, Datum und alle roten beziehungsweise mitgeführten Gründe. Ein optionaler Kommentar kann die fachliche Abstimmung dokumentieren. Bei Bestätigung wird ein Eintrag in `overrideLog` mit UTC-Zeitpunkt, Datum, Rolle, Personal-ID, Gründen und Kommentar angelegt. Ohne Bestätigung bleibt der Monatsdatensatz unverändert.

Das spätere Löschen oder Ersetzen des Dienstes entfernt diesen historischen Protokolleintrag nicht automatisch. `overrideLog` dokumentiert, dass die rote Entscheidung zu einem früheren Zeitpunkt bewusst getroffen wurde; eine eigene sichtbare Protokollansicht existiert derzeit nicht.
''',
"override history"
)

replace_once(
"## 15.3 Tiefennormalisierung und defensive Wiederherstellung\n",
r'''### 15.2.1 Reservierte und Legacy-Felder

- `days[iso].notes` wird normalisiert, lokal und serverseitig gespeichert sowie über JSON erhalten, besitzt aber aktuell keine sichtbare Bearbeitungs- oder Anzeigefunktion.
- `importLog` ist als strukturierte Importhistorie vorgesehen und wird erhalten; der gegenwärtige Excel-Import zeigt seine Zusammenfassung unmittelbar an, schreibt jedoch nicht verbindlich jeden Import als strukturierten Logeintrag.
- `rbnNames` bleibt als Bootstrap-, API- und Backupfeld aus Kompatibilitätsgründen erhalten. Die aktuellen festen RBN-Pools und Trigger stammen ausschließlich aus `js/rbn.js`.
- `overrideLog` wächst historisch und wird beim Leeren einer Zelle nicht bereinigt.

## 15.3 Tiefennormalisierung und defensive Wiederherstellung
''',
"reserved fields"
)

replace_once(
r'''- `year` und `month` werden immer aus dem Zielschlüssel abgeleitet und können nicht durch eine widersprechende Nutzlast überschrieben werden.

Dadurch können ältere oder unvollständige Sicherungen gelesen werden, ohne dass einzelne Tagesobjekte anschließend fehlende Eigenschaften besitzen oder fremde Kalendertage in einen Monat eindringen.
''',
r'''- `year` und `month` werden immer aus dem Zielschlüssel abgeleitet und können nicht durch eine widersprechende Nutzlast überschrieben werden;
- zusätzliche unbekannte Felder auf der Wurzelebene eines Monatsobjekts bleiben durch die Quellobjektübernahme erhalten, während bekannte Kernfelder anschließend sicher überschrieben werden;
- unbekannte Zusatzfelder innerhalb eines Tagesobjekts werden verworfen, weil jedes Tagesobjekt gezielt aus den fünf bekannten Feldern neu aufgebaut wird.

Dadurch können ältere oder unvollständige Sicherungen gelesen werden, ohne dass einzelne Tagesobjekte anschließend fehlende Eigenschaften besitzen oder fremde Kalendertage in einen Monat eindringen.

Die generische Normalisierung von `absences`, `absenceSources` und `preferences` prüft Personal-ID-Form, gültigen Zielmonatstag und einen nichtleeren String. Sie erzwingt derzeit nicht, dass jeder historische String zwingend einer heute bekannten Abwesenheits- oder Wunsch-ID entspricht. Unbekannte Altwerte können deshalb technisch erhalten bleiben und über die Label-Fallbacks als Rohtext erscheinen.
''',
"normalization nuances"
)

replace_once(
"## 16.3 Laden\n",
r'''### 16.2.1 Tabbezogene Legacy-Marker

Die Monats- und Bootstrapdaten liegen in `localStorage`. Die Schleifensperre `dienstplanrad:legacy-reload` für einen höchstens einmaligen Neustart eines noch von einem historischen Service Worker kontrollierten Tabs liegt dagegen in `sessionStorage`. Zusätzlich setzt das Inline-Cleanup `data-asset-cleanup="dienstplanrad:legacy-cleanup"` am Root-Element; dies ist ein DOM-Diagnosemarker und kein persistenter Speicherschlüssel.

## 16.3 Laden
''',
"storage marker details"
)

replace_once(
r'''Beim Schließen versucht `beforeunload`, einen noch schmutzigen Monat zu persistieren. Die lokale Sicherung bleibt die erste Ausfallschicht.
''',
r'''Beim Schließen versucht `beforeunload`, einen noch schmutzigen Monat zu persistieren. Die lokale Sicherung bleibt die erste Ausfallschicht.

### 16.4.1 Bedeutung des lokalen Fallbacks

„Offline – lokal gesichert“ bedeutet, dass die Änderung im `localStorage` dieses Browsers liegt, nicht dass sie zentral bestätigt wurde. Ein anderer Browser sieht sie nicht; das Löschen von Browserdaten kann sie entfernen. Da kein aktiver Service Worker die App-Shell cached, ist außerdem ein vollständig frischer Start ohne Netz nicht garantiert. Das lokale Monatsfallback ist Verlustbegrenzung für eine bereits geladene Anwendung und kein vollständiger Offline-PWA-Modus.
''',
"offline semantics"
)

replace_once(
r'''## 18.1 Excel-Import

Der Import verwendet SheetJS 0.20.3. Monatsblätter werden anhand der deutschen Kurzbezeichnungen erkannt. Bestehende geplante Dienste werden nicht blind durch leere oder unvollständige Importwerte überschrieben. Abwesenheiten können mit ihrer Herkunft `import` gekennzeichnet werden, damit die FZA-Darstellung zwischen manuellen und importierten Angaben unterscheiden kann.
''',
r'''## 18.1 Excel-Import

Der Import verwendet SheetJS 0.20.3 aus dem externen CDN `cdn.sheetjs.com`. Das Skript wird mit `defer`, derzeit jedoch weder lokal vendort noch mit einem `integrity`-Attribut geladen. Ist die Bibliothek nicht verfügbar, bleiben Kernplanung, JSON-Sicherung und Druck funktionsfähig; nur Excel-Import und -Export melden einen Fehler.

Unterstützte Monatsblätter heißen exakt `Jan`, `Feb`, `Mrz`, `Apr`, `Mai`, `Jun`, `Jul`, `Aug`, `Sep`, `Okt`, `Nov`, `Dez`. Die ersten zwölf Zeilen und zwölf Spalten werden nach einer Jahreszahl `20xx` durchsucht. Fehlt sie, muss die Zuordnung zum aktuell ausgewählten Jahr ausdrücklich bestätigt werden. Als Tageskopf gilt eine Zeile, die ab der dritten Spalte mindestens zwanzig ganzzahlige Tageswerte zwischen 1 und 31 enthält.

Eine Personalzeile wird über den Namen in der ersten Spalte und `Arbeitsplatz` in der zweiten Spalte erkannt; die unmittelbar folgende Zeile gilt als Dienstzeile. `D` wird als BD, `HG` als HG gelesen. Abwesenheitscodes: `U` → Urlaub, `F`/`FZA` → FZA, `WB` → Weiterbildung, `K`/`KK`/`ZU`/`§15C`/`DR` → sonstige Abwesenheit.

Bestehende geplante Dienste werden nicht überschrieben. Importierte Abwesenheiten dürfen durch einen späteren Import aktualisiert werden; manuelle Abwesenheiten bleiben erhalten. Unbekannte Namen, ergänzte Werte, bewahrte Werte und nur lokal gespeicherte Monate werden in der Abschlussmeldung ausdrücklich ausgewiesen. RBN und Dienstwünsche werden aus diesem Excel-Format nicht importiert.
''',
"excel details"
)

replace_once(
r'''## 19.3 Transport und Zugriff

Die Anwendung setzt HTTPS über Cloudflare voraus. Authentifizierung und Zugriffsschutz werden auf Cloudflare-Ebene beziehungsweise über die gewählte Bereitstellungsumgebung konfiguriert; im Repository ist kein eigenes Benutzer- und Rollenlogin implementiert.
''',
r'''## 19.3 Transport und Zugriff

Die Anwendung setzt HTTPS über Cloudflare voraus. Authentifizierung und Zugriffsschutz werden auf Cloudflare-Ebene beziehungsweise über die gewählte Bereitstellungsumgebung konfiguriert; im Repository ist kein eigenes Benutzer- und Rollenlogin implementiert.

Das System ist als Einzelbearbeiter-Anwendung ausgelegt. Es gibt keine Echtzeit-Collaboration, keine serverseitige Sperre und keinen Compare-and-Swap-Abgleich. Die Monatsrevision schützt den lokalen Dirty-Ablauf, verhindert aber nicht, dass zwei gleichzeitig geöffnete Browser zuletzt schreibend denselben KV-Monat überschreiben. Parallele Bearbeitung und mehrere Tabs sollten deshalb vermieden werden.
''',
"single editor security"
)

replace_once(
r'''## 19.4 Datenintegrität
''',
r'''### 19.3.1 Auslieferungsheader und verbleibende Grenzen

`_headers` setzt `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` sowie eine Permissions-Policy, die Geolocation, Mikrofon und Kamera deaktiviert. Eine Content-Security-Policy ist derzeit nicht definiert. Das öffentliche GitHub-Repository enthält außerdem keine ausdrückliche Open-Source-Lizenz; öffentliche Lesbarkeit des Quellcodes ist nicht mit einer allgemeinen Nutzungslizenz gleichzusetzen.

`localStorage` ist originbezogen, aber nicht anwendungsseitig verschlüsselt. Optionale Override-Kommentare sollten keine unnötigen medizinischen Patientendaten enthalten.

## 19.4 Datenintegrität
''',
"security limits"
)

replace_once(
r'''- kein aktiver Service Worker;
''',
r'''- kein aktiver Service Worker und damit kein garantierter frischer Offline-Start;
''',
"limits offline"
)

# Remove the versioned appendix completely. All valid current details already
# live in their thematic sections.
cut_marker = "\n---\n\n# 30. Konsistenzhärtung"
cut = text.find(cut_marker)
if cut < 0:
    raise SystemExit("versioned appendix marker not found")
text = text[:cut].rstrip() + "\n"

# Final consistency assertions.
required = [
    "Build `20260731.2`",
    "eigener BD am Vortag: **rot**",
    "belegte** Zelle zeigt bewusst nur den Namen",
    "Rufbereitschaft Neuroradiologie",
    "kein garantierter frischer Offline-Start",
]
for phrase in required:
    if phrase not in text:
        raise SystemExit(f"required README content missing: {phrase}")
for forbidden in ["# 30. Konsistenzhärtung", "Rufbereitschaft Nuklearmedizin"]:
    if forbidden in text:
        raise SystemExit(f"obsolete README content remains: {forbidden}")

path.write_text(text.rstrip() + "\n", encoding="utf-8")
