from __future__ import annotations

import argparse
import hashlib
import json
import platform
import statistics
import sys
import time
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from threading import Event
from typing import Any

from app.schemas import (
    Assignment,
    Candidate,
    Level,
    Slot,
    SolverConfig,
    SolverSnapshot,
    SolverStatus,
    Staff,
    WarmStart,
)
from app.solver import solve_snapshot

VALID_STATUSES: frozenset[SolverStatus] = frozenset(
    {"OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN"}
)
SOLUTION_STATUSES: frozenset[SolverStatus] = frozenset({"OPTIMAL", "FEASIBLE"})


@dataclass(frozen=True, slots=True)
class BenchmarkCase:
    name: str
    snapshot: SolverSnapshot
    expected_statuses: frozenset[SolverStatus] | None = None
    expected_assignments: int | None = None


def month_dates(year: int = 2026, month: int = 2) -> list[str]:
    start = date(year, month, 1)
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return [
        (start + timedelta(days=offset)).isoformat()
        for offset in range((next_month - start).days)
    ]


def benchmark_candidate(staff_id: str, level: Level = "green") -> Candidate:
    return Candidate(
        staffId=staff_id,
        level=level,
        canSelect=True,
        confirmationType="standard" if level == "red" else None,
        recommendationScore=0,
        recommendationVector=[],
        reasons=[f"{level} benchmark candidate"],
    )


def deterministic_warm_start(dates: Iterable[str], staff_ids: tuple[str, ...]) -> WarmStart:
    assignments: list[Assignment] = []
    for index, date_iso in enumerate(dates):
        assignments.extend(
            (
                Assignment(dateIso=date_iso, role="bd", staffId=staff_ids[index % len(staff_ids)]),
                Assignment(dateIso=date_iso, role="hg", staffId=staff_ids[(index + 2) % len(staff_ids)]),
            )
        )
    return WarmStart(source="benchmark-baseline", assignments=assignments)


def synthetic_snapshot(
    *,
    name: str,
    staff_ids: tuple[str, ...],
    allow_red: bool = False,
    red_first_hg: bool = False,
    goal: str = "new-plan",
    warm_start: bool = False,
) -> SolverSnapshot:
    dates = month_dates()
    target = round(len(dates) / max(1, len(staff_ids)))
    people = [
        Staff(id=staff_id, name=staff_id, short=staff_id, bdTarget=target)
        for staff_id in staff_ids
    ]
    slots: list[Slot] = []
    for day_index, date_iso in enumerate(dates):
        for role in ("bd", "hg"):
            level: Level = "red" if red_first_hg and day_index == 0 and role == "hg" else "green"
            slots.append(
                Slot(
                    dateIso=date_iso,
                    role=role,
                    candidates=[benchmark_candidate(staff_id, level) for staff_id in staff_ids],
                )
            )
    warm_starts = (
        [deterministic_warm_start(dates, staff_ids)]
        if warm_start and len(staff_ids) >= 3
        else []
    )
    return SolverSnapshot(
        schemaVersion=9,
        rulesetVersion="5.0.0-benchmark",
        generatedAt="2026-08-04T00:00:00Z",
        year=2026,
        month=2,
        dates=dates,
        staff=people,
        slots=slots,
        relations=[],
        fixedAssignments=[],
        warmStarts=warm_starts,
        baseline={"year": 2026, "month": 2, "days": {}},
        config=SolverConfig(
            mode="quick",
            goal=goal,  # type: ignore[arg-type]
            timeBudgetMs=10_000,
            allowRedFallback=allow_red,
            alternatives=1,
            targetGapPermille=100,
            deterministic=True,
            exactLns=False,
            seed=17,
        ),
        baselineFingerprint=f"benchmark:baseline:{name}",
        configFingerprint=f"benchmark:config:{name}",
        requestFingerprint=f"benchmark:request:{name}",
    )


def synthetic_cases() -> list[BenchmarkCase]:
    return [
        BenchmarkCase(
            name="strict-feasible",
            snapshot=synthetic_snapshot(name="strict-feasible", staff_ids=("a", "b", "c")),
            expected_statuses=SOLUTION_STATUSES,
            expected_assignments=56,
        ),
        BenchmarkCase(
            name="minimal-red-fallback",
            snapshot=synthetic_snapshot(
                name="minimal-red-fallback",
                staff_ids=("a", "b", "c"),
                allow_red=True,
                red_first_hg=True,
            ),
            expected_statuses=SOLUTION_STATUSES,
            expected_assignments=56,
        ),
        BenchmarkCase(
            name="provably-infeasible",
            snapshot=synthetic_snapshot(name="provably-infeasible", staff_ids=("only",)),
            expected_statuses=frozenset({"INFEASIBLE"}),
            expected_assignments=0,
        ),
        BenchmarkCase(
            name="minimal-change-warm-start",
            snapshot=synthetic_snapshot(
                name="minimal-change-warm-start",
                staff_ids=("a", "b", "c", "d"),
                goal="minimal-change",
                warm_start=True,
            ),
            expected_statuses=SOLUTION_STATUSES,
            expected_assignments=56,
        ),
    ]


def assignment_fingerprint(assignments: Iterable[Assignment]) -> str:
    payload = "\n".join(
        f"{item.dateIso}|{item.role}|{item.staffId}"
        for item in sorted(assignments, key=lambda value: (value.dateIso, value.role, value.staffId))
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def first_solution_ms(events: list[dict[str, object]]) -> int | None:
    for event in events:
        status = str(event.get("solverStatus") or event.get("status") or "").upper()
        if status in SOLUTION_STATUSES:
            value = event.get("wallTimeMs")
            if isinstance(value, (int, float)):
                return max(0, round(value))
    return None


def stage_vector(snapshot_result: Any) -> list[dict[str, object]]:
    return [
        {
            "id": stage.id,
            "status": stage.status,
            "value": stage.value,
            "bestBound": stage.bestBound,
            "relativeGap": stage.relativeGap,
            "wallTimeMs": stage.wallTimeMs,
        }
        for stage in snapshot_result.metadata.lexicographicStages
    ]


def run_once(case: BenchmarkCase) -> dict[str, object]:
    events: list[dict[str, object]] = []
    started = time.perf_counter()
    result = solve_snapshot(case.snapshot.model_copy(deep=True), events.append, Event())
    elapsed_ms = round((time.perf_counter() - started) * 1000)
    if result.status not in VALID_STATUSES:
        raise AssertionError(f"{case.name}: unknown solver status {result.status}")
    if case.expected_statuses is not None and result.status not in case.expected_statuses:
        raise AssertionError(
            f"{case.name}: expected {sorted(case.expected_statuses)}, got {result.status}"
        )
    if case.expected_assignments is not None and len(result.assignments) != case.expected_assignments:
        raise AssertionError(
            f"{case.name}: expected {case.expected_assignments} assignments, "
            f"got {len(result.assignments)}"
        )
    metadata = result.metadata
    return {
        "status": result.status,
        "assignments": len(result.assignments),
        "assignmentFingerprint": assignment_fingerprint(result.assignments),
        "elapsedMs": elapsed_ms,
        "firstSolutionMs": first_solution_ms(events),
        "objectiveValue": metadata.objectiveValue,
        "bestBound": metadata.bestBound,
        "relativeGap": metadata.relativeGap,
        "branches": metadata.branches,
        "conflicts": metadata.conflicts,
        "deterministicTime": metadata.deterministicTime,
        "solverWallTimeMs": metadata.wallTimeMs,
        "lexicographicStages": stage_vector(result),
        "exactLns": metadata.exactLns.model_dump(mode="json"),
        "alternatives": len(result.alternatives),
        "conflictCoreSize": len(result.conflictCore),
        "relaxationSuggestions": len(result.relaxationSuggestions),
        "eventCount": len(events),
        "solverVersion": result.solverVersion,
    }


def summarize(case: BenchmarkCase, repetitions: int) -> dict[str, object]:
    runs = [run_once(case) for _ in range(repetitions)]
    solution_fingerprints = {
        str(run["assignmentFingerprint"])
        for run in runs
        if run["status"] in SOLUTION_STATUSES
    }
    if case.snapshot.config.deterministic and len(solution_fingerprints) > 1:
        raise AssertionError(
            f"{case.name}: deterministic repetitions produced different assignments"
        )
    elapsed = [int(run["elapsedMs"]) for run in runs]
    return {
        "name": case.name,
        "requestFingerprint": case.snapshot.requestFingerprint,
        "repetitions": repetitions,
        "deterministic": case.snapshot.config.deterministic,
        "reproducibleAssignments": len(solution_fingerprints) <= 1,
        "elapsedMs": {
            "minimum": min(elapsed),
            "median": statistics.median(elapsed),
            "maximum": max(elapsed),
        },
        "runs": runs,
    }


def load_snapshot(path: Path) -> BenchmarkCase:
    snapshot = SolverSnapshot.model_validate_json(path.read_text(encoding="utf-8"))
    return BenchmarkCase(name=f"snapshot:{path.name}", snapshot=snapshot)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reproducible correctness and performance harness for Auto-Plan v9."
    )
    parser.add_argument(
        "--smoke",
        action="store_true",
        help="Run the deterministic synthetic CI matrix.",
    )
    parser.add_argument(
        "--snapshot",
        action="append",
        type=Path,
        default=[],
        help="Add a real exported SolverSnapshot JSON file; repeatable.",
    )
    parser.add_argument(
        "--repetitions",
        type=int,
        default=2,
        help="Number of repetitions per case (default: 2).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("solver/benchmark-results/v9-benchmark.json"),
        help="JSON report path.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    repetitions = max(1, min(10, int(args.repetitions)))
    cases: list[BenchmarkCase] = synthetic_cases() if args.smoke or not args.snapshot else []
    cases.extend(load_snapshot(path) for path in args.snapshot)
    if not cases:
        raise SystemExit("No benchmark cases selected.")

    started = time.perf_counter()
    report: dict[str, object] = {
        "schemaVersion": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "machine": platform.machine(),
            "processor": platform.processor(),
        },
        "cases": [summarize(case, repetitions) for case in cases],
    }
    report["totalElapsedMs"] = round((time.perf_counter() - started) * 1000)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, sort_keys=True), encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
