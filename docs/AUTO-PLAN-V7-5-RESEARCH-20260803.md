# Auto-Plan v7.5: Recherche, Zielbild und Bug-Hunt-Protokoll

Stand: 3. August 2026

## 1. Ausgangslage

v7 besitzt bereits eine globale Fail-first-Konstruktion, ein inkrementelles Assignment Ledger, eine kostenbewusste Operatorauswahl und ein adaptives Worker-Portfolio. Die v7.5-Analyse konzentriert sich deshalb auf die Wahrhaftigkeit der Laufanzeige, die Ressourcenkonkurrenz zwischen Solver und Animation, die Differenzierung der Algorithmuskommentare und schwer erreichbare Lebenszyklus- sowie Eingaberandfälle.

Die Codeaufnahme zeigte vor der Umsetzung insbesondere:

1. Die Canvas-Schleife läuft nach dem Ergebnis unsichtbar weiter, bis das Studio geschlossen wird.
2. Ein Abbruch während der kurzen Ergebnisüberleitung kann anschließend noch eine Ergebnisansicht in den bereits geschlossenen Dialog schreiben.
3. Der Knotenring markiert Felder teilweise allein aus dem Gesamtprozentwert als erledigt, obwohl kein passendes Solver-Ereignis für das Feld eingegangen ist.
4. Bei parallelen Läufen wird der weiteste Lauf als Gesamtfortschritt gezeigt; langsame oder noch nicht gestartete Portfolioanteile bleiben dadurch unsichtbar.
5. Reduzierte Bewegung, Dialogsichtbarkeit und tatsächliche Renderkosten steuern die Zeichenschleife nicht vollständig.
6. Mehrere parallele Blockiert-Ereignisse können wiederholte Schlusszeilen erzeugen.
7. Ungültige numerische Obergrenzen können bei der UI-Normalisierung wie eine leere, unbegrenzte Vorgabe behandelt werden.
8. Eine partielle programmgesteuerte Konfiguration kann die standardmäßige HG-Sperre verlieren.
9. Das erste terminale Ereignis eines einzelnen Perfektionsworkers kann 100 Prozent und „Fertig“ melden, obwohl andere Portfolioanteile noch laufen.
10. Portfoliozähler aus dem Aufbau können ohne Phasentrennung in die Perfektion hineinreichen.
11. Ein sichtbarer Rich Tooltip bleibt nach dem Abschalten der Funktion stehen.
12. Die v6-/v7-Studiohüllen können unbegrenzt per `requestAnimationFrame` auf ein fehlendes Basismodul warten.
13. Abbruchlistener bleiben nach erfolgreichem Workerabschluss gebunden; synchrone `postMessage`-Fehler umgehen den regulären Abschlussweg.
14. Ein interner `AbortError` oder eine unbekannte Workerantwort kann das Portfolio ohne Terminalzustand warten lassen.
15. Algorithmusmeldungen werden als HTML eingesetzt, obwohl ein Teil des Textes aus Workerereignissen stammt.
16. Ein nicht verfügbarer Canvas-2D-Kontext kann den gesamten Auto-Plan-Start abbrechen, obwohl die Grafik fachlich optional ist.
17. Ein aggregiertes Perfektionsereignis ohne Lauf-ID wird wie Lauf 0 interpretiert und lässt Ein-Worker-Portfolios vor Arbeitsbeginn von 55 auf 96 Prozent springen.
18. Fehlgeschlagene Worker werden zugleich als erfolgreich abgeschlossen gezählt; nach der Normalisierung kann ihr Perfektionskommentar außerdem fälschlich einen Aufbaulauf benennen.

## 2. Quellen und abgeleitete Entscheidungen

### Solverfortschritt und Dienstplanung

- [Google OR-Tools: Employee Scheduling](https://developers.google.com/optimization/scheduling/employee_scheduling) trennt harte Abdeckung und Einschränkungen von nachgelagerter Präferenzoptimierung. v7.5 bewahrt diese lexikografische Ordnung unverändert.
- [OR-Tools Scheduling Recipes](https://github.com/google/or-tools/blob/stable/ortools/sat/docs/scheduling.md) stützt die vorhandene Constraint-Modellierung und den vollständigen Schlussaudit.
- [OR-Tools Troubleshooting](https://github.com/google/or-tools/blob/stable/ortools/sat/docs/troubleshooting.md) beschreibt parallele Solver und detaillierte Suchprotokolle. Für v7.5 werden Portfoliozustand, Arbeitsmenge und Ergebnisqualität deshalb getrennt statt als eine scheinpräzise Restzeit dargestellt.
- Thayer, Stern und Lelis, [Are We There Yet? — Estimating Search Progress](https://doi.org/10.1609/socs.v3i1.18241), zeigen, dass Suchfortschritt eine eigene Schätzaufgabe ist. v7.5 verwendet keine erfundene lineare Restzeit, sondern nur beobachtbare Phasen- und Arbeitsanteile.
- Chaudhuri et al., [When Can We Trust Progress Estimators for SQL Queries?](https://www.microsoft.com/en-us/research/publication/when-can-we-trust-progress-estimators-for-sql-queries/), zeigen die grundsätzlichen Grenzen robuster Fortschrittschätzung. Eine Zeitprognose erscheint daher nur, wenn der zeitbudgetierte Perfektionsschritt selbst eine belastbare Restzeit liefert.
- Svegliato, Wray und Zilberstein, [Meta-Level Control of Anytime Algorithms with Online Performance Prediction](https://doi.org/10.24963/ijcai.2018/208), stützen die getrennte Anzeige von aktuellem Lösungsgewinn und verbleibendem Budget bei Anytime-Optimierung.

### Rendering und Ressourcenschonung

- [MDN: `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) verlangt zeitbasierte Animation und weist auf Pausen in Hintergrundtabs hin. v7.5 nutzt den Frame-Zeitstempel, begrenzt die eigene Bildrate zusätzlich und beendet die Schleife explizit.
- [W3C Page Visibility Level 2](https://www.w3.org/TR/page-visibility-2/) definiert `visibilitychange`. Die Visualisierung pausiert sofort, wenn das Dokument nicht sichtbar ist.
- [MDN: Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API) empfiehlt die asynchrone Sichtbarkeitsbeobachtung, um unnötige Main-Thread-Arbeit zu vermeiden. Die Canvas läuft nur, solange ihre Bühne tatsächlich sichtbar ist.
- [web.dev: Rendering Performance](https://web.dev/articles/rendering-performance) beschreibt das knappe Framebudget und Jank bei zu teuren Frames. v7.5 misst die eigenen Zeichenkosten und senkt Detailgrad sowie Takt adaptiv.
- [web.dev: Improving HTML5 Canvas performance](https://web.dev/articles/canvas-performance) empfiehlt gebündelte Zeichenoperationen und Vorberechnung wiederkehrender Inhalte. Statische Geometrie und deterministische Verbindungen werden deshalb nicht pro Frame neu erzeugt.
- [Chrome: Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames) trennt Gesamtdauer und blockierenden Anteil eines Frames. Die Visualisierung misst ihre Renderkosten intern als gleitenden Mittelwert, ohne eine browserabhängige harte CI-Wandzeit zu behaupten.

### Accessibility und verständlicher Status

- [W3C Technique ARIA25](https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA25) erläutert, dass `role="progressbar"` allein Änderungen nicht vorliest und ein höflicher Live-Status erforderlich ist. v7.5 führt beides getrennt.
- [MDN: `prefers-reduced-motion`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion) fordert das Entfernen oder Ersetzen nicht notwendiger Bewegung. v7.5 zeichnet in diesem Modus ausschließlich bei echten Zustandsänderungen.
- [WCAG 2.2](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/) bleibt Maßstab für Fokus, Zielgrößen und vorhersehbare Bedienung des Studios.

### Community-Signale

- Die [OR-Tools CP-SAT Discussions](https://github.com/google/or-tools/discussions/categories/cp-sat-questions) zeigen wiederkehrende Praxisfragen zu Mehrkernleistung, Fortschrittsprotokollen, Determinismus und Speichergrenzen.
- [OR-Tools Issue #4376](https://github.com/google/or-tools/issues/4376) dokumentiert, dass zusätzliche Lösungscallbacks Laufzeiten erheblich verändern können. v7.5 drosselt Kommentare und überträgt keine vollständigen Ergebnisse in Fortschrittsereignissen.
- Die Stack-Overflow-Diskussion [Stopping work when canvas isn't visible](https://stackoverflow.com/questions/35876742/stopping-work-when-canvas-isnt-visible) bestätigt als Praxissignal den häufigen Fehler unsichtbar weiterlaufender Canvas-Arbeit; die Umsetzung stützt sich auf Page Visibility und Intersection Observer als normative beziehungsweise offizielle Grundlage.
- Die Stack-Overflow-Diskussion [requestAnimationFrame resource consumption](https://stackoverflow.com/questions/66583281/requestanimationframe-resource-consumption-redrawing-whole-or-part-of-canvas) hebt hervor, dass unveränderte Frames unnötige Arbeit sind. Reduced Motion und abgeschlossene Zustände werden daher ereignisgesteuert gezeichnet.

Communityquellen dienen ausschließlich als Fehlersignale; Entscheidungen werden gegen Standards, offizielle Browserdokumentation, Solverquellen und lokale Messungen geprüft.

## 3. Akzeptanzkriterien

- **AC-1 – Versionsidentität:** Plannerresultat, Studio, sichtbare Produktbezeichnung und Cachetoken weisen konsistent v7.5 aus.
- **AC-2 – wahrer Fortschritt:** Der Gesamtwert bleibt endlich, monoton und unter 100 Prozent, bis ein terminales Ereignis vorliegt. Parallele Läufe werden als Portfolio aggregiert; tatsächlich bearbeitete Felder, abgeschlossene Läufe und Qualitätsgewinne bleiben getrennte Messgrößen.
- **AC-3 – ressourcenschonende Animation:** Unsichtbare, reduzierte, abgeschlossene oder gestoppte Zustände erzeugen keine dauerhafte Zeichenschleife. Sichtbare Animation bleibt zeitbasiert, passt Detailgrad und maximale Bildrate an die gemessenen Renderkosten an und gibt Beobachter vollständig frei.
- **AC-4 – differenzierte Kommentare:** Analyse, Suche, Rescue, Fallback, Reparatur, Perfektion, Zertifizierung, Erfolg und Blockade nennen jeweils reale, phasenspezifische Kennzahlen. Wiederholungen werden gedrosselt, Abschlussmeldungen erscheinen genau einmal und fremde Texte werden nicht als HTML ausgeführt.
- **AC-5 – sicherer Lebenszyklus:** Abbruch während Suche oder Ergebnisüberleitung kann weder einen späteren Ergebniswechsel noch eine Übernahme auslösen. Worker, Zeitgeber, Beobachter und Animation werden bei jedem Ausgang freigegeben.
- **AC-6 – defensive Parameter:** Negative, gebrochene, nichtnumerische und unter Fixpunkten liegende Grenzen blockieren den Start. Fehlende Teilkonfigurationen behalten sicherheitsrelevante Standardgrenzen.
- **AC-7 – Edge Cases:** Voll belegte, vollständig leere, knappe, ausschließlich rote, schaltjahrbetroffene und kleine Monate behalten Fixpunkte, Regelreihenfolge, Obergrenzen und atomare Übernahme.
- **AC-8 – zugängliches Studio:** Der sichtbare Prozentwert besitzt programmatische Fortschrittssemantik; Live-Kommentare verschieben keinen Fokus. Reduced Motion, erzwungene Farben, kleine Fensterhöhen, Tastaturabbruch und Fokus-Rückgabe bleiben funktionsfähig.
- **AC-9 – Regression und Dokumentation:** Syntaxprüfung, Unit-/Integrationssuite, Eigenschaftsinvarianten, E2E und README sind grün beziehungsweise aktuell, bevor der Branch nach `main` gemergt wird.

## 4. Gate-Entscheidung

| Gate | Ergebnis | Begründung |
|---|---|---|
| 0 Skip all | AUS | Fachlogik, Parallelität und sichtbarer Hauptworkflow |
| 1 Unit | AN | Rechen- und Zustandslogik ist isolierbar |
| 2 Integration | AN | Planner/Worker/UI überschreiten echte Grenzen |
| 3 Component/E2E | AN: E2E | Nutzerkritischer Dialogworkflow |
| 4 Contract | AUS | Keine unabhängig ausgelieferten Consumer |
| 5 Smoke | AN | Deploybare Webanwendung und auflösbarer Worker-Modulgraph |
| 6 Property-based | AN | Unbegrenzte Ereignisfolgen mit stabilen Invarianten |

## 5. Testfälle

### AC-1 – Versionsidentität

- [unit] Plannerresultat trägt die Revision 7.5
- [e2e] Studio weist die Revision 7.5 aus

### AC-2 – wahrer Fortschritt

- [unit] Portfoliofortschritt mittelt gestartete Aufbaupfade ohne Vorauseilen
- [unit] Phasenwechsel hält den Fortschritt monoton
- [unit] Nichtterminaler Fortschritt bleibt auf höchstens 99 Prozent begrenzt
- [unit] Terminaler Fortschritt erreicht exakt 100 Prozent
- [property-based] Generierte Ereignisfolgen liefern nur endliche Werte im Bereich null bis eins
- [property-based] Generierte Ereignisfolgen erzeugen keinen Rückschritt

### AC-3 – ressourcenschonende Animation

- [unit] Reduced Motion plant nur ein Bild je Zustandsänderung
- [unit] Abschluss stoppt die dauerhafte Bildfolge
- [unit] Langsame Frames senken Detailgrad und Zieltakt
- [integration] Stop gibt Resize-, Intersection- und Visibility-Beobachter frei

### AC-4 – differenzierte Kommentare

- [unit] Engpassmeldung nennt Rolle, Datum, Kandidaten, Beam und geprüfte Zustände
- [unit] Portfolioabschluss nennt erledigte Läufe
- [unit] Parallele Blockaden erzeugen genau eine Schlussmeldung
- [unit] Fremder Meldungstext bleibt reiner Text

### AC-5 – sicherer Lebenszyklus

- [e2e] Abbruch während der Ergebnisüberleitung hält den Dialog geschlossen
- [integration] Workerfehler beendet oder ersetzt jeden Portfolioauftrag
- [integration] Abbruch entfernt den Signallistener

### AC-6 – defensive Parameter

- [unit] Grenze minus eins wird abgewiesen [BVA B-1]
- [unit] Grenze null bleibt gültig [BVA B]
- [unit] Grenze eins bleibt gültig [BVA B+1]
- [unit] Gebrochene Grenze wird abgewiesen
- [unit] Nichtnumerische Grenze wird abgewiesen
- [unit] Partielle Konfiguration behält die HG-Standardgrenze
- [e2e] Ungültige Rohwerte sperren den Start

### AC-7 – Edge Cases

- [integration] Voll belegter Monat endet ohne Änderung
- [integration] Minimal-Rot bleibt nach strikter Rescue nachgelagert
- [integration] Schaltjahr erhält alle Tages- und Nachbarschaftsregeln
- [integration] Fixpunkte bleiben über Konstruktion, Perfektion und Übernahme unverändert

### AC-8 – zugängliches Studio

- [e2e] Fortschrittsbalken aktualisiert `aria-valuenow`
- [e2e] Reduced Motion deaktiviert die dauerhafte Canvas-Schleife
- [e2e] Escape gibt den Fokus an den Auslöser zurück
- [e2e] Kleine Fensterhöhe hält Status und Abbruch erreichbar

### AC-9 – Regression und Dokumentation

- [smoke] Anwendung startet mit auflösbarem v7.5-Worker-Modulgraph
- [smoke] Auto-Plan Studio öffnet aus der Hauptaktion

## 6. Bewusst verworfene Wege

- Eine künstlich linear laufende Prozentanzeige wurde verworfen, weil sie Suchfortschritt vortäuscht.
- Eine ML-Restzeitprognose wurde verworfen, weil belastbare Trainingsdaten je Monats- und Regelkonfiguration fehlen.
- WebGL/WebGPU wurden verworfen, weil die Visualisierung klein ist und zusätzlicher Kontext-, Treiber- sowie Accessibility-Aufwand den 2D-Canvas-Nutzen übersteigt.
- Eine zweite fachliche Solverimplementierung für Anzeige oder GPU bleibt ausgeschlossen; die Regelengine ist die einzige Wahrheitsquelle.

## 7. Umsetzung und lokale Verifikation

| Kriterium | Umgesetzter Nachweis |
|---|---|
| AC-1 | Plannerwrapper, Studio, sichtbare Bezeichnungen, Paket `0.6.5` und Browser-Modulgraph weisen v7.5 beziehungsweise Release-Token `20260803.4` aus. |
| AC-2 | Eigenes Fortschrittsmodell mit Phasenfenstern Aufbau 3–55 %, Perfektion 55–97 %, monotonem Portfolioanteil, 99-%-Schranke und genau einem terminalen 100-%-Ereignis. |
| AC-3 | Reine Renderbudgetfunktion für 33/50/67 ms sowie 160/80/24 Partikel; Sichtbarkeit, Schnittmenge, Reduced Motion, Abschluss, Stop und fehlender Canvas-Kontext sind abgedeckt. |
| AC-4 | Kennzahlenbasierte Kommentare für Analyse, Suche, Portfolio, Perfektion, Verbesserung, Zertifizierung und Ergebnis; Entdopplung und sichere DOM-Textausgabe. |
| AC-5 | Abbrechbare Ergebnisüberleitung, Lauf-Epochen, Worker- und Abbruchlistener-Cleanup sowie terminale Behandlung interner Abbrüche, unbekannter Antworten und Übertragungsfehler. |
| AC-6 | Negative, gebrochene, nichtnumerische und unter Fixpunkten liegende Grenzen werden abgewiesen; Teilkonfigurationen behalten abgeleitete HG-Defaults. |
| AC-7 | Bestehende Regel-, Fixpunkt-, Fallback-, Schaltjahr-, Null-Arbeit-, Übernahme- und Atomizitätstests bleiben grün. |
| AC-8 | Browsertests prüfen Fortschrittssemantik, Reduced Motion, kleine Fensterhöhen, Einstellungen, Fokus, Tooltip-Lebenszyklus und sicheren Abbruch. |
| AC-9 | README, Changelog, CI-Prüfumfang, Anwenderprüfpfad, Forschungsnotiz und Teststrategie sind aktualisiert. |

Tatsächlich lokal ausgeführt am 3. August 2026:

- `npm run check`: erfolgreich; sämtliche ausgelieferten JavaScript-Module einschließlich der neuen v7.5-Module wurden syntaktisch geprüft.
- `npm test`: **351 bestanden**, 0 fehlgeschlagen, 0 übersprungen.
- `npm run test:e2e`: **35 bestanden** in Chromium, 0 fehlgeschlagen.

Starre CPU-, Speicher- oder Gesamtzeitgewinne werden nicht behauptet. Die ressourcenschonenden Eigenschaften sind durch deterministische Renderbudgets und Lebenszyklusinvarianten abgesichert; reale Wandzeiten bleiben geräte-, Daten- und Monatsabhängig.
