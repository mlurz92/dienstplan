# Auto-Plan Changelog

## 2026-08-04 (2) – Release 0.9.1 / Regelwerk v4.10

- **Neue Regel Fr-BD · Sa frei · So-BD:** Freitags-BD, vollständig freier
  Samstag und Sonntags-BD derselben Person sind rot und besonders
  bestätigungspflichtig (spezieller Bestätigungstyp, symmetrische Prüfung,
  graue Sperren bleiben absolut).
- **Prof. Schäfer entfernt:** `RETIRED_STAFF_IDS` bereinigt Standardstamm,
  gespeicherte Stände, Server-Bootstraps und Sicherungen; historische
  Monatseinträge bleiben externe Fixpunkte.
- **Einstellungsmenü:** Reiter „Auto-Plan v9“ mit Solver-Backend,
  CP-SAT-Zeitbudget, CP-SAT-Worker, Warmstart, Fairness-Profil,
  Infeasibility-Modus, Erklärungstiefe, Determinismus und
  Reparatur-nach-Änderung; das Settings-Schema ist erweitert und strikt
  normalisiert.
- **v9-Bezeichnungen überall:** Ribbon, Engine-Badge, Guardrail, Stufenliste
  und Phasentheater (acht Stufen) vollständig auf v9 gehoben.
- **Studio-Layout:** zweispaltige Konfiguration, acht vollständig sichtbare
  Phasenkarten, Modal passt ohne eigenen Scroll in den Viewport, Ergebnis-
  und Obergrenzen-Bereiche scrollen intern.
- **Dunkelmodus-Kohärenz:** globale Token-Abbildung auf die dunkle Palette;
  Tabellen, Chips, Picker, Dialoge, Einstellungen, Formulare und Command Bar
  kontraststark.
- **Theme-Umschalter** nur noch als Sonnen-/Mond-Piktogramm; Start im
  Hellmodus.
- **Beruhigte Animationen:** Visualizer-Kometen, Wellen, Funken, Drift und
  Phasenpuls langsamer und weicher; `prefers-reduced-motion` wird respektiert.
- **Exakte Suche in Workern:** WASM-Guard erlaubt CP-SAT auch in den
  Modul-Workern der Laufumgebung; Phasen-Pacing macht den exakten Durchlauf
  sichtbar; `perfect`/`certify` werden explizit gemeldet.
- **BugHunt:** 402 Modultests und 41 Browsertests grün; E2E-Verträge auf den
  v9-Stand gehoben.

## 2026-08-04 – Release 0.9.0 / Auto-Plan v9 (Hybrid Exact Observatory)

- **CP-SAT-Kern im Browser:** Googles OR-Tools CP-SAT läuft als WebAssembly
  (`or-tools-wasm` / `cpsat-js`); der Monatszustand wird in ein lineares
  Constraint-Modell mit phasenweisen Zielkomponenten übersetzt.
- **Lexikografische exakte Suche:** Maximin-Fairness (Leximin) zuerst, danach
  Wünsche, BD-Soll, Wochenend- und Samstagslast in der Reihenfolge des
  Optimierungsschwerpunkts; erreichte Werte werden phasenweise fixiert.
- **Beweisbare Optimalität:** OPTIMAL-Status mit unterer Schranke
  (`bestObjectiveBound`) und Zertifizierung; das Exaktheitsnachweis-Panel im
  Studio zeigt Status, Schranke, Phasenspur und Bindung.
- **MUS-artige Ursachenanalyse:** Bei INFEASIBLE werden Constraint-Gruppen
  gierig wieder aktiviert, bis die kleinste Konfliktursache benannt ist;
  `infeasibilityMode: 'relax'` weicht Gruppen in fachlicher Reihenfolge auf
  und weist die aufgegebenen Regeln im Ergebnis aus.
- **Warmstart und Fallback:** Die v8.5-Heuristik liefert Lösungshinweise
  (Hints) und bleibt vollständig tragfähig, wenn keine WASM-Bindung ladbar
  ist; das Ergebnis wird immer durch die Regelengine auditiert und nach
  deren Zielordnung entschieden.
- **Determinismus:** CP-SAT-Seed und Heuristik-Seed leiten sich aus
  Konfiguration und Monatszustand ab; identische Eingaben ergeben identische
  Pläne.
- **Studio v9:** zehn neue Regler (Solver-Backend, Exaktheit, CP-SAT-Zeitbudget
  und -Worker, Warmstart, Fairness-Profil, Determinismus, Infeasibility-Modus,
  Reparatur-nach-Änderung, Erklärungstiefe), erklärende Tooltips an jeder
  Stelle, Exaktheitsnachweis-Panel und v9-Phasentheater.
- **Layout:** Der Dialog passt vollständig in den Viewport; nur innere
  Bereiche scrollen. Das Algorithmus-Kommentar-Fenster wächst nicht mehr,
  sondern scrollt intern (feste Höhe 210 px).
- **Dark-Mode-Kontraste** für Offen-Badges, Tabellen, Karten und Modals;
  die Anwendung startet standardmäßig im hellen Erscheinungsbild; der
  Theme-Umschalter ist ein reines Sonnen-/Mond-Piktogramm.
- **COOP/COEP-Header** in `_headers` für multithreaded WebAssembly;
  `credentialless`-Variante dokumentiert.
- **Animations-Politur:** Suchstrahl-Sheen der Null-Rot-Welle, Phasenpuls
  und gleitende Logzeilen.
- v9-Konfigurationsfelder sind fingerprint-stabil und idempotent
  normalisiert; die Fallback-Pipeline meldet Abschlüsse genau einmal.
- Neue Tests: `tests/auto-plan-v9.test.js` (Modellbau, Konfiguration,
  Relaxations-Diagnose, Fallback-Pipeline, Studio- und Header-Verträge).

## 2026-08-03 – Release 0.6.5 / Auto-Plan v7.5

- Truthful Constraint Observatory mit getrennten Anzeigen für reale Arbeitsmenge, Portfoliozustand, Qualitätsgewinn und aggregierten Gesamtfortschritt.
- Nichtterminaler Fortschritt bleibt unter 100 Prozent; das erste fertige Workerergebnis kann das übrige Portfolio nicht mehr überholen.
- Ressourcenschonende 2D-Animation mit 30/20/15-fps-Budgets, gemessener Framekostenanpassung, Sichtbarkeitsstopp und ereignisbasierter Reduced-Motion-Darstellung.
- Knoten werden nur noch durch tatsächliche Feldereignisse als bearbeitet markiert; prozentbasierte synthetische Abschlüsse sind entfernt.
- Detaillierte Laufkommentare für Kernverteilung, Suchengpässe, Portfolioabschlüsse, Perfektionsrunden, Bewertungen, Verbesserungen und Schlussqualität.
- Algorithmusmeldungen werden ausschließlich über sichere DOM-Textknoten ausgegeben.
- Abbrechbare Ergebnisüberleitung und Lauf-Epochen verhindern verspätete Ergebniswechsel nach Schließen oder Neustart.
- Workerprotokoll gegen interne Abbrüche, unbekannte Antworten, Laufzeit- und Übertragungsfehler gehärtet; alle Terminalpfade räumen Listener und Worker auf.
- Aggregierte Portfolioereignisse bleiben am tatsächlichen Phasenanfang; ein einzelner Perfektionslauf springt nicht mehr vor Arbeitsbeginn von 55 auf 96 Prozent. Erfolgreiche, abgebrochene und fehlgeschlagene Arbeitsstränge werden getrennt ausgewiesen.
- Animation, Zeitgeber, Beobachter und Einstellungslistener werden bei Ergebnis, Abbruch und Fehler vollständig beendet.
- Negative, gebrochene und nichtnumerische Rohgrenzen blockieren den Start; partielle Engine-Konfigurationen behalten sicherheitsrelevante Standardgrenzen.
- Rich Tooltips schließen unmittelbar, wenn sie in den App-Einstellungen deaktiviert werden.
- Planner, Studio, Einstellungen, Paket und Browser-Modulgraph einheitlich auf v7.5 / Release `0.6.5` angehoben.
- Neue Unit-, Integrations-, generative Invarianten- und Browserregressionen für Fortschritt, Worker, Lifecycle, Animation, Accessibility und Eingaberandfälle.

## 2026-08-03 (2)

- Ausführung in eigenen Arbeitssträngen: Der Anzeigestrang bleibt vollständig frei, die Rechnung verliert keine Zeit mehr ans Warten auf den Bildaufbau.
- Aufbauläufe werden gleichzeitig gestartet statt nacheinander; liefert der erste eine vollständige Null-Rot-Belegung, werden die übrigen sofort beendet.
- Mehrere Perfektionsläufe mit verschiedenen Startwerten auf demselben, nur einmal berechneten Aufbau; der beste Vorschlag gewinnt.
- Vergleichsgruppen-Speicher der Regelbewertung: Kandidatenaufzählung rund viermal schneller, mit Gleichwertigkeitstest über tausende Belegungszustände abgesichert.
- Absteigende Suche und Zertifizierung beginnen bei den auffälligsten Zellen.
- Festgelegte BD-Obergrenzen je Person als Laufvorgabe; HG-Vorgabe null für alle, die im Monat an keinem Tag HG-berechtigt sind, abgeleitet aus der datumsabhängigen Qualifikation.
- Tooltips an allen Bedienelementen, Tabellenüberschriften und Live-Kennzahlen des Studios.

## 2026-08-03

- Perfektionsphase mit adaptiver Ruin-and-Recreate-Suche, acht Zerstörungsoperatoren und Late-Acceptance-Annahme.
- Abschließende Zertifizierung: vollständige Prüfung aller Einzelumsetzungen und Paartausche als Nachweis lokaler Optimalität.
- Konfigurierbarer Zeitrahmen der Perfektionsphase, Late-Acceptance-Fenster und abschaltbare Perfektionsphase.
- Deterministischer, aus den Eingaben abgeleiteter Zufallsgenerator; strenge Reproduzierbarkeit im Konvergenzmodus, praktische im Zeitrahmenmodus.
- Ausschnittsgröße der Ruin-and-Recreate-Suche nach Ropke und Pisinger vergrößert und aus der gemessenen Rundendauer selbstregelnd an den Zeitrahmen angepasst.
- Zweiter, rein gieriger Wiederaufbauversuch rettet große Ausschnitte, die sonst als Sackgasse verworfen würden.
- Optimalitätsnachweis verfällt, wenn nach der Zertifizierung noch etwas verändert wurde.
- Vorschlagsansicht bis in Tagesnummer, ausgeschriebenen Wochentag und Zeilenmarkierung an die Diensttabelle angeglichen.
- Zeitgesteuerte Rückgabe an den Browser in allen Rechenstufen; Oberfläche und Animation bleiben während des gesamten Laufs bedienbar.
- Monoton steigender Fortschritt und genau eine Abschlussmeldung je Lauf.
- Laufzeit eines vollen Monats von über zehn Minuten auf wenige Sekunden Aufbauzeit gesenkt: allokationsfreie Zählungen, zwischengespeicherte Kalender- und Personaldaten, einmalig bestimmter Wunschkatalog, inkrementelles Ranking der Konstruktion und nachgelagertes Vorwärts-Checking.
- Studio vollständig neu aufgebaut: ein gemeinsamer Arbeitsbereich statt verschachtelter Scrollboxen; damit sind die Obergrenzen jeder Person wieder erreichbar und bedienbar.
- Neue Canvas-Darstellung mit Kometen, Druckwellen, Kopplungsfäden, Phasenfarben und Qualitätsverlauf.
- Doppelte Zählung des gesetzten Zuges in der Laufgrenzen-Vorprüfung behoben; Züge, die eine Obergrenze genau erreichen, gelten nicht mehr als Verstoß.
- Schreibsperre auf Fixpunkte am einzigen Mutationspunkt der Perfektionsphase.
- Ein Wechsel der Suchintensität überschreibt selbst eingetragene Werte nicht mehr.

## 2026-08-02

- Regelwerk v4.8.
- Vertiefte Null-Rot-Suche.
- Bestätigungspflichtiger Minimal-Rot-Fallback.
- Erneuter Übernahmeaudit.
- Vollständiger Planungsfingerprint.
- Scrollbare Vorschau und Statistik.
- Beförderungsstichtage in Optimierung und Statistik.
- Einheitlicher Release-Token im vollständigen Modulgraphen beibehalten.
