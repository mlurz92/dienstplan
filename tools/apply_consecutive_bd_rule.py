from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD_TOKEN = "20260731.1"
NEW_TOKEN = "20260731.2"


def replace_once(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "js/rules-evaluation.js",
    "if (diff === 1) push('yellow', 'BD bereits am Vortag');",
    "if (diff === 1) push('red', 'BD bereits am Vortag');",
)
replace_once(
    "js/rules-evaluation.js",
    "if (diffForward === 1) push('yellow', 'BD bereits am Folgetag');",
    "if (diffForward === 1) push('red', 'BD bereits am Folgetag');",
)

replace_once("README.md", "- eigener BD am Vortag: gelb;", "- eigener BD am Vortag: **rot**;")
replace_once("README.md", "- eigener BD am Folgetag: gelb;", "- eigener BD am Folgetag: **rot**;")
replace_once(
    "README.md",
    "Die beidseitige Prüfung verhindert eine Abhängigkeit von der Reihenfolge, in der zwei Dienste eingetragen werden.",
    "Unmittelbar aufeinanderfolgende BD derselben Person sind damit unabhängig von Wochentag, Monatsgrenze oder Eingabereihenfolge ausgeschlossen. Die beidseitige Prüfung verhindert eine Abhängigkeit von der Reihenfolge, in der zwei Dienste eingetragen werden.",
)

replace_once(
    "Eignungsregeln.txt",
    "Regeln und Kriterien für manuelle Kandidatenempfehlungen in DienstplanRAD (v4.4)",
    "Regeln und Kriterien für manuelle Kandidatenempfehlungen in DienstplanRAD (v4.5)",
)
replace_once(
    "Eignungsregeln.txt",
    "- Ein eigener weiterer BD mit weniger als drei dienstfreien Tagen Abstand erzeugt lediglich einen gelben Hinweis, keinen automatischen roten oder orangefarbenen Konflikt. Die Prüfung erfolgt symmetrisch zum vorherigen und zum folgenden BD.",
    "- Ein eigener BD am unmittelbar vorhergehenden oder folgenden Kalendertag ist ein roter Konflikt. Ein Abstand von zwei oder drei Kalendertagen erzeugt weiterhin lediglich einen gelben Hinweis. Die Prüfung erfolgt symmetrisch zum vorherigen und zum folgenden BD sowie monatsübergreifend.",
)

rule_matrix = ROOT / "tests/rule-matrix.test.js"
text = rule_matrix.read_text(encoding="utf-8")
marker = "test('Invariante Selbstkonsistenz: eine bestehende Einteilung wird wie ein Vorschlag bewertet', () => {"
block = """test('Unmittelbar aufeinanderfolgende BD sind über So–Mo in beiden Eingabereihenfolgen rot', () => {
  const vorwaerts = zustand();
  setAssignment(monat(vorwaerts, 2026, 7), '2026-07-05', 'bd', 'lurz'); // Sonntag
  const montag = bewerte(vorwaerts, '2026-07-06', 'bd', 'lurz');
  assert.equal(montag.level, 'red');
  assert.ok(montag.reasons.includes('BD bereits am Vortag'));

  const rueckwaerts = zustand();
  setAssignment(monat(rueckwaerts, 2026, 7), '2026-07-06', 'bd', 'lurz'); // Montag
  const sonntag = bewerte(rueckwaerts, '2026-07-05', 'bd', 'lurz');
  assert.equal(sonntag.level, 'red');
  assert.ok(sonntag.reasons.includes('BD bereits am Folgetag'));
});

"""
if text.count(marker) != 1:
    raise SystemExit(f"tests/rule-matrix.test.js: expected one insertion marker, found {text.count(marker)}")
rule_matrix.write_text(text.replace(marker, block + marker, 1), encoding="utf-8")

for file in ROOT.rglob("*"):
    if not file.is_file() or any(part in {".git", "node_modules"} for part in file.parts):
        continue
    if file.suffix.lower() not in {".js", ".html", ".md", ".txt"}:
        continue
    content = file.read_text(encoding="utf-8")
    if OLD_TOKEN in content:
        file.write_text(content.replace(OLD_TOKEN, NEW_TOKEN), encoding="utf-8")
