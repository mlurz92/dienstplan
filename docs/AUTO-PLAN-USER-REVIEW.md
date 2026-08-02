# Auto-Plan: Prüf- und Bestätigungsablauf

1. Auto-Plan berechnet zunächst eine vollständige Null-Rot-Variante.
2. Falls erforderlich, folgt eine vertiefte Null-Rot-Suche.
3. Nur wenn beide Suchstufen keine Komplettbelegung ergeben, wird eine Minimal-Rot-Variante berechnet.
4. Die Ergebnisansicht zeigt sämtliche konkreten BD/HG-Zuteilungen und die vollständige Belastungsstatistik in einem scrollbareren Prüfbereich.
5. Jede rote Zuteilung wird mit Datum, Rolle, Person, Bestätigungstyp und sämtlichen Regelgründen aufgeführt.
6. Ohne ausdrückliche Bestätigung bleibt die Übernahme gesperrt.
7. Vor dem Schreiben werden Fingerprint, freie Felder und sämtliche Regeln erneut geprüft.
8. Jede bestätigte rote Zelle wird einzeln im Override-Protokoll dokumentiert.