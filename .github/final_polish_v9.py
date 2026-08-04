from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one patch anchor, found {count}: {old[:100]!r}")
    target.write_text(content.replace(old, new), encoding="utf-8")


replace(
    "workers/autoplan-v9/src/index.ts",
    '''      await env.AUTO_PLAN_WORKFLOW.get(runId).terminate().catch(() => undefined);
''',
    '''      const workflow = await env.AUTO_PLAN_WORKFLOW.get(runId);
      await workflow.terminate().catch(() => undefined);
''',
)

replace(
    "js/auto-plan-studio-v9.js",
    '''<option value="0">0 % · Optimum beweisen</option>''',
    '''<option value="0">0 % · Modelloptimum beweisen</option>''',
)
replace(
    "js/auto-plan-studio-v9.js",
    '''${esc(status === 'OPTIMAL' ? 'Globaler Nachweis abgeschlossen' : status === 'INFEASIBLE' ? 'Unlösbarkeit nachgewiesen' : status === 'FEASIBLE' ? 'Beste gefundene Lösung' : 'Lokaler, vollständig auditierter Fallback')}''',
    '''${esc(status === 'OPTIMAL' ? 'Optimum im kompilierten v9-Modell bewiesen' : status === 'INFEASIBLE' ? 'Unlösbarkeit im kompilierten v9-Modell bewiesen' : status === 'FEASIBLE' ? 'Beste gefundene Modelllösung' : 'Lokaler, vollständig auditierter Fallback')}''',
)
replace(
    "js/auto-plan-studio-v9.js",
    '''Mathematische Machbarkeit · lexikografische Zielstufen''',
    '''Modell-Machbarkeit · lexikografische Zielstufen''',
)

readme = ROOT / "README.md"
text = readme.read_text(encoding="utf-8")
text = text.replace("für das kompilierten v9-Modell", "für das kompilierte v9-Modell")
text = text.replace("auf das kompilierten v9-Modell", "auf das kompilierte v9-Modell")
readme.write_text(text, encoding="utf-8")

with (ROOT / "tests/auto-plan-v9.test.js").open("a", encoding="utf-8") as handle:
    handle.write(
        '''\n\ntest('Studio grenzt CP-SAT-Nachweise auf das kompilierte v9-Modell ein', async () => {
  const studio = await source('../js/auto-plan-studio-v9.js');
  assert.match(studio, /Modelloptimum beweisen/);
  assert.match(studio, /Optimum im kompilierten v9-Modell bewiesen/);
  assert.match(studio, /Unlösbarkeit im kompilierten v9-Modell bewiesen/);
  assert.doesNotMatch(studio, /Globaler Nachweis abgeschlossen/);
});
'''
    )

(ROOT / ".github/final_polish_v9.py").unlink()
