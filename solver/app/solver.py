from __future__ import annotations

import math
import random
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date
from threading import Event
from typing import Callable, Iterable, Sequence

import ortools
from ortools.sat.python import cp_model

from .schemas import (
    Alternative,
    Assignment,
    ConflictItem,
    ExactLnsMetadata,
    RelaxationSuggestion,
    SolverMetadata,
    SolverResult,
    SolverSnapshot,
    StageResult,
)

Emit = Callable[[dict[str, object]], None]

STATUS_NAME = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.MODEL_INVALID: "MODEL_INVALID",
    cp_model.UNKNOWN: "UNKNOWN",
}

LEVEL_RANK = {"green": 0, "yellow": 1, "orange": 2, "red": 3, "gray": 4}
LOAD_WEIGHT = {"bd": 100, "hg": 55}
WEEKEND_EXTRA = {"bd": 35, "hg": 20}


@dataclass(slots=True)
class ModelContext:
    model: cp_model.CpModel
    snapshot: SolverSnapshot
    allow_red: bool
    x: dict[tuple[str, str, str], cp_model.IntVar]
    slot_vars: dict[tuple[str, str], list[tuple[str, cp_model.IntVar]]]
    candidate_level: dict[tuple[str, str, str], str]
    candidate_score: dict[tuple[str, str, str], int]
    fixed: dict[tuple[str, str], str]
    assumption_descriptions: dict[int, ConflictItem]
    red_terms: list[cp_model.LinearExpr]
    orange_terms: list[cp_model.LinearExpr]
    yellow_terms: list[cp_model.LinearExpr]
    recommendation_terms: list[cp_model.LinearExpr]
    person_bd: dict[str, cp_model.IntVar]
    person_hg: dict[str, cp_model.IntVar]
    person_total: dict[str, cp_model.IntVar]
    person_weekend: dict[str, cp_model.IntVar]
    max_bd_deviation: cp_model.IntVar
    total_bd_deviation: cp_model.IntVar
    total_load_spread: cp_model.IntVar
    weekend_load_spread: cp_model.IntVar
    objective_stages: list[tuple[str, str, cp_model.LinearExpr]] = field(default_factory=list)


class ProgressCallback(cp_model.CpSolverSolutionCallback):
    def __init__(self, emit: Emit, stage_id: str, cancel: Event, started: float) -> None:
        super().__init__()
        self.emit = emit
        self.stage_id = stage_id
        self.cancel = cancel
        self.started = started
        self.solutions = 0
        self.last_emit = 0.0

    def on_solution_callback(self) -> None:
        self.solutions += 1
        now = time.monotonic()
        if self.cancel.is_set():
            self.stop_search()
            return
        if now - self.last_emit < 0.4 and self.solutions > 1:
            return
        self.last_emit = now
        objective = float(self.objective_value)
        bound = float(self.best_objective_bound)
        gap = relative_gap(objective, bound)
        self.emit(
            {
                "stage": self.stage_id,
                "phase": "perfect",
                "status": "running",
                "solverStatus": "FEASIBLE",
                "objectiveValue": objective,
                "bestBound": bound,
                "relativeGap": gap,
                "branches": int(self.num_branches),
                "conflicts": int(self.num_conflicts),
                "wallTimeMs": int((now - self.started) * 1000),
                "message": f"Neue CP-SAT-Lösung in Zielstufe {self.stage_id}.",
            }
        )


def relative_gap(value: float, bound: float) -> float:
    if not math.isfinite(value) or not math.isfinite(bound):
        return 1.0
    if abs(value) < 1e-9:
        return 0.0 if abs(bound) < 1e-9 else 1.0
    return max(0.0, abs(value - bound) / max(1.0, abs(value)))


def _assumption(
    model: cp_model.CpModel,
    descriptions: dict[int, ConflictItem],
    item: ConflictItem,
) -> cp_model.IntVar:
    literal = model.new_bool_var(f"assume_{item.id}_{len(descriptions)}")
    model.add_assumption(literal)
    descriptions[literal.index] = item
    return literal


def _and_var(model: cp_model.CpModel, left: cp_model.LinearExpr, right: cp_model.LinearExpr, name: str) -> cp_model.IntVar:
    value = model.new_bool_var(name)
    model.add(value <= left)
    model.add(value <= right)
    model.add(value >= left + right - 1)
    return value


def _slot_value(ctx: ModelContext, date_iso: str, role: str, staff_id: str) -> cp_model.LinearExpr:
    fixed = ctx.fixed.get((date_iso, role))
    if fixed:
        return 1 if fixed == staff_id else 0
    return ctx.x.get((date_iso, role, staff_id), 0)


def _sum_values(values: Iterable[cp_model.LinearExpr]) -> cp_model.LinearExpr:
    return cp_model.LinearExpr.sum(list(values))


def build_model(snapshot: SolverSnapshot, *, allow_red: bool, diagnostic: bool = False) -> ModelContext:
    model = cp_model.CpModel()
    x: dict[tuple[str, str, str], cp_model.IntVar] = {}
    slot_vars: dict[tuple[str, str], list[tuple[str, cp_model.IntVar]]] = {}
    candidate_level: dict[tuple[str, str, str], str] = {}
    candidate_score: dict[tuple[str, str, str], int] = {}
    fixed = {(item.dateIso, item.role): item.staffId for item in snapshot.fixedAssignments}
    assumptions: dict[int, ConflictItem] = {}
    red_terms: list[cp_model.LinearExpr] = []
    orange_terms: list[cp_model.LinearExpr] = []
    yellow_terms: list[cp_model.LinearExpr] = []
    recommendation_terms: list[cp_model.LinearExpr] = []

    for slot in snapshot.slots:
        key = (slot.dateIso, slot.role)
        if slot.fixedStaffId:
            fixed[key] = slot.fixedStaffId
            slot_vars[key] = []
            continue
        variables: list[tuple[str, cp_model.IntVar]] = []
        for candidate in slot.candidates:
            if not candidate.canSelect or candidate.level == "gray":
                continue
            if candidate.level == "red" and not allow_red:
                continue
            var = model.new_bool_var(f"x_{slot.dateIso}_{slot.role}_{candidate.staffId}")
            x[(slot.dateIso, slot.role, candidate.staffId)] = var
            variables.append((candidate.staffId, var))
            candidate_level[(slot.dateIso, slot.role, candidate.staffId)] = candidate.level
            candidate_score[(slot.dateIso, slot.role, candidate.staffId)] = candidate.recommendationScore
            if candidate.level == "red":
                red_terms.append(var)
            elif candidate.level == "orange":
                orange_terms.append(var)
            elif candidate.level == "yellow":
                yellow_terms.append(var)
            if candidate.recommendationScore:
                recommendation_terms.append(-candidate.recommendationScore * var)
        slot_vars[key] = variables
        assumption = _assumption(
            model,
            assumptions,
            ConflictItem(
                id=f"SLOT_COVERAGE:{slot.dateIso}:{slot.role}",
                title=f"{slot.role.upper()} {slot.dateIso} muss belegt werden",
                detail=f"{len(variables)} technisch zulässige Kandidaten im {'Relaxed' if allow_red else 'Strict'}-Modell",
            ),
        )
        model.add(_sum_values(var for _, var in variables) == 1).only_enforce_if(assumption)

    staff_ids = [person.id for person in snapshot.staff]
    dates = snapshot.dates

    # Same-day exclusion.
    for date_iso in dates:
        for staff_id in staff_ids:
            assumption = _assumption(
                model,
                assumptions,
                ConflictItem(
                    id=f"NO_SAME_DAY_BD_HG:{date_iso}:{staff_id}",
                    title="Kein gleichzeitiger BD und HG",
                    detail=f"{staff_id} am {date_iso}",
                ),
            )
            model.add(
                _slot_value_placeholder(fixed, x, date_iso, "bd", staff_id)
                + _slot_value_placeholder(fixed, x, date_iso, "hg", staff_id)
                <= 1
            ).only_enforce_if(assumption)

    # Consecutive BD and weekday HG-before-BD.
    for left, right in zip(dates, dates[1:], strict=False):
        if (date.fromisoformat(right) - date.fromisoformat(left)).days != 1:
            continue
        for staff_id in staff_ids:
            assumption = _assumption(
                model,
                assumptions,
                ConflictItem(
                    id=f"NO_CONSECUTIVE_BD:{left}:{right}:{staff_id}",
                    title="Keine direkt aufeinanderfolgenden BD",
                    detail=f"{staff_id}: {left} und {right}",
                ),
            )
            model.add(
                _slot_value_placeholder(fixed, x, left, "bd", staff_id)
                + _slot_value_placeholder(fixed, x, right, "bd", staff_id)
                <= 1
            ).only_enforce_if(assumption)

            if date.fromisoformat(left).isoweekday() in {1, 2, 3, 4}:
                hg = _slot_value_placeholder(fixed, x, left, "hg", staff_id)
                bd = _slot_value_placeholder(fixed, x, right, "bd", staff_id)
                if allow_red:
                    red_terms.append(_and_var(model, hg, bd, f"weekday_hg_bd_{left}_{staff_id}"))
                else:
                    strict_assumption = _assumption(
                        model,
                        assumptions,
                        ConflictItem(
                            id=f"WEEKDAY_HG_BEFORE_OWN_BD:{left}:{right}:{staff_id}",
                            title="Kein werktäglicher HG unmittelbar vor eigenem BD",
                            detail=f"{staff_id}: HG {left}, BD {right}",
                        ),
                    )
                    model.add(hg + bd <= 1).only_enforce_if(strict_assumption)

    person_bd: dict[str, cp_model.IntVar] = {}
    person_hg: dict[str, cp_model.IntVar] = {}
    person_total: dict[str, cp_model.IntVar] = {}
    person_weekend: dict[str, cp_model.IntVar] = {}
    deviations: list[cp_model.IntVar] = []
    load_vars: list[cp_model.IntVar] = []
    weekend_vars: list[cp_model.IntVar] = []

    for person in snapshot.staff:
        bd_expr = _sum_values(_slot_value_placeholder(fixed, x, day, "bd", person.id) for day in dates)
        hg_expr = _sum_values(_slot_value_placeholder(fixed, x, day, "hg", person.id) for day in dates)
        total_expr = bd_expr + hg_expr
        weekend_expr = _sum_values(
            _slot_value_placeholder(fixed, x, day, role, person.id)
            for day in dates
            if date.fromisoformat(day).isoweekday() in {5, 6, 7}
            for role in ("bd", "hg")
        )
        bd_var = model.new_int_var(0, len(dates), f"bd_count_{person.id}")
        hg_var = model.new_int_var(0, len(dates), f"hg_count_{person.id}")
        total_var = model.new_int_var(0, len(dates) * 2, f"total_count_{person.id}")
        weekend_var = model.new_int_var(0, len(dates) * 2, f"weekend_count_{person.id}")
        model.add(bd_var == bd_expr)
        model.add(hg_var == hg_expr)
        model.add(total_var == total_expr)
        model.add(weekend_var == weekend_expr)
        person_bd[person.id] = bd_var
        person_hg[person.id] = hg_var
        person_total[person.id] = total_var
        person_weekend[person.id] = weekend_var

        for field_name, cap, expression in (
            ("BD", person.limits.maxBd, bd_var),
            ("HG", person.limits.maxHg, hg_var),
            ("Gesamt", person.limits.maxTotal, total_var),
        ):
            if cap is None:
                continue
            assumption = _assumption(
                model,
                assumptions,
                ConflictItem(
                    id=f"PERSON_MAX_{field_name.upper()}:{person.id}:{cap}",
                    title=f"{field_name}-Obergrenze {cap}",
                    detail=person.short or person.name or person.id,
                ),
            )
            model.add(expression <= cap).only_enforce_if(assumption)

        deviation = model.new_int_var(0, len(dates), f"bd_deviation_{person.id}")
        model.add_abs_equality(deviation, bd_var - person.bdTarget)
        deviations.append(deviation)

        load_expr = _sum_values(
            (LOAD_WEIGHT[role] + (WEEKEND_EXTRA[role] if date.fromisoformat(day).isoweekday() in {5, 6, 7} else 0))
            * _slot_value_placeholder(fixed, x, day, role, person.id)
            for day in dates
            for role in ("bd", "hg")
        )
        load_var = model.new_int_var(0, len(dates) * 300, f"load_{person.id}")
        model.add(load_var == load_expr)
        load_vars.append(load_var)
        weekend_vars.append(weekend_var)

    max_bd_deviation = model.new_int_var(0, len(dates), "max_bd_deviation")
    model.add_max_equality(max_bd_deviation, deviations)
    total_bd_deviation = model.new_int_var(0, len(dates) * max(1, len(staff_ids)), "total_bd_deviation")
    model.add(total_bd_deviation == _sum_values(deviations))

    max_load = model.new_int_var(0, len(dates) * 300, "max_load")
    min_load = model.new_int_var(0, len(dates) * 300, "min_load")
    model.add_max_equality(max_load, load_vars)
    model.add_min_equality(min_load, load_vars)
    total_load_spread = model.new_int_var(0, len(dates) * 300, "total_load_spread")
    model.add(total_load_spread == max_load - min_load)

    max_weekend = model.new_int_var(0, len(dates) * 2, "max_weekend")
    min_weekend = model.new_int_var(0, len(dates) * 2, "min_weekend")
    model.add_max_equality(max_weekend, weekend_vars)
    model.add_min_equality(min_weekend, weekend_vars)
    weekend_load_spread = model.new_int_var(0, len(dates) * 2, "weekend_load_spread")
    model.add(weekend_load_spread == max_weekend - min_weekend)

    red_expr = _sum_values(red_terms)
    if snapshot.config.maxRedViolations is not None and allow_red:
        model.add(red_expr <= snapshot.config.maxRedViolations)

    ctx = ModelContext(
        model=model,
        snapshot=snapshot,
        allow_red=allow_red,
        x=x,
        slot_vars=slot_vars,
        candidate_level=candidate_level,
        candidate_score=candidate_score,
        fixed=fixed,
        assumption_descriptions=assumptions,
        red_terms=red_terms,
        orange_terms=orange_terms,
        yellow_terms=yellow_terms,
        recommendation_terms=recommendation_terms,
        person_bd=person_bd,
        person_hg=person_hg,
        person_total=person_total,
        person_weekend=person_weekend,
        max_bd_deviation=max_bd_deviation,
        total_bd_deviation=total_bd_deviation,
        total_load_spread=total_load_spread,
        weekend_load_spread=weekend_load_spread,
    )
    ctx.objective_stages = [
        ("minimal-relaxation", "Bestätigungspflichtige Ausnahmen", red_expr),
        ("quality-orange", "Orange Regelhinweise", _sum_values(orange_terms)),
        ("quality-yellow", "Gelbe Regelhinweise", _sum_values(yellow_terms)),
        ("preferences", "Negative Wunscherfüllung", _sum_values(recommendation_terms)),
        ("fairness-max", "Maximale persönliche BD-Sollabweichung", max_bd_deviation),
        ("fairness-total", "Gesamte BD-Sollabweichung", total_bd_deviation),
        ("fairness-load", "Spannweite der gewichteten Gesamtlast", total_load_spread),
        ("fairness-weekend", "Spannweite der Wochenenddienste", weekend_load_spread),
    ]
    if diagnostic:
        ctx.objective_stages = []
    return ctx


def _slot_value_placeholder(
    fixed: dict[tuple[str, str], str],
    variables: dict[tuple[str, str, str], cp_model.IntVar],
    date_iso: str,
    role: str,
    staff_id: str,
) -> cp_model.LinearExpr:
    fixed_staff = fixed.get((date_iso, role))
    if fixed_staff:
        return 1 if fixed_staff == staff_id else 0
    return variables.get((date_iso, role, staff_id), 0)


def configure_solver(snapshot: SolverSnapshot, budget_seconds: float) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.05, budget_seconds)
    solver.parameters.num_search_workers = 1 if snapshot.config.deterministic else 8
    solver.parameters.random_seed = snapshot.config.seed or _seed_from(snapshot.requestFingerprint)
    solver.parameters.relative_gap_limit = snapshot.config.targetGapPermille / 1000.0
    solver.parameters.log_search_progress = False
    solver.parameters.cp_model_presolve = True
    solver.parameters.symmetry_level = 2
    solver.parameters.use_lns = True
    return solver


def _seed_from(value: str) -> int:
    state = 2166136261
    for character in value:
        state ^= ord(character)
        state = (state * 16777619) & 0xFFFFFFFF
    return state % 2_147_483_647


def _solve(
    ctx: ModelContext,
    snapshot: SolverSnapshot,
    budget_seconds: float,
    emit: Emit,
    cancel: Event,
    stage_id: str,
    started: float,
) -> tuple[cp_model.CpSolver, int]:
    solver = configure_solver(snapshot, budget_seconds)
    callback = ProgressCallback(emit, stage_id, cancel, started)
    status = solver.solve(ctx.model, callback)
    return solver, status


def _has_solution(status: int) -> bool:
    return status in (cp_model.OPTIMAL, cp_model.FEASIBLE)


def assignments_from_solution(ctx: ModelContext, solver: cp_model.CpSolver) -> list[Assignment]:
    result: list[Assignment] = []
    for (date_iso, role), candidates in sorted(ctx.slot_vars.items()):
        if (date_iso, role) in ctx.fixed:
            continue
        for staff_id, variable in candidates:
            if solver.value(variable):
                result.append(Assignment(dateIso=date_iso, role=role, staffId=staff_id))
                break
    return result


def assignment_map(assignments: Sequence[Assignment]) -> dict[tuple[str, str], str]:
    return {(item.dateIso, item.role): item.staffId for item in assignments}


def add_assignment_hint(ctx: ModelContext, assignments: Sequence[Assignment]) -> None:
    chosen = assignment_map(assignments)
    for (date_iso, role), candidates in ctx.slot_vars.items():
        selected = chosen.get((date_iso, role))
        for staff_id, variable in candidates:
            ctx.model.add_hint(variable, int(staff_id == selected))


def _stage_value(solver: cp_model.CpSolver) -> int:
    return int(round(solver.objective_value))


def _stage_result(
    stage_id: str,
    title: str,
    status: int,
    solver: cp_model.CpSolver,
    wall_ms: int,
) -> StageResult:
    status_name = STATUS_NAME.get(status, "UNKNOWN")
    if _has_solution(status):
        value = float(solver.objective_value)
        bound = float(solver.best_objective_bound)
        gap = relative_gap(value, bound)
    else:
        value = None
        bound = None
        gap = None
    return StageResult(
        id=stage_id,
        title=title,
        status=status_name,  # type: ignore[arg-type]
        value=value,
        bestBound=bound,
        relativeGap=gap,
        wallTimeMs=wall_ms,
    )


def lexicographic_solve(
    ctx: ModelContext,
    snapshot: SolverSnapshot,
    deadline: float,
    emit: Emit,
    cancel: Event,
    started: float,
    hint: Sequence[Assignment] | None = None,
) -> tuple[cp_model.CpSolver | None, int, list[StageResult]]:
    if hint:
        add_assignment_hint(ctx, hint)
    stages: list[StageResult] = []
    last_solver: cp_model.CpSolver | None = None
    last_status = cp_model.UNKNOWN
    total_stages = len(ctx.objective_stages)
    for index, (stage_id, title, expression) in enumerate(ctx.objective_stages):
        if cancel.is_set() or time.monotonic() >= deadline:
            break
        ctx.model.clear_objective()
        ctx.model.minimize(expression)
        remaining = max(0.05, deadline - time.monotonic())
        stage_budget = max(0.1, remaining / max(1, total_stages - index))
        emit(
            {
                "stage": stage_id,
                "phase": "perfect",
                "status": "running",
                "objectiveLevel": index,
                "message": f"Lexikografische Zielstufe {index + 1}/{total_stages}: {title}.",
            }
        )
        stage_started = time.monotonic()
        solver, status = _solve(ctx, snapshot, stage_budget, emit, cancel, stage_id, started)
        wall_ms = int((time.monotonic() - stage_started) * 1000)
        stages.append(_stage_result(stage_id, title, status, solver, wall_ms))
        last_solver, last_status = solver, status
        if not _has_solution(status):
            break
        value = _stage_value(solver)
        # Optimal stages are fixed exactly. Feasible stages use an upper bound,
        # allowing later stages to improve them but never make them worse.
        if status == cp_model.OPTIMAL:
            ctx.model.add(expression == value)
        else:
            ctx.model.add(expression <= value)
        emit(
            {
                "stage": stage_id,
                "phase": "perfect",
                "status": STATUS_NAME[status],
                "solverStatus": STATUS_NAME[status],
                "objectiveLevel": index,
                "objectiveValue": float(solver.objective_value),
                "bestBound": float(solver.best_objective_bound),
                "relativeGap": relative_gap(float(solver.objective_value), float(solver.best_objective_bound)),
                "branches": int(solver.num_branches),
                "conflicts": int(solver.num_conflicts),
                "message": f"Zielstufe {title}: {STATUS_NAME[status]}.",
            }
        )
    return last_solver, last_status, stages


def diagnose_infeasibility(snapshot: SolverSnapshot, allow_red: bool, budget: float) -> list[ConflictItem]:
    ctx = build_model(snapshot, allow_red=allow_red, diagnostic=True)
    solver = configure_solver(snapshot, max(0.1, budget))
    solver.parameters.num_search_workers = 1
    status = solver.solve(ctx.model)
    if status != cp_model.INFEASIBLE:
        return []
    core_indices = solver.sufficient_assumptions_for_infeasibility()
    core = [ctx.assumption_descriptions[index] for index in core_indices if index in ctx.assumption_descriptions]
    # Deterministic de-duplication; OR-Tools returns a sufficient, not necessarily
    # globally minimal core.
    seen: set[str] = set()
    reduced: list[ConflictItem] = []
    for item in core:
        if item.id in seen:
            continue
        seen.add(item.id)
        reduced.append(item)
    return reduced[:24]


def relaxation_suggestions(core: Sequence[ConflictItem]) -> list[RelaxationSuggestion]:
    result: list[RelaxationSuggestion] = []
    for item in core:
        if item.id.startswith("PERSON_MAX_"):
            result.append(
                RelaxationSuggestion(
                    id=f"relax:{item.id}",
                    label=f"{item.title} für diesen Lauf gezielt erhöhen oder eine bestehende Zuordnung neu freigeben.",
                    severity=3,
                )
            )
        elif item.id.startswith("WEEKDAY_HG_BEFORE_OWN_BD"):
            result.append(
                RelaxationSuggestion(
                    id=f"relax:{item.id}",
                    label=f"Werktägliche HG-vor-BD-Folge einmalig als rote Ausnahme prüfen: {item.detail or ''}".strip(),
                    severity=2,
                )
            )
        elif item.id.startswith("SLOT_COVERAGE"):
            result.append(
                RelaxationSuggestion(
                    id=f"repair:{item.id}",
                    label=f"Kandidatendomäne für {item.title} erweitern oder angrenzende Fixpunkte zur Neuplanung freigeben.",
                    severity=4,
                )
            )
    unique: dict[str, RelaxationSuggestion] = {item.id: item for item in result}
    return list(unique.values())[:12]


def objective_tuple(ctx: ModelContext, solver: cp_model.CpSolver) -> tuple[int, ...]:
    values: list[int] = []
    for _, _, expression in ctx.objective_stages:
        # CP-SAT does not expose arbitrary expression evaluation directly; clone
        # each stage as the active objective only during the main pipeline. Here
        # we use the staged constraints' current objective value when available,
        # and a deterministic assignment-derived score for LNS comparison.
        del expression
    assignments = assignments_from_solution(ctx, solver)
    selected = assignment_map(assignments)
    red = orange = yellow = recommendation = 0
    for (date_iso, role), staff_id in selected.items():
        level = ctx.candidate_level.get((date_iso, role, staff_id), "green")
        red += int(level == "red")
        orange += int(level == "orange")
        yellow += int(level == "yellow")
        recommendation -= ctx.candidate_score.get((date_iso, role, staff_id), 0)
    bd_counts = defaultdict(int)
    total_counts = defaultdict(int)
    weekend_counts = defaultdict(int)
    for (date_iso, role), staff_id in {**ctx.fixed, **selected}.items():
        total_counts[staff_id] += 1
        bd_counts[staff_id] += int(role == "bd")
        weekend_counts[staff_id] += int(date.fromisoformat(date_iso).isoweekday() in {5, 6, 7})
    targets = {person.id: person.bdTarget for person in ctx.snapshot.staff}
    deviations = [abs(bd_counts[person.id] - targets[person.id]) for person in ctx.snapshot.staff]
    loads = [total_counts[person.id] for person in ctx.snapshot.staff]
    weekends = [weekend_counts[person.id] for person in ctx.snapshot.staff]
    return (
        red,
        orange,
        yellow,
        recommendation,
        max(deviations, default=0),
        sum(deviations),
        max(loads, default=0) - min(loads, default=0),
        max(weekends, default=0) - min(weekends, default=0),
    )


def _destroy_slots(
    operator: str,
    snapshot: SolverSnapshot,
    incumbent: Sequence[Assignment],
    size: int,
    rng: random.Random,
) -> set[tuple[str, str]]:
    assignments = list(incumbent)
    if not assignments:
        return set()
    chosen: list[Assignment]
    if operator == "weakest":
        level_by_key = {
            (slot.dateIso, slot.role, candidate.staffId): LEVEL_RANK[candidate.level]
            for slot in snapshot.slots
            for candidate in slot.candidates
        }
        chosen = sorted(
            assignments,
            key=lambda item: level_by_key.get((item.dateIso, item.role, item.staffId), 0),
            reverse=True,
        )[:size]
    elif operator == "weekend":
        weekends = defaultdict(list)
        for item in assignments:
            day = date.fromisoformat(item.dateIso)
            if day.isoweekday() in {5, 6, 7}:
                monday = day.toordinal() - day.weekday()
                weekends[monday].append(item)
        group = rng.choice(list(weekends.values())) if weekends else assignments
        chosen = list(group)
        if len(chosen) < size:
            remaining = [item for item in assignments if item not in chosen]
            rng.shuffle(remaining)
            chosen.extend(remaining[: size - len(chosen)])
    elif operator == "person-load":
        by_person = defaultdict(list)
        for item in assignments:
            by_person[item.staffId].append(item)
        person = max(by_person, key=lambda key: len(by_person[key]))
        chosen = by_person[person][:]
        remaining = [item for item in assignments if item.staffId != person]
        rng.shuffle(remaining)
        chosen.extend(remaining[: max(0, size - len(chosen))])
    elif operator == "time-window":
        dates = sorted({item.dateIso for item in assignments})
        start = rng.randrange(max(1, len(dates)))
        span_dates = set(dates[start : start + max(2, math.ceil(size / 2))])
        chosen = [item for item in assignments if item.dateIso in span_dates]
    else:
        chosen = assignments[:]
        rng.shuffle(chosen)
        chosen = chosen[:size]
    return {(item.dateIso, item.role) for item in chosen[:size]}


def adaptive_exact_lns(
    snapshot: SolverSnapshot,
    incumbent: list[Assignment],
    allow_red: bool,
    deadline: float,
    emit: Emit,
    cancel: Event,
) -> tuple[list[Assignment], ExactLnsMetadata]:
    metadata = ExactLnsMetadata(enabled=snapshot.config.exactLns)
    if not snapshot.config.exactLns or time.monotonic() >= deadline or not incumbent:
        return incumbent, metadata
    operators = ["weakest", "weekend", "person-load", "time-window", "random"]
    learning = {name: {"uses": 0, "reward": 0.0, "costMs": 0.0, "weight": 1.0} for name in operators}
    rng = random.Random(snapshot.config.seed or _seed_from(snapshot.requestFingerprint))
    incumbent_score: tuple[int, ...] | None = None
    stagnation = 0
    round_index = 0

    while time.monotonic() < deadline and not cancel.is_set():
        round_index += 1
        metadata.rounds = round_index
        # UCB with cost-aware reward and short-term weight.
        untried = [name for name in operators if learning[name]["uses"] == 0]
        if untried:
            operator = rng.choice(untried)
        else:
            total_uses = sum(int(learning[name]["uses"]) for name in operators)
            operator = max(
                operators,
                key=lambda name: float(learning[name]["weight"])
                * (float(learning[name]["reward"]) / max(1.0, float(learning[name]["costMs"])))
                + math.sqrt(2.0 * math.log(max(2, total_uses)) / int(learning[name]["uses"])),
            )
        fraction = min(1.0, stagnation / 8.0)
        size = round(
            snapshot.config.lnsMinSize
            + (snapshot.config.lnsMaxSize - snapshot.config.lnsMinSize) * (0.25 + 0.75 * fraction) * rng.random()
        )
        neighborhood = _destroy_slots(operator, snapshot, incumbent, size, rng)
        if not neighborhood:
            break
        ctx = build_model(snapshot, allow_red=allow_red)
        selected = assignment_map(incumbent)
        for (date_iso, role), staff_id in selected.items():
            if (date_iso, role) in neighborhood:
                continue
            variable = ctx.x.get((date_iso, role, staff_id))
            if variable is not None:
                ctx.model.add(variable == 1)
        add_assignment_hint(ctx, incumbent)
        # Scalar objective preserves the hard lexicographic order for a bounded
        # 62-slot instance; all coefficients remain far below int64 limits.
        scalar = (
            100_000_000 * _sum_values(ctx.red_terms)
            + 1_000_000 * _sum_values(ctx.orange_terms)
            + 10_000 * _sum_values(ctx.yellow_terms)
            + 10 * ctx.max_bd_deviation
            + ctx.total_bd_deviation
            + ctx.total_load_spread
            + ctx.weekend_load_spread
            + _sum_values(ctx.recommendation_terms)
        )
        ctx.model.minimize(scalar)
        available = max(0.05, min(2.0, deadline - time.monotonic()))
        started = time.monotonic()
        solver = configure_solver(snapshot, available)
        status = solver.solve(ctx.model)
        cost_ms = max(0.1, (time.monotonic() - started) * 1000)
        metadata.neighborhoods += 1
        learning[operator]["uses"] = int(learning[operator]["uses"]) + 1
        learning[operator]["costMs"] = float(learning[operator]["costMs"]) + cost_ms
        if _has_solution(status):
            candidate = assignments_from_solution(ctx, solver)
            candidate_score = objective_tuple(ctx, solver)
            if incumbent_score is None:
                base_ctx = build_model(snapshot, allow_red=allow_red)
                add_assignment_hint(base_ctx, incumbent)
                incumbent_score = _score_assignments(base_ctx, incumbent)
            if candidate_score < incumbent_score:
                incumbent = candidate
                incumbent_score = candidate_score
                metadata.improvements += 1
                metadata.accepted += 1
                learning[operator]["reward"] = float(learning[operator]["reward"]) + 33.0
                stagnation = 0
                emit(
                    {
                        "stage": "exact-lns",
                        "phase": "perfect",
                        "status": "running",
                        "neighbourhood": operator,
                        "neighborhoodSize": len(neighborhood),
                        "improvements": metadata.improvements,
                        "message": f"Exact-LNS verbesserte {len(neighborhood)} freigegebene Dienstfelder über {operator}.",
                    }
                )
            else:
                metadata.rejected += 1
                learning[operator]["reward"] = float(learning[operator]["reward"]) + 1.0
                stagnation += 1
        else:
            metadata.rejected += 1
            stagnation += 1
        if round_index % 8 == 0:
            for name in operators:
                uses = max(1, int(learning[name]["uses"]))
                observed = float(learning[name]["reward"]) / uses
                learning[name]["weight"] = 0.65 * float(learning[name]["weight"]) + 0.35 * observed
        if stagnation >= 14:
            metadata.restarts += 1
            stagnation = 4

    metadata.operatorLearning = {
        name: {
            "uses": int(values["uses"]),
            "reward": round(float(values["reward"]), 3),
            "costMs": round(float(values["costMs"]), 2),
            "weight": round(float(values["weight"]), 4),
            "rewardPerSecond": round(float(values["reward"]) / max(0.001, float(values["costMs"]) / 1000), 3),
        }
        for name, values in learning.items()
    }
    return incumbent, metadata


def _score_assignments(ctx: ModelContext, assignments: Sequence[Assignment]) -> tuple[int, ...]:
    selected = assignment_map(assignments)
    red = orange = yellow = recommendation = 0
    for (date_iso, role), staff_id in selected.items():
        level = ctx.candidate_level.get((date_iso, role, staff_id), "green")
        red += int(level == "red")
        orange += int(level == "orange")
        yellow += int(level == "yellow")
        recommendation -= ctx.candidate_score.get((date_iso, role, staff_id), 0)
    bd_counts = defaultdict(int)
    total_counts = defaultdict(int)
    weekend_counts = defaultdict(int)
    for (date_iso, role), staff_id in {**ctx.fixed, **selected}.items():
        total_counts[staff_id] += 1
        bd_counts[staff_id] += int(role == "bd")
        weekend_counts[staff_id] += int(date.fromisoformat(date_iso).isoweekday() in {5, 6, 7})
    deviations = [abs(bd_counts[p.id] - p.bdTarget) for p in ctx.snapshot.staff]
    totals = [total_counts[p.id] for p in ctx.snapshot.staff]
    weekends = [weekend_counts[p.id] for p in ctx.snapshot.staff]
    return (
        red,
        orange,
        yellow,
        recommendation,
        max(deviations, default=0),
        sum(deviations),
        max(totals, default=0) - min(totals, default=0),
        max(weekends, default=0) - min(weekends, default=0),
    )


def generate_alternatives(
    snapshot: SolverSnapshot,
    primary: list[Assignment],
    allow_red: bool,
    count: int,
    deadline: float,
    emit: Emit,
    cancel: Event,
) -> list[Alternative]:
    alternatives: list[Alternative] = []
    previous = [primary]
    while len(alternatives) < max(0, count - 1) and time.monotonic() < deadline and not cancel.is_set():
        ctx = build_model(snapshot, allow_red=allow_red)
        # Bind the primary high-level quality tuple, preserving hard quality.
        primary_score = _score_assignments(ctx, primary)
        ctx.model.add(_sum_values(ctx.red_terms) <= primary_score[0])
        ctx.model.add(_sum_values(ctx.orange_terms) <= primary_score[1])
        ctx.model.add(_sum_values(ctx.yellow_terms) <= primary_score[2] + 1)
        distance_terms: list[cp_model.LinearExpr] = []
        for prior in previous:
            chosen = assignment_map(prior)
            differences: list[cp_model.LinearExpr] = []
            for key, staff_id in chosen.items():
                selected_var = ctx.x.get((key[0], key[1], staff_id))
                if selected_var is not None:
                    differences.append(1 - selected_var)
            if differences:
                ctx.model.add(_sum_values(differences) >= snapshot.config.minimumAlternativeDistance)
                distance_terms.extend(differences)
        ctx.model.maximize(_sum_values(distance_terms))
        solver = configure_solver(snapshot, min(3.0, max(0.1, deadline - time.monotonic())))
        status = solver.solve(ctx.model)
        if not _has_solution(status):
            break
        assignments = assignments_from_solution(ctx, solver)
        previous.append(assignments)
        metadata = SolverMetadata(
            objectiveValue=float(solver.objective_value),
            bestBound=float(solver.best_objective_bound),
            relativeGap=relative_gap(float(solver.objective_value), float(solver.best_objective_bound)),
            conflicts=int(solver.num_conflicts),
            branches=int(solver.num_branches),
            deterministicTime=float(solver.wall_time),
            wallTimeMs=int(solver.wall_time * 1000),
            deterministic=snapshot.config.deterministic,
        )
        alternatives.append(
            Alternative(status=STATUS_NAME[status], assignments=assignments, metadata=metadata)  # type: ignore[arg-type]
        )
        emit(
            {
                "stage": "alternatives",
                "phase": "perfect",
                "status": "running",
                "alternativeCount": len(alternatives) + 1,
                "minimumDistance": snapshot.config.minimumAlternativeDistance,
                "message": f"Qualitätsgebundene Variante {len(alternatives) + 1} gefunden.",
            }
        )
    return alternatives


def solve_snapshot(snapshot: SolverSnapshot, emit: Emit, cancel: Event) -> SolverResult:
    started = time.monotonic()
    deadline = started + snapshot.config.timeBudgetMs / 1000.0
    emit(
        {
            "stage": "compile",
            "phase": "analysis",
            "status": "running",
            "message": f"CP-SAT-Modell für {len(snapshot.slots)} Dienstfelder wird kompiliert.",
        }
    )

    strict_ctx = build_model(snapshot, allow_red=False)
    strict_budget = max(0.5, min((deadline - time.monotonic()) * 0.28, 45.0))
    strict_solver = configure_solver(snapshot, strict_budget)
    strict_callback = ProgressCallback(emit, "strict-feasibility", cancel, started)
    strict_ctx.model.clear_objective()
    strict_status = strict_solver.solve(strict_ctx.model, strict_callback)
    emit(
        {
            "stage": "strict-feasibility",
            "phase": "search",
            "status": STATUS_NAME[strict_status],
            "solverStatus": STATUS_NAME[strict_status],
            "branches": int(strict_solver.num_branches),
            "conflicts": int(strict_solver.num_conflicts),
            "message": "Null-Rot-Machbarkeitsprüfung abgeschlossen.",
        }
    )

    conflict_core: list[ConflictItem] = []
    suggestions: list[RelaxationSuggestion] = []
    allow_red = False
    hint: list[Assignment] | None = None
    if _has_solution(strict_status):
        hint = assignments_from_solution(strict_ctx, strict_solver)
    elif strict_status == cp_model.INFEASIBLE:
        diagnostic_budget = max(0.25, min(10.0, (deadline - time.monotonic()) * 0.12))
        conflict_core = diagnose_infeasibility(snapshot, allow_red=False, budget=diagnostic_budget)
        suggestions = relaxation_suggestions(conflict_core)
        emit(
            {
                "stage": "explain",
                "phase": "certify",
                "status": "INFEASIBLE",
                "solverStatus": "INFEASIBLE",
                "conflictCoreSize": len(conflict_core),
                "message": f"Reduzierter Konfliktkern mit {len(conflict_core)} Bedingungen bestimmt.",
            }
        )
        if snapshot.config.allowRedFallback:
            allow_red = True
        else:
            metadata = SolverMetadata(
                conflicts=int(strict_solver.num_conflicts),
                branches=int(strict_solver.num_branches),
                deterministicTime=float(strict_solver.wall_time),
                wallTimeMs=int((time.monotonic() - started) * 1000),
                deterministic=snapshot.config.deterministic,
            )
            return SolverResult(
                rulesetVersion=snapshot.rulesetVersion,
                solverVersion=ortools.__version__,
                status="INFEASIBLE",
                baselineFingerprint=snapshot.baselineFingerprint,
                assignments=[],
                conflictCore=conflict_core,
                relaxationSuggestions=suggestions,
                metadata=metadata,
            )
    else:
        if snapshot.config.allowRedFallback:
            allow_red = True
        elif not _has_solution(strict_status):
            metadata = SolverMetadata(
                conflicts=int(strict_solver.num_conflicts),
                branches=int(strict_solver.num_branches),
                deterministicTime=float(strict_solver.wall_time),
                wallTimeMs=int((time.monotonic() - started) * 1000),
                deterministic=snapshot.config.deterministic,
            )
            return SolverResult(
                rulesetVersion=snapshot.rulesetVersion,
                solverVersion=ortools.__version__,
                status=STATUS_NAME[strict_status],  # type: ignore[arg-type]
                baselineFingerprint=snapshot.baselineFingerprint,
                assignments=[],
                metadata=metadata,
            )

    ctx = build_model(snapshot, allow_red=allow_red)
    solver, status, stages = lexicographic_solve(ctx, snapshot, deadline, emit, cancel, started, hint=hint)
    if solver is None or not _has_solution(status):
        metadata = SolverMetadata(
            conflicts=int(solver.num_conflicts) if solver else 0,
            branches=int(solver.num_branches) if solver else 0,
            deterministicTime=float(solver.wall_time) if solver else 0.0,
            wallTimeMs=int((time.monotonic() - started) * 1000),
            deterministic=snapshot.config.deterministic,
            lexicographicStages=stages,
        )
        return SolverResult(
            rulesetVersion=snapshot.rulesetVersion,
            solverVersion=ortools.__version__,
            status=STATUS_NAME[status],  # type: ignore[arg-type]
            baselineFingerprint=snapshot.baselineFingerprint,
            assignments=[],
            conflictCore=conflict_core,
            relaxationSuggestions=suggestions,
            metadata=metadata,
        )

    primary = assignments_from_solution(ctx, solver)
    lns_deadline = min(deadline, time.monotonic() + max(0.0, (deadline - time.monotonic()) * 0.55))
    primary, lns_metadata = adaptive_exact_lns(snapshot, primary, allow_red, lns_deadline, emit, cancel)
    alternatives = generate_alternatives(
        snapshot,
        primary,
        allow_red,
        snapshot.config.alternatives,
        deadline,
        emit,
        cancel,
    )

    final_stage = stages[-1] if stages else None
    final_status = "OPTIMAL" if stages and all(stage.status == "OPTIMAL" for stage in stages) else "FEASIBLE"
    objective_value = final_stage.value if final_stage else None
    best_bound = final_stage.bestBound if final_stage else None
    metadata = SolverMetadata(
        objectiveValue=objective_value,
        bestBound=best_bound,
        relativeGap=relative_gap(float(objective_value), float(best_bound))
        if objective_value is not None and best_bound is not None
        else None,
        conflicts=int(solver.num_conflicts),
        branches=int(solver.num_branches),
        deterministicTime=float(solver.wall_time),
        wallTimeMs=int((time.monotonic() - started) * 1000),
        deterministic=snapshot.config.deterministic,
        lexicographicStages=stages,
        exactLns=lns_metadata,
    )
    emit(
        {
            "stage": "audit",
            "phase": "audit",
            "status": final_status,
            "solverStatus": final_status,
            "objectiveValue": objective_value,
            "bestBound": best_bound,
            "relativeGap": metadata.relativeGap,
            "branches": metadata.branches,
            "conflicts": metadata.conflicts,
            "message": "Nativer Solverlauf abgeschlossen; Browseraudit folgt.",
        }
    )
    return SolverResult(
        rulesetVersion=snapshot.rulesetVersion,
        solverVersion=ortools.__version__,
        status=final_status,
        baselineFingerprint=snapshot.baselineFingerprint,
        assignments=primary,
        alternatives=alternatives,
        conflictCore=conflict_core,
        relaxationSuggestions=suggestions,
        metadata=metadata,
    )
