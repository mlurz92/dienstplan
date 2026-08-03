# DienstplanRAD

<p align="center">
  <img src="icons/icon.svg" alt="DienstplanRAD – farbiges Auto-Plan-Constraint-Netz in einer Kalenderfläche" width="144">
</p>

<p align="center"><strong>Regelgestützte Monatsplanung für Bereitschaftsdienst, Hintergrunddienst und neuroradiologische Rufbereitschaft</strong></p>

> **Paketversion:** `0.8.1`<br>
> **Regelwerk:** Eignungsregeln `v4.9`  
> **Auto-Plan:** Algorithmus `v8.1` — *Budget Integrity*: inkrementelle Zählwerke und Zustandsmarken, globale Engpasssuche, vollständiges Konstruktionsportfolio ohne voreiligen Kurzschluss, zwei adaptive Operatordimensionen, segmentweise Gewichtsanpassung, Luby-Neustarts, Null-Rot-Guardrail und Optimalitätsnachweis<br>
> **Feiertagsregion:** Sachsen (`SN`)  
> **Betrieb:** Cloudflare Pages · Pages Functions · Cloudflare KV · lokale Browser-Sicherung

DienstplanRAD verbindet kontrollierbare manuelle Monatsplanung mit einer bestätigungspflichtigen automatischen Komplettierung aller offenen **Bereitschaftsdienste (BD)** und **Hintergrunddienste (HG)**. Bereits gesetzte Dienste bleiben unveränderliche Fixpunkte. RBN und zweite RBN werden nicht automatisch geplant.

---

## 1. Leitprinzipien

- Produktive Regelengine als einzige fachliche Wahrheitsquelle.
- Auto-Plan verändert ausschließlich leere BD- und HG-Felder des sichtbaren Monats.
- Vorhandene BD/HG, RBN, Abwesenheiten, Wünsche, Optionen und Notizen bleiben unverändert.
- Während Konfiguration und Berechnung keine Mutation des sichtbaren oder gespeicherten Plans.
- Übernahme erst nach erneutem vollständigem Audit.
- Keine grauen oder technisch nicht wählbaren Besetzungen.
- Harte personengebundene Laufobergrenzen gelten in jeder Suchstufe.
- Rote Abweichungen ausschließlich nach vollständig ausgeschöpfter strikter Suche und ausdrücklicher Freigabe.
- Jede bestätigte rote Ausnahme wird protokolliert.

---

## 2. Auto-Plan Studio

Konfigurierbar sind Leistungsprofil, Suchintensität, Optimierungsschwerpunkt, Zeitrahmen der Perfektionsphase, Reparaturrunden, lokales Neuplanungsbudget, Late-Acceptance-Fenster, Optimalitätsnachweis, Portfolio-Diversität, Minimal-Rot-Fallback sowie individuelle BD-, HG- und Gesamtobergrenzen.

Der Zeitrahmen wird als `timeBudgetMs` an jeden Perfektionsworker übergeben. Im Budgetmodus wird der Lauf nicht wegen Konvergenz vorzeitig beendet; lediglich der abschließende Zertifizierungsanteil kann das verbleibende Budget verbrauchen.

---

## 3. Null-Rot-Guardrail

```text
1. strict-balanced
2. strict-coverage / verbreiterte Null-Rot-Rescue
3. confirmable-balanced nur bei freigegebenem Minimal-Rot-Fallback
```

Rot ist keine Optimierungsabkürzung, sondern ausschließlich eine nachgelagerte, bestätigungspflichtige Ausnahme.

---

## 4. Algorithmusarchitektur v8.1

### 4.1 Lexikografische Zielordnung

Harte Kriterien dominieren weiche Qualität. Der Zielschlüssel wird von links nach rechts verglichen:

1. Laufobergrenzen
2. technisch nicht wählbare Einträge
3. offene Felder
4. Rot-Obergrenze
5. rote Einträge
6. besonders bestätigungspflichtige rote Einträge
7. orange Einträge
8. gelbe Einträge
9. Optimierungsfokus, Wünsche und Gerechtigkeitskennzahlen
10. Spannweiten von BD, Gesamtlast und Wochenendäquivalent

### 4.2 Vollständiges Konstruktionsportfolio

**Behobene Ursache der Sekundenläufe:** Bis `0.8.0` beendete der Runner alle übrigen Konstruktionsworker, sobald Profil 0 irgendeine vollständige Null-Rot-Belegung meldete. Das war logisch falsch: Zwei vollständige Null-Rot-Pläne können sich bei **Orange, Gelb, Wunscherfüllung und Fairness erheblich unterscheiden**. Die bereits laufenden breiteren Profile wurden verworfen, obwohl sie einen besseren Startzustand für die Perfektionsphase liefern konnten.

Seit `0.8.1` gilt:

- alle freigegebenen Konstruktionsprofile laufen bis zu einem terminalen Ergebnis;
- früh fertige Worker ziehen den nächsten Profilauftrag aus der Queue;
- jede Antwort wird mit derselben vollständigen `objectiveKey`-Ordnung verglichen;
- erst nach Abschluss des gesamten Konstruktionsportfolios wird der beste Aufbau an alle Perfektionsworker verteilt;
- unvollständige Ergebnisse können niemals einen vollständigen Amtsinhaber verdrängen;
- Workerfehler werden gezählt, ohne das Portfolio in einen falschen Erfolg umzudeuten;
- der Minimal-Rot-Strang dupliziert die Null-Rot-Rescue weiterhin nicht.

Damit ist die Laufzeit wieder fachlich plausibel: Eine aktivierte Perfektionsphase mit beispielsweise 120 Sekunden Budget kann nicht regulär nach wenigen Sekunden enden, nur weil das erste Konstruktionsprofil bereits eine formal vollständige Belegung gefunden hat.

### 4.3 Perfektionsphase

Adaptive Large Neighborhood Search mit:

- acht Zerstörungsoperatoren;
- drei Wiederaufbauoperatoren einschließlich Regret-2;
- Late-Acceptance-Annahme;
- segmentweiser Gewichtsanpassung;
- Luby-Neustarts;
- vollständigen Abstiegen über Einzelumsetzung, Paartausch, Dreierkette, Tages- und Wochenendpakete;
- abschließendem Optimalitätsnachweis.

### 4.4 Fixpunktschutz

Fixpunkte erscheinen nicht in der Slotliste, werden über einen zentralen Schreibpfad geschützt, nach der Perfektion erneut geprüft und vor der Übernahme nochmals vollständig auditiert.

---

## 5. Mehrkern-Ausführung

Das Worker-Budget ist das Minimum aus Kernbudget, Leistungsprofil, Gerätespeicher und Problemgröße. Ein oder zwei Kerne bleiben je nach Gerät für UI und Animation reserviert.

Aufbau- und Perfektionsportfolio sind getrennt:

- **Aufbau:** vollständige Auswertung aller Profile, anschließend objektiver Gewinnervergleich.
- **Perfektion:** mehrere diversifizierte Läufe desselben besten Aufbaus; bestes Endergebnis gewinnt.

Eine GPU-Fassung wird nicht parallel gepflegt, da eine zweite numerische Regelengine unvermeidlich vom produktiven Regelwerk abweichen könnte.

---

## 6. Lokale Entwicklung

```bash
npm ci
npm run check
npm test
npm run test:e2e
```

Vollständiges Gate:

```bash
npm run verify
```

---

## 7. Regressionstests

Zusätzlich zu den bestehenden v8-Invarianten prüfen die neuen Portfolio-Regressionen:

- Ein späterer vollständiger Null-Rot-Aufbau mit besserer `objectiveKey` verdrängt den ersten sauberen Aufbau.
- Ein unvollständiges Ergebnis verdrängt niemals ein vollständiges Ergebnis.
- Adaptive Workergrenzen und explizite Parallelitätslimits bleiben unverändert.

Diese Tests sichern den eigentlichen Fehler dauerhaft ab: **Vollständigkeit ist kein ausreichendes Abbruchkriterium für das Konstruktionsportfolio.**

---

## 8. Release 0.8.1

### Behoben

- voreiliger Portfolio-Kurzschluss nach dem ersten vollständigen Null-Rot-Ergebnis;
- dadurch übersprungene breitere Konstruktionsprofile;
- irreführend kurze Gesamtläufe trotz aktivierter Perfektionsphase;
- fehlende direkt testbare Vergleichsfunktion für Portfolioergebnisse.

### Gehärtet

- einheitlicher Vergleich aller Aufbau- und Perfektionsergebnisse über die vollständige lexikografische Zielordnung;
- Regressionstests gegen Qualitätsverlust und Vollständigkeitsinversion;
- Cache-Buster der Runner-/Worker-Imports auf `20260803.5` angehoben.

---

## 9. Grenzen

- Eine vollständige Null-Rot-Belegung kann mathematisch unmöglich sein.
- Die Zertifizierung beweist lokale Optimalität für die vollständig geprüften Nachbarschaften, nicht globale Optimalität des gesamten kombinatorischen Problems.
- Mehr Zeit und mehr Kerne erhöhen die Suchtiefe, garantieren jedoch keinen globalen Optimalitätsbeweis.
- RBN und zweite RBN bleiben manuell.
