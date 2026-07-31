# Temporäre Bughunt-Prüfmatrix

Diese Datei wird nach erfolgreicher Verifikation zusammen mit dem Patchmechanismus entfernt.

Geprüfte und behobene Fehlerklassen:

1. Speichern eines sauberen Zwischenmonats bei schneller Navigation.
2. Rückwärtsüberschreiben eines neueren Monats durch einen verspäteten älteren PUT.
3. Verlust nicht synchronisierter lokaler Änderungen nach Browserneustart oder Serverreload.
4. Fehlende Nachverfolgung lokal importierter Monate und globaler Bootstrapdaten.
5. Serverexport ohne die neuesten lokalen Dirty-Monate.
6. Excel-Merge gegen ein leeres, nie geladenes Monatsgerüst.
7. Falsche AA-Klassifikation nicht planbarer Sonderrollen.
8. Nicht wirksames hartes Monatsmaximum von null.
9. Reihenfolgeabhängige BD–FZA–BD-Begründung.
10. Nicht gemeldete inaktive oder nicht planbare bestehende Besetzungen.
11. Nicht gemeldete inkonsistente beziehungsweise offene zweite RBN.
12. Leerer Jahreswert bei Navigation über die initiale Auswahlliste hinaus.
13. HTTP 400 statt 500 bei Infrastrukturfehlern der Pages Functions.
14. Unstrukturierte 500-Antworten bei fehlendem KV-Binding.
