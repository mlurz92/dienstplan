from __future__ import annotations

from collections.abc import Iterable
from datetime import date, timedelta
from itertools import pairwise
from threading import Event

from app.schemas import (
    Assignment,
    Candidate,
    Limits,
    RelaxationPolicy,
    Slot,
    SolverConfig,
    SolverSnapshot,
    Staff,
)
from app.solver import solve_snapshot
from app.solver_core import build_model, raw_score


def dates_for_february() -> list[str]:
    start = date(2026, 2, 1)
    return [(start + timedelta(days=offset)).isoformat() for offset in range(28)]


def candidate(staff_id: str, level: str = "green") -> Candidate:
    return Candidate(
        staffId=staff_id,
        level=level,
        canSelect=True,
        confirmationType="standard" if level == "red" else None,
        recommendationScore=0,
        recommendationVector=[],
        reasons=[f"{level} test candidate"],
    )


def snapshot(
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
    slots: list[Slot] = []
    for day_index, day in enumerate(dates):
        for role in ("bd", "hg"):
            candidates = []
            for staff_id in ids:
                level = "red" if red_hg_first_day and day_index == 0 and role == "hg" else "green"
                candidates.append(candidate(staff_id, level))
            slots.append(Slot(dateIso=day, role=role, candidates=candidates))
    return SolverSnapshot(
        schemaVersion=9,
        rulesetVersion="5.0.0-test",
        generatedAt="2026-08-04T00:00:00Z",
        year=2026,
        month=2,
        dates=dates,
        staff=people,
        slots=slots,
        relations=[],
        fixedAssignments=[],
        baseline={"year": 2026, "month": 2, "days": {}},
        config=SolverConfig(
            mode="quick",
            goal="new-plan",
            timeBudgetMs=10_000,
            allowRedFallback=allow_red,
            alternatives=1,
            targetGapPermille=100,
            deterministic=True,
            exactLns=False,
            seed=17,
            relaxationPolicy=RelaxationPolicy(hardMaximum=relax_hard_maximum),
        ),
        baselineFingerprint="baseline:test",
        configFingerprint="config:test",
        requestFingerprint=(
            f"request:{ids}:{allow_red}:{red_hg_first_day}:{max_bd}:{relax_hard_maximum}"
        ),
    )


def assert_schedule_invariants(assignments: list[Assignment]) -> None:
    by_slot = {(item.dateIso, item.role): item.staffId for item in assignments}
    assert len(by_slot) == 56
    dates = dates_for_february()
    for day in dates:
        assert by_slot[(day, "bd")] != by_slot[(day, "hg")]
    for left, right in pairwise(dates):
        assert by_slot[(left, "bd")] != by_slot[(right, "bd")]
        if date.fromisoformat(left).isoweekday() in {1, 2, 3, 4}:
            assert by_slot[(left, "hg")] != by_slot[(right, "bd")]


def test_strict_model_finds_complete_valid_schedule() -> None:
    events: list[dict[str, object]] = []
    result = solve_snapshot(snapshot(), events.append, Event())
    assert result.status in {"OPTIMAL", "FEASIBLE"}
    assert len(result.assignments) == 56
    assert_schedule_invariants(result.assignments)
    assert any(event.get("stage") == "strict-feasibility" for event in events)
    assert result.metadata.lexicographicStages


def test_infeasible_model_returns_conflict_core() -> None:
    result = solve_snapshot(snapshot(staff_ids=("only",)), lambda _event: None, Event())
    assert result.status == "INFEASIBLE"
    assert result.assignments == []
    assert result.conflictCore
    assert any(
        item.id.startswith("NO_SAME_DAY_BD_HG") or item.id.startswith("SLOT_COVERAGE")
        for item in result.conflictCore
    )


def test_red_fallback_is_separate_from_strict_search() -> None:
    result = solve_snapshot(
        snapshot(allow_red=True, red_hg_first_day=True),
        lambda _event: None,
        Event(),
    )
    assert result.status in {"OPTIMAL", "FEASIBLE"}
    assert len(result.assignments) == 56
    assert_schedule_invariants(result.assignments)


def test_cancelled_run_returns_a_defined_solver_status() -> None:
    cancelled = Event()
    cancelled.set()
    result = solve_snapshot(snapshot(), lambda _event: None, cancelled)
    assert result.status in {"UNKNOWN", "FEASIBLE", "OPTIMAL", "INFEASIBLE"}


def test_hard_maximum_is_relaxed_only_by_explicit_policy() -> None:
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


def test_exact_lns_acceptance_uses_the_same_weighted_load_as_the_cp_sat_model() -> None:
    context = build_model(snapshot(), allow_red=False)
    assignments = [
        Assignment(dateIso="2026-02-07", role="bd", staffId="a"),
        Assignment(dateIso="2026-02-02", role="hg", staffId="b"),
    ]
    score = raw_score(context, assignments)
    assert score[6] == 135
    assert score[7] == 1
