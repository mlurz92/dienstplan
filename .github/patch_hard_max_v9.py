from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace(path: str, old: str, new: str) -> None:
    target = ROOT / path
    content = target.read_text(encoding="utf-8")
    if content.count(old) != 1:
        raise RuntimeError(f"{path}: patch anchor count is {content.count(old)}, expected 1")
    target.write_text(content.replace(old, new), encoding="utf-8")


replace(
    "solver/app/solver_core.py",
    '''        for label, cap, expression in (
            ("BD", person.limits.maxBd, bd_count),
            ("HG", person.limits.maxHg, hg_count),
            ("TOTAL", person.limits.maxTotal, total_count),
        ):
            if cap is None:
                continue
            assumption = add_assumption(
                model,
                assumption_vars,
                assumption_descriptions,
                ConflictItem(
                    id=f"PERSON_MAX_{label}:{person.id}:{cap}",
                    title=f"{label}-Obergrenze {cap}",
                    detail=person.short or person.name or person.id,
                ),
            )
            model.add(expression <= cap).only_enforce_if(assumption)
''',
    '''        for label, cap, expression in (
            ("BD", person.limits.maxBd, bd_count),
            ("HG", person.limits.maxHg, hg_count),
            ("TOTAL", person.limits.maxTotal, total_count),
        ):
            if cap is None:
                continue
            if allow_red and snapshot.config.relaxationPolicy.hardMaximum:
                maximum_excess = len(snapshot.dates) * (2 if label == "TOTAL" else 1)
                excess = model.new_int_var(
                    0,
                    maximum_excess,
                    f"{label.casefold()}_maximum_excess_{person.id}",
                )
                model.add_max_equality(excess, [0, expression - cap])
                red_terms.append(excess)
                continue
            assumption = add_assumption(
                model,
                assumption_vars,
                assumption_descriptions,
                ConflictItem(
                    id=f"PERSON_MAX_{label}:{person.id}:{cap}",
                    title=f"{label}-Obergrenze {cap}",
                    detail=person.short or person.name or person.id,
                ),
            )
            model.add(expression <= cap).only_enforce_if(assumption)
''',
)

replace(
    "solver/tests/test_solver.py",
    '''from app.schemas import Assignment, Candidate, Slot, SolverConfig, SolverSnapshot, Staff
''',
    '''from app.schemas import (
    Assignment,
    Candidate,
    Limits,
    RelaxationPolicy,
    Slot,
    SolverConfig,
    SolverSnapshot,
    Staff,
)
''',
)

replace(
    "solver/tests/test_solver.py",
    '''def snapshot(
    *,
    staff_ids: Iterable[str] = ("a", "b", "c"),
    allow_red: bool = False,
    red_hg_first_day: bool = False,
) -> SolverSnapshot:
    ids = tuple(staff_ids)
    dates = dates_for_february()
    people = [Staff(id=staff_id, name=staff_id, short=staff_id, bdTarget=9) for staff_id in ids]
''',
    '''def snapshot(
    *,
    staff_ids: Iterable[str] = ("a", "b", "c"),
    allow_red: bool = False,
    red_hg_first_day: bool = False,
    max_bd: int | None = None,
    relax_hard_maximum: bool = False,
) -> SolverSnapshot:
    ids = tuple(staff_ids)
    dates = dates_for_february()
    people = [
        Staff(
            id=staff_id,
            name=staff_id,
            short=staff_id,
            bdTarget=9,
            limits=Limits(maxBd=max_bd),
        )
        for staff_id in ids
    ]
''',
)

replace(
    "solver/tests/test_solver.py",
    '''            exactLns=False,
            seed=17,
        ),
''',
    '''            exactLns=False,
            seed=17,
            relaxationPolicy=RelaxationPolicy(hardMaximum=relax_hard_maximum),
        ),
''',
)

with (ROOT / "solver/tests/test_solver.py").open("a", encoding="utf-8") as handle:
    handle.write(
        '''\n\ndef test_hard_maximum_is_relaxed_only_by_explicit_policy() -> None:
    blocked = solve_snapshot(
        snapshot(allow_red=True, max_bd=0, relax_hard_maximum=False),
        lambda _event: None,
        Event(),
    )
    assert blocked.status == "INFEASIBLE"

    relaxed = solve_snapshot(
        snapshot(allow_red=True, max_bd=0, relax_hard_maximum=True),
        lambda _event: None,
        Event(),
    )
    assert relaxed.status in {"OPTIMAL", "FEASIBLE"}
    assert len(relaxed.assignments) == 56
    assert_schedule_invariants(relaxed.assignments)
    assert relaxed.metadata.lexicographicStages[0].id == "minimal-relaxation"
    assert (relaxed.metadata.lexicographicStages[0].value or 0) > 0
'''
    )

# Self-delete after a successful one-time patch.
(ROOT / ".github/patch_hard_max_v9.py").unlink()
