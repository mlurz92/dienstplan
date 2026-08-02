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