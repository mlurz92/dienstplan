# Auto-Plan-Härtung 2026-08-02

Dieser Änderungsstand härtet den bestehenden Auto-Plan fachlich, technisch und in der Prüfoberfläche.

## Kernänderungen

- vertiefte Null-Rot-Suche vor jedem Fallback;
- vollständiger Minimal-Rot-Fallback nur mit technisch wählbaren roten Kandidaten;
- absolute Sperre grauer beziehungsweise nicht wählbarer Kandidaten;
- ausdrückliche Gesamtbestätigung aller aufgeführten roten Zuteilungen;
- revisionsfeste Override-Protokollierung jeder bestätigten roten Zelle;
- erneuter vollständiger Audit unmittelbar vor der Übernahme;
- erweiterter Planungsfingerprint für Markierungen, Personal und geladene Monatsstände;
- zeitabhängige Aktivitäts-, Qualifikations- und Beförderungsbewertung;
- vollständig scrollbar prüfbare Ergebnisansicht bei kleinen und großen Viewports;
- Beibehaltung des einheitlichen Release-Tokens für den gesamten Modulgraphen; Cloudflare revalidiert die Anwendungsassets bei jedem Aufruf.

## Sicherheitsgrenze

Fehlende Qualifikation, inaktive beziehungsweise nicht planbare Personen, gleichzeitiger BD/HG derselben Person und unmittelbar aufeinanderfolgende eigene BD bleiben nicht überschreibbar. Diese Fälle werden weder in der Null-Rot-Suche noch im Minimal-Rot-Fallback zugelassen.

## Validierung

Die Änderung erweitert Unit-/Regressionstests und Chromium-End-to-End-Tests um Minimal-Rot-Bestätigung, graue Absolutsperren, Fingerprint-Manipulationsschutz, Beförderungsstichtag, Override-Protokollierung und Scrollbarkeit des Auto-Plan Studios.