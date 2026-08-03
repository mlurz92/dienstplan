# Auto-Plan CI-Prüfumfang

Der Pull Request muss vor dem Merge mindestens folgende Prüfungen bestehen:

- JavaScript-Syntaxprüfung aller Module;
- vollständige Node-Unit- und Regressionstests;
- Chromium-End-to-End-Tests;
- sauberer Null-Rot-Lauf ohne vorzeitige Speicherung;
- Minimal-Rot-Lauf mit gesperrtem Übernahmebutton bis zur Bestätigung;
- Override-Protokollierung nach bestätigter Übernahme;
- scrollbare Ergebnisansicht bei 920 × 520 px;
- erneuter Audit manipulierter oder veralteter Vorschläge;
- zeitabhängige Beförderungs- und Rollenstatistik.

Für Auto-Plan v7.5 gehören zusätzlich zum verbindlichen Umfang:

- einheitliche v7.5-Identität und ein einziger Release-Token im vollständigen Browser-Modulgraphen;
- endlicher, monotoner Portfoliofortschritt mit höchstens 99 Prozent vor dem terminalen Gesamtereignis;
- getrennte Portfoliozähler für Aufbau und Perfektion sowie genau eine Abschlussmeldung;
- Workerfehler, interne Abbrüche, unbekannte Antworten und synchrone Übertragungsfehler ohne Hänger oder verbliebene Abbruchlistener;
- Abbruch während der Ergebnisüberleitung ohne spätes Öffnen oder Befüllen der Ergebnisansicht;
- strikt blockierte negative, gebrochene, nichtnumerische und unter Fixpunkten liegende Obergrenzen;
- vollständiger Erhalt von Fixpunkten und abgeleiteten HG-Grenzen bei partiellen Konfigurationen;
- Canvas-Budgets für normale, belastete, unsichtbare, reduzierte, beendete und nicht verfügbare Darstellungszustände;
- `role="progressbar"` mit aktuellem ARIA-Wert sowie Live-Kommentar ohne Fokusverschiebung;
- Reduced Motion, kleine Fensterhöhe, Tastaturabbruch, Fokus-Rückgabe und Tooltip-Deaktivierung im Browser;
- sichere Textausgabe aller Worker- und Algorithmuskommentare;
- aktuelle README, Forschungsnotiz, Teststrategie und Changelog ohne unbelegte Build-, Mess- oder Mergeaussagen.

Für Release 0.7.0 / Clinical Fluent Workspace gehören zusätzlich zum verbindlichen Umfang:

- Settings-Schema v4 mit Migration älterer Werte und strikter Validierung von `system`, `light` und `dark`;
- Wiederherstellung eines gespeicherten expliziten Themes vor Abschluss eines verzögerten Bootstrap-Abrufs;
- Mindestgröße zentraler Topbar-/Action-Bar-Bedienungen von 36 Pixeln beziehungsweise 44 Pixeln auf groben Zeigegeräten;
- keine dauerhafte rein dekorative Animation sowie vollständige Reduced-Motion-Steuerung;
- mindestens 4,5:1 Textkontrast auf dunklen Monats-, Wochenend-, Sammeldialog- und Auto-Plan-Flächen;
- Betriebssystem-Dark-Mode sowie Forced-Colors-Grundzustand mit ausgeblendeter Dekoration und sichtbarem Tastaturfokus;
- sticky Tag-/Wochentag-Orientierung, mobile Statistikkarten und kein horizontaler Seitenüberlauf;
- vollständig innerhalb des dynamischen Viewports liegende mobile Einstellungen mit eigenem Inhalts-Scrollbereich;
- gemeinsamer Release-Token `20260803.5` für Browsermodule, Styles und Manifest sowie Paketversion `0.7.0`.
