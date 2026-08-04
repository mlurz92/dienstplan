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
    "solver/app/solver_core.py",
    '''    bd_counts: defaultdict[str, int] = defaultdict(int)
    total_counts: defaultdict[str, int] = defaultdict(int)
    weekend_counts: defaultdict[str, int] = defaultdict(int)
''',
    '''    bd_counts: defaultdict[str, int] = defaultdict(int)
    weighted_loads: defaultdict[str, int] = defaultdict(int)
    weekend_counts: defaultdict[str, int] = defaultdict(int)
''',
)

replace(
    "solver/app/solver_core.py",
    '''    for (date_iso, role), staff_id in {**context.fixed, **selected}.items():
        total_counts[staff_id] += 1
        bd_counts[staff_id] += int(role == "bd")
        weekend_counts[staff_id] += int(date.fromisoformat(date_iso).isoweekday() in {5, 6, 7})
    deviations = [abs(bd_counts[item.id] - item.bdTarget) for item in context.snapshot.staff]
    totals = [total_counts[item.id] for item in context.snapshot.staff]
    weekends = [weekend_counts[item.id] for item in context.snapshot.staff]
''',
    '''    for (date_iso, role), staff_id in {**context.fixed, **selected}.items():
        is_weekend = date.fromisoformat(date_iso).isoweekday() in {5, 6, 7}
        weighted_loads[staff_id] += LOAD_WEIGHT[role] + (
            WEEKEND_EXTRA[role] if is_weekend else 0
        )
        bd_counts[staff_id] += int(role == "bd")
        weekend_counts[staff_id] += int(is_weekend)
    deviations = [abs(bd_counts[item.id] - item.bdTarget) for item in context.snapshot.staff]
    loads = [weighted_loads[item.id] for item in context.snapshot.staff]
    weekends = [weekend_counts[item.id] for item in context.snapshot.staff]
''',
)

replace(
    "solver/app/solver_core.py",
    '''        max(totals, default=0) - min(totals, default=0),
''',
    '''        max(loads, default=0) - min(loads, default=0),
''',
)

replace(
    "solver/tests/test_solver.py",
    '''from app.solver import solve_snapshot
''',
    '''from app.solver import solve_snapshot
from app.solver_core import build_model, raw_score
''',
)

with (ROOT / "solver/tests/test_solver.py").open("a", encoding="utf-8") as handle:
    handle.write(
        '''\n\ndef test_exact_lns_acceptance_uses_the_same_weighted_load_as_the_cp_sat_model() -> None:
    context = build_model(snapshot(), allow_red=False)
    assignments = [
        Assignment(dateIso="2026-02-07", role="bd", staffId="a"),
        Assignment(dateIso="2026-02-02", role="hg", staffId="b"),
    ]
    score = raw_score(context, assignments)
    assert score[6] == 135
    assert score[7] == 1
'''
    )

(ROOT / ".github/patch_objective_score_v9.py").unlink()
