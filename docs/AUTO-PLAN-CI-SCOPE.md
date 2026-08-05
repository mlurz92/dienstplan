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
