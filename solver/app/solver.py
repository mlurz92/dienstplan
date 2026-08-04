from __future__ import annotations

import math
import random
import time
from collections import defaultdict
from collections.abc import Callable, Iterable, Sequence
from dataclasses import dataclass, field
from datetime import date
from importlib.metadata import version as distribution_version
from threading import Event
from typing import cast

from ortools.sat.python import cp_model

from .schemas import (
    Alternative,
    Assignment,
    ConflictItem,
    ExactLnsMetadata,
    RelaxationSuggestion,
    Role,
    SolverMetadata,
    SolverResult,
    SolverSnapshot,
    SolverStatus,
    StageResult,
)

Emit = Callable[[dict[str, object]], None]
Status = cp_model.CpSolverStatus
Expr = cp_model.LinearExprT
SlotKey = tuple[str, Role]
AssignmentKey = tuple[str, Role, str]

LEVEL_RANK: dict[str, int] = {"green": 0, "yellow": 1, "orange": 2, "red": 3, "gray": 4}
LOAD_WEIGHT: dict[Role, int] = {"bd": 100, "hg": 55}
WEEKEND_EXTRA: dict[Role, int] = {"bd": 35, "hg": 20}


@dataclass(slots=True)
class ModelContext:
    model: cp_model.CpModel
    snapshot: SolverSnapshot
    allow_red: bool
    x: dict[AssignmentKey, cp_model.IntVar]
    slot_vars: dict[SlotKey, list[tuple[str, cp_model.IntVar]]]
    candidate_level: dict[AssignmentKey, str]
    candidate_score: dict[AssignmentKey, int]
    fixed: dict[SlotKey, str]
    assumption_vars: dict[int, cp_model.IntVar]
    assumption_descriptions: dict[int, ConflictItem]
    red_expr: Expr
    orange_expr: Expr
    yellow_expr: Expr
    recommendation_expr: Expr
    stability_expr: Expr
    max_bd_deviation: cp_model.IntVar
    total_bd_deviation: cp_model.IntVar
    total_load_spread: cp_model.IntVar
    weekend_load_spread: cp_model.IntVar
    objective_stages: list[tuple[str, str, Expr]] = field(default_factory=list)


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
        if self.cancel.is_set():
            self.stop_search()
            return
        self.solutions += 1
        now = time.monotonic()
        if self.solutions > 1 and now - self.last_emit < 0.4:
            return
        self.last_emit = now
        value = float(self.objective_value)
        bound = float(self.best_objective_bound)
        self.emit(
            {
                "stage": self.stage_id,
                "phase": "perfect",
                "status": "running",
                "solverStatus": "FEASIBLE",
                "objectiveValue": value,
                "bestBound": bound,
                "relativeGap": relative_gap(value, bound),
                "branches": int(self.num_branches),
                "conflicts": int(self.num_conflicts),
                "deterministicTime": float(self.deterministic_time),
                "wallTimeMs": int((now - self.started) * 1000),
                "message": f"Neue CP-SAT-Lösung in Zielstufe {self.stage_id}.",
            }
        )


def status_name(solver: cp_model.CpSolver, status: Status) -> SolverStatus:
    value = solver.status_name(status)
    if value not in {"OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN"}:
        return "UNKNOWN"
    return cast(SolverStatus, value)


def has_solution(status: Status) -> bool:
    return status in (cp_model.OPTIMAL, cp_model.FEASIBLE)


def relative_gap(value: float, bound: float) -> float:
    if not math.isfinite(value) or not math.isfinite(bound):
        return 1.0
    if abs(value) < 1e-9:
        return 0.0 if abs(bound) < 1e-9 else 1.0
    return max(0.0, abs(value - bound) / max(1.0, abs(value)))


def linear_sum(values: Iterable[Expr]) -> cp_model.LinearExpr:
    return cp_model.LinearExpr.sum(list(values))


def slot_value(
    fixed: dict[SlotKey, str],
    variables: dict[AssignmentKey, cp_model.IntVar],
    date_iso: str,
    role: Role,
    staff_id: str,
) -> Expr:
    fixed_staff = fixed.get((date_iso, role))
    if fixed_staff is not None:
        return 1 if fixed_staff == staff_id else 0
    return variables.get((date_iso, role, staff_id), 0)


def and_var(model: cp_model.CpModel, left: Expr, right: Expr, name: str) -> cp_model.IntVar:
    value = model.new_bool_var(name)
    model.add(value <= left)
    model.add(value <= right)
    model.add(value >= left + right - 1)
    return value


def add_assumption(
    model: cp_model.CpModel,
    variables: dict[int, cp_model.IntVar],
    descriptions: dict[int, ConflictItem],
    item: ConflictItem,
) -> cp_model.IntVar:
    literal = model.new_bool_var(f"assumption_{len(variables)}")
    model.add_assumption(literal)
    variables[literal.index] = literal
    descriptions[literal.index] = item
    return literal


def red_candidate_allowed(snapshot: SolverSnapshot, reasons: Sequence[str]) -> bool:
    text = " ".join(reasons).casefold()
    policy = snapshot.config.relaxationPolicy
    if any(token in text for token in ("urlaub", "abwesen", "fza", "krank")):
        return policy.absence
    if any(token in text for token in ("maximum", "obergrenze", "maximal")):
        return policy.hardMaximum
    return policy.organizational


def warm_start_map(snapshot: SolverSnapshot) -> dict[SlotKey, str]:
    if not snapshot.warmStarts:
        return {}
    return {
        (item.dateIso, item.role): item.staffId
        for item in snapshot.warmStarts[0].assignments
    }


def build_model(snapshot: SolverSnapshot, *, allow_red: bool, diagnostic: bool = False) -> ModelContext:
    model = cp_model.CpModel()
    x: dict[AssignmentKey, cp_model.IntVar] = {}
    slot_vars: dict[SlotKey, list[tuple[str, cp_model.IntVar]]] = {}
    candidate_level: dict[AssignmentKey, str] = {}
    candidate_score: dict[AssignmentKey, int] = {}
    fixed: dict[SlotKey, str] = {
        (item.dateIso, item.role): item.staffId for item in snapshot.fixedAssignments
    }
    assumption_vars: dict[int, cp_model.IntVar] = {}
    assumption_descriptions: dict[int, ConflictItem] = {}
    red_terms: list[Expr] = []
    orange_terms: list[Expr] = []
    yellow_terms: list[Expr] = []
    recommendation_terms: list[Expr] = []

    for slot in snapshot.slots:
        key: SlotKey = (slot.dateIso, slot.role)
        if slot.fixedStaffId:
            fixed[key] = slot.fixedStaffId
            slot_vars[key] = []
            continue
        candidates: list[tuple[str, cp_model.IntVar]] = []
        for candidate in slot.candidates:
            if not candidate.canSelect or candidate.level == "gray":
                continue
            if candidate.level == "red":
                if not allow_red or not red_candidate_allowed(snapshot, candidate.reasons):
                    continue
            variable = model.new_bool_var(f"x_{slot.dateIso}_{slot.role}_{candidate.staffId}")
            assignment_key: AssignmentKey = (slot.dateIso, slot.role, candidate.staffId)
            x[assignment_key] = variable
            candidates.append((candidate.staffId, variable))
            candidate_level[assignment_key] = candidate.level
            candidate_score[assignment_key] = candidate.recommendationScore
            if candidate.level == "red":
                red_terms.append(variable)
            elif candidate.level == "orange":
                orange_terms.append(variable)
            elif candidate.level == "yellow":
                yellow_terms.append(variable)
            if candidate.recommendationScore:
                recommendation_terms.append(-candidate.recommendationScore * variable)
        slot_vars[key] = candidates
        assumption = add_assumption(
            model,
            assumption_vars,
            assumption_descriptions,
            ConflictItem(
                id=f"SLOT_COVERAGE:{slot.dateIso}:{slot.role}",
                title=f"{slot.role.upper()} {slot.dateIso} muss belegt werden",
                detail=f"{len(candidates)} technisch zulässige Kandidaten im {'Relaxed' if allow_red else 'Strict'}-Modell",
            ),
        )
        model.add(linear_sum(variable for _, variable in candidates) == 1).only_enforce_if(assumption)

    staff_ids = [person.id for person in snapshot.staff]
    for date_iso in snapshot.dates:
        for staff_id in staff_ids:
            assumption = add_assumption(
                model,
                assumption_vars,
                assumption_descriptions,
                ConflictItem(
                    id=f"NO_SAME_DAY_BD_HG:{date_iso}:{staff_id}",
                    title="Kein gleichzeitiger BD und HG",
                    detail=f"{staff_id} am {date_iso}",
                ),
            )
            model.add(
                slot_value(fixed, x, date_iso, "bd", staff_id)
                + slot_value(fixed, x, date_iso, "hg", staff_id)
                <= 1
            ).only_enforce_if(assumption)

    for left_date, right_date in zip(snapshot.dates, snapshot.dates[1:], strict=False):
        if (date.fromisoformat(right_date) - date.fromisoformat(left_date)).days != 1:
            continue
        for staff_id in staff_ids:
            assumption = add_assumption(
                model,
                assumption_vars,
                assumption_descriptions,
                ConflictItem(
                    id=f"NO_CONSECUTIVE_BD:{left_date}:{right_date}:{staff_id}",
                    title="Keine direkt aufeinanderfolgenden BD",
                    detail=f"{staff_id}: {left_date} und {right_date}",
                ),
            )
            model.add(
                slot_value(fixed, x, left_date, "bd", staff_id)
                + slot_value(fixed, x, right_date, "bd", staff_id)
                <= 1
            ).only_enforce_if(assumption)

            if date.fromisoformat(left_date).isoweekday() in {1, 2, 3, 4}:
                hg = slot_value(fixed, x, left_date, "hg", staff_id)
                bd = slot_value(fixed, x, right_date, "bd", staff_id)
                if allow_red and snapshot.config.relaxationPolicy.organizational:
                    red_terms.append(and_var(model, hg, bd, f"weekday_hg_bd_{left_date}_{staff_id}"))
                else:
                    strict_assumption = add_assumption(
                        model,
                        assumption_vars,
                        assumption_descriptions,
                        ConflictItem(
                            id=f"WEEKDAY_HG_BEFORE_OWN_BD:{left_date}:{right_date}:{staff_id}",
                            title="Kein werktäglicher HG unmittelbar vor eigenem BD",
                            detail=f"{staff_id}: HG {left_date}, BD {right_date}",
                        ),
                    )
                    model.add(hg + bd <= 1).only_enforce_if(strict_assumption)

    deviation_vars: list[cp_model.IntVar] = []
    load_vars: list[cp_model.IntVar] = []
    weekend_vars: list[cp_model.IntVar] = []
    warm = warm_start_map(snapshot)
    stability_terms: list[Expr] = []

    for person in snapshot.staff:
        bd_expr = linear_sum(
            slot_value(fixed, x, day, "bd", person.id) for day in snapshot.dates
        )
        hg_expr = linear_sum(
            slot_value(fixed, x, day, "hg", person.id) for day in snapshot.dates
        )
        total_expr = bd_expr + hg_expr
        weekend_expr = linear_sum(
            slot_value(fixed, x, day, role, person.id)
            for day in snapshot.dates
            if date.fromisoformat(day).isoweekday() in {5, 6, 7}
            for role in cast(tuple[Role, Role], ("bd", "hg"))
        )
        bd_count = model.new_int_var(0, len(snapshot.dates), f"bd_count_{person.id}")
        hg_count = model.new_int_var(0, len(snapshot.dates), f"hg_count_{person.id}")
        total_count = model.new_int_var(0, len(snapshot.dates) * 2, f"total_count_{person.id}")
        weekend_count = model.new_int_var(0, len(snapshot.dates) * 2, f"weekend_count_{person.id}")
        model.add(bd_count == bd_expr)
        model.add(hg_count == hg_expr)
        model.add(total_count == total_expr)
        model.add(weekend_count == weekend_expr)

        for label, cap, expression in (
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

        deviation = model.new_int_var(0, len(snapshot.dates), f"bd_deviation_{person.id}")
        model.add_abs_equality(deviation, bd_count - person.bdTarget)
        deviation_vars.append(deviation)

        weighted_load = linear_sum(
            (
                LOAD_WEIGHT[role]
                + (WEEKEND_EXTRA[role] if date.fromisoformat(day).isoweekday() in {5, 6, 7} else 0)
            )
            * slot_value(fixed, x, day, role, person.id)
            for day in snapshot.dates
            for role in cast(tuple[Role, Role], ("bd", "hg"))
        )
        load = model.new_int_var(0, len(snapshot.dates) * 300, f"load_{person.id}")
        model.add(load == weighted_load)
        load_vars.append(load)
        weekend_vars.append(weekend_count)

    for key, desired_staff in warm.items():
        desired = x.get((key[0], key[1], desired_staff))
        if desired is not None:
            stability_terms.append(1 - desired)

    max_bd_deviation = model.new_int_var(0, len(snapshot.dates), "max_bd_deviation")
    model.add_max_equality(max_bd_deviation, deviation_vars)
    total_bd_deviation = model.new_int_var(
        0,
        len(snapshot.dates) * max(1, len(snapshot.staff)),
        "total_bd_deviation",
    )
    model.add(total_bd_deviation == linear_sum(deviation_vars))

    max_load = model.new_int_var(0, len(snapshot.dates) * 300, "max_load")
    min_load = model.new_int_var(0, len(snapshot.dates) * 300, "min_load")
    model.add_max_equality(max_load, load_vars)
    model.add_min_equality(min_load, load_vars)
    total_load_spread = model.new_int_var(0, len(snapshot.dates) * 300, "total_load_spread")
    model.add(total_load_spread == max_load - min_load)

    max_weekend = model.new_int_var(0, len(snapshot.dates) * 2, "max_weekend")
    min_weekend = model.new_int_var(0, len(snapshot.dates) * 2, "min_weekend")
    model.add_max_equality(max_weekend, weekend_vars)
    model.add_min_equality(min_weekend, weekend_vars)
    weekend_load_spread = model.new_int_var(0, len(snapshot.dates) * 2, "weekend_load_spread")
    model.add(weekend_load_spread == max_weekend - min_weekend)

    red_expr = linear_sum(red_terms)
    orange_expr = linear_sum(orange_terms)
    yellow_expr = linear_sum(yellow_terms)
    recommendation_expr = linear_sum(recommendation_terms)
    stability_expr = linear_sum(stability_terms)
    if allow_red and snapshot.config.maxRedViolations is not None:
        model.add(red_expr <= snapshot.config.maxRedViolations)
    if snapshot.config.maxChanges is not None and stability_terms:
        model.add(stability_expr <= snapshot.config.maxChanges)

    stages: list[tuple[str, str, Expr]] = [
        ("minimal-relaxation", "Bestätigungspflichtige Ausnahmen", red_expr),
    ]
    if snapshot.config.goal == "minimal-change":
        stages.append(("stability", "Änderungen gegenüber Warmstart", stability_expr))
    stages.extend(
        [
            ("quality-orange", "Orange Regelhinweise", orange_expr),
            ("quality-yellow", "Gelbe Regelhinweise", yellow_expr),
            ("preferences", "Negative Wunscherfüllung", recommendation_expr),
            ("fairness-max", "Maximale persönliche BD-Sollabweichung", max_bd_deviation),
            ("fairness-total", "Gesamte BD-Sollabweichung", total_bd_deviation),
            ("fairness-load", "Spannweite der gewichteten Gesamtlast", total_load_spread),
            ("fairness-weekend", "Spannweite der Wochenenddienste", weekend_load_spread),
        ]
    )
    if snapshot.config.goal != "minimal-change":
        stages.append(("stability", "Änderungen gegenüber Warmstart", stability_expr))

    return ModelContext(
        model=model,
        snapshot=snapshot,
        allow_red=allow_red,
        x=x,
        slot_vars=slot_vars,
        candidate_level=candidate_level,
        candidate_score=candidate_score,
        fixed=fixed,
        assumption_vars=assumption_vars,
        assumption_descriptions=assumption_descriptions,
        red_expr=red_expr,
        orange_expr=orange_expr,
        yellow_expr=yellow_expr,
        recommendation_expr=recommendation_expr,
        stability_expr=stability_expr,
        max_bd_deviation=max_bd_deviation,
        total_bd_deviation=total_bd_deviation,
        total_load_spread=total_load_spread,
        weekend_load_spread=weekend_load_spread,
        objective_stages=[] if diagnostic else stages,
    )


def configure_solver(snapshot: SolverSnapshot, budget_seconds: float, *, diagnostic: bool = False) -> cp_model.CpSolver:
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.05, budget_seconds)
    solver.parameters.num_search_workers = 1 if diagnostic or snapshot.config.deterministic else 8
    solver.parameters.random_seed = snapshot.config.seed or seed_from(snapshot.requestFingerprint)
    solver.parameters.relative_gap_limit = 0.0 if diagnostic else snapshot.config.targetGapPermille / 1000.0
    solver.parameters.cp_model_presolve = True
    solver.parameters.symmetry_level = 2
    solver.parameters.use_lns = True
    solver.parameters.log_search_progress = False
    return solver


def seed_from(value: str) -> int:
    state = 2166136261
    for character in value:
        state ^= ord(character)
        state = (state * 16777619) & 0xFFFFFFFF
    return state % 2_147_483_647


def apply_hint(context: ModelContext, assignments: Sequence[Assignment]) -> None:
    selected = {(item.dateIso, item.role): item.staffId for item in assignments}
    context.model.clear_hints()
    for key, candidates in context.slot_vars.items():
        chosen = selected.get(key)
        for staff_id, variable in candidates:
            context.model.add_hint(variable, int(staff_id == chosen))


def assignments_from_solution(context: ModelContext, solver: cp_model.CpSolver) -> list[Assignment]:
    assignments: list[Assignment] = []
    for (date_iso, role), candidates in sorted(context.slot_vars.items()):
        if (date_iso, role) in context.fixed:
            continue
        for staff_id, variable in candidates:
            if solver.boolean_value(variable):
                assignments.append(Assignment(dateIso=date_iso, role=role, staffId=staff_id))
                break
    return assignments


def solve_model(
    context: ModelContext,
    budget_seconds: float,
    emit: Emit,
    cancel: Event,
    stage_id: str,
    started: float,
    *,
    diagnostic: bool = False,
) -> tuple[cp_model.CpSolver, Status]:
    solver = configure_solver(context.snapshot, budget_seconds, diagnostic=diagnostic)
    callback = ProgressCallback(emit, stage_id, cancel, started)
    status = solver.solve(context.model, callback)
    return solver, status


def stage_result(
    stage_id: str,
    title: str,
    status: Status,
    solver: cp_model.CpSolver,
    wall_ms: int,
) -> StageResult:
    label = status_name(solver, status)
    if has_solution(status):
        value: float | None = float(solver.objective_value)
        bound: float | None = float(solver.best_objective_bound)
        gap: float | None = relative_gap(value, bound)
    else:
        value = bound = gap = None
    return StageResult(
        id=stage_id,
        title=title,
        status=label,
        value=value,
        bestBound=bound,
        relativeGap=gap,
        wallTimeMs=wall_ms,
    )


def lexicographic_solve(
    context: ModelContext,
    deadline: float,
    emit: Emit,
    cancel: Event,
    started: float,
    *,
    hint: Sequence[Assignment] | None = None,
) -> tuple[cp_model.CpSolver | None, Status, list[StageResult]]:
    if hint:
        apply_hint(context, hint)
    stages: list[StageResult] = []
    last_solver: cp_model.CpSolver | None = None
    last_status: Status = cp_model.UNKNOWN
    total = len(context.objective_stages)
    for index, (stage_id, title, expression) in enumerate(context.objective_stages):
        if cancel.is_set() or time.monotonic() >= deadline:
            break
        context.model.clear_objective()
        context.model.minimize(expression)
        remaining = max(0.05, deadline - time.monotonic())
        budget = max(0.1, remaining / max(1, total - index))
        emit(
            {
                "stage": stage_id,
                "phase": "perfect",
                "status": "running",
                "objectiveLevel": index,
                "message": f"Lexikografische Zielstufe {index + 1}/{total}: {title}.",
            }
        )
        stage_started = time.monotonic()
        solver, status = solve_model(context, budget, emit, cancel, stage_id, started)
        wall_ms = int((time.monotonic() - stage_started) * 1000)
        stages.append(stage_result(stage_id, title, status, solver, wall_ms))
        last_solver, last_status = solver, status
        if not has_solution(status):
            break
        value = int(solver.value(expression))
        exact_proof = status == cp_model.OPTIMAL and context.snapshot.config.targetGapPermille == 0
        context.model.add(expression == value if exact_proof else expression <= value)
        emit(
            {
                "stage": stage_id,
                "phase": "perfect",
                "status": status_name(solver, status),
                "solverStatus": status_name(solver, status),
                "objectiveLevel": index,
                "objectiveValue": float(solver.objective_value),
                "bestBound": float(solver.best_objective_bound),
                "relativeGap": relative_gap(float(solver.objective_value), float(solver.best_objective_bound)),
                "branches": int(solver.num_branches),
                "conflicts": int(solver.num_conflicts),
                "deterministicTime": float(solver.deterministic_time),
                "message": f"Zielstufe {title}: {status_name(solver, status)}.",
            }
        )
    return last_solver, last_status, stages


def diagnose_infeasibility(snapshot: SolverSnapshot, allow_red: bool, budget_seconds: float) -> list[ConflictItem]:
    context = build_model(snapshot, allow_red=allow_red, diagnostic=True)
    solver = configure_solver(snapshot, max(0.1, budget_seconds), diagnostic=True)
    status = solver.solve(context.model)
    if status != cp_model.INFEASIBLE:
        return []
    core_indexes = [
        index
        for index in solver.sufficient_assumptions_for_infeasibility()
        if index in context.assumption_vars
    ]
    active = [context.assumption_vars[index] for index in core_indexes]
    deadline = time.monotonic() + max(0.0, budget_seconds - solver.wall_time)
    index = 0
    while index < len(active) and time.monotonic() < deadline:
        trial = active[:index] + active[index + 1 :]
        context.model.clear_assumptions()
        context.model.add_assumptions(trial)
        trial_solver = configure_solver(
            snapshot,
            min(0.5, max(0.05, deadline - time.monotonic())),
            diagnostic=True,
        )
        trial_status = trial_solver.solve(context.model)
        if trial_status == cp_model.INFEASIBLE:
            active = trial
        else:
            index += 1
    active_indexes = {literal.index for literal in active}
    return [
        context.assumption_descriptions[index]
        for index in core_indexes
        if index in active_indexes
    ][:24]


def relaxation_suggestions(core: Sequence[ConflictItem]) -> list[RelaxationSuggestion]:
    suggestions: dict[str, RelaxationSuggestion] = {}
    for item in core:
        if item.id.startswith("PERSON_MAX_"):
            suggestion = RelaxationSuggestion(
                id=f"relax:{item.id}",
                label=f"{item.title} gezielt erhöhen oder eine bestehende Zuordnung zur Neuplanung freigeben.",
                severity=3,
            )
        elif item.id.startswith("WEEKDAY_HG_BEFORE_OWN_BD"):
            suggestion = RelaxationSuggestion(
                id=f"relax:{item.id}",
                label=f"Werktägliche HG-vor-BD-Folge einmalig als rote Ausnahme prüfen: {item.detail or ''}".strip(),
                severity=2,
            )
        elif item.id.startswith("SLOT_COVERAGE"):
            suggestion = RelaxationSuggestion(
                id=f"repair:{item.id}",
                label=f"Kandidatendomäne für {item.title} erweitern oder angrenzende Fixpunkte freigeben.",
                severity=4,
            )
        else:
            continue
        suggestions[suggestion.id] = suggestion
    return list(suggestions.values())[:12]


def assignment_score(context: ModelContext, assignments: Sequence[Assignment]) -> tuple[int, ...]:
    selected = {(item.dateIso, item.role): item.staffId for item in assignments}
    red = orange = yellow = recommendation = stability = 0
    warm = warm_start_map(context.snapshot)
    bd_counts: defaultdict[str, int] = defaultdict(int)
    total_counts: defaultdict[str, int] = defaultdict(int)
    weekend_counts: defaultdict[str, int] = defaultdict(int)
    for key, staff_id in selected.items():
        level = context.candidate_level.get((key[0], key[1], staff_id), "green")
        red += int(level == "red")
        orange += int(level == "orange")
        yellow += int(level == "yellow")
        recommendation -= context.candidate_score.get((key[0], key[1], staff_id), 0)
        stability += int(warm.get(key) not in (None, staff_id))
    for (date_iso, role), staff_id in {**context.fixed, **selected}.items():
        total_counts[staff_id] += 1
        bd_counts[staff_id] += int(role == "bd")
        weekend_counts[staff_id] += int(date.fromisoformat(date_iso).isoweekday() in {5, 6, 7})
    deviations = [abs(bd_counts[item.id] - item.bdTarget) for item in context.snapshot.staff]
    totals = [total_counts[item.id] for item in context.snapshot.staff]
    weekends = [weekend_counts[item.id] for item in context.snapshot.staff]
    base = (red, orange, yellow, recommendation)
    fairness = (
        max(deviations, default=0),
        sum(deviations),
        max(totals, default=0) - min(totals, default=0),
        max(weekends, default=0) - min(weekends, default=0),
    )
    return (red, stability, orange, yellow, recommendation, *fairness) if context.snapshot.config.goal == "minimal-change" else (*base, *fairness, stability)


def destroy_slots(
    operator: str,
    snapshot: SolverSnapshot,
    incumbent: Sequence[Assignment],
    size: int,
    rng: random.Random,
) -> set[SlotKey]:
    values = list(incumbent)
    if not values:
        return set()
    if operator == "weakest":
        levels = {
            (slot.dateIso, slot.role, candidate.staffId): LEVEL_RANK[candidate.level]
            for slot in snapshot.slots
            for candidate in slot.candidates
        }
        chosen = sorted(
            values,
            key=lambda item: levels.get((item.dateIso, item.role, item.staffId), 0),
            reverse=True,
        )[:size]
    elif operator == "weekend":
        groups: defaultdict[int, list[Assignment]] = defaultdict(list)
        for item in values:
            day = date.fromisoformat(item.dateIso)
            if day.isoweekday() in {5, 6, 7}:
                groups[day.toordinal() - day.weekday()].append(item)
        chosen = list(rng.choice(list(groups.values()))) if groups else []
        remaining = [item for item in values if item not in chosen]
        rng.shuffle(remaining)
        chosen.extend(remaining[: max(0, size - len(chosen))])
    elif operator == "person-load":
        groups_by_person: defaultdict[str, list[Assignment]] = defaultdict(list)
        for item in values:
            groups_by_person[item.staffId].append(item)
        person = max(groups_by_person, key=lambda staff_id: len(groups_by_person[staff_id]))
        chosen = list(groups_by_person[person])
        remaining = [item for item in values if item.staffId != person]
        rng.shuffle(remaining)
        chosen.extend(remaining[: max(0, size - len(chosen))])
    elif operator == "time-window":
        dates = sorted({item.dateIso for item in values})
        start = rng.randrange(max(1, len(dates)))
        window = set(dates[start : start + max(2, math.ceil(size / 2))])
        chosen = [item for item in values if item.dateIso in window]
    else:
        chosen = list(values)
        rng.shuffle(chosen)
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
    if not snapshot.config.exactLns or not incumbent or time.monotonic() >= deadline:
        return incumbent, metadata
    operators = ["weakest", "weekend", "person-load", "time-window", "random"]
    learning: dict[str, dict[str, float]] = {
        operator: {"uses": 0.0, "reward": 0.0, "costMs": 0.0, "weight": 1.0}
        for operator in operators
    }
    rng = random.Random(snapshot.config.seed or seed_from(snapshot.requestFingerprint))
    context_for_score = build_model(snapshot, allow_red=allow_red)
    incumbent_score = assignment_score(context_for_score, incumbent)
    stagnation = 0

    while time.monotonic() < deadline and not cancel.is_set():
        metadata.rounds += 1
        untried = [operator for operator in operators if learning[operator]["uses"] == 0]
        if untried:
            operator = rng.choice(untried)
        else:
            total_uses = sum(learning[item]["uses"] for item in operators)
            operator = max(
                operators,
                key=lambda item: learning[item]["weight"]
                * (learning[item]["reward"] / max(1.0, learning[item]["costMs"]))
                + math.sqrt(2.0 * math.log(max(2.0, total_uses)) / learning[item]["uses"]),
            )
        fraction = min(1.0, stagnation / 8.0)
        size = round(
            snapshot.config.lnsMinSize
            + (snapshot.config.lnsMaxSize - snapshot.config.lnsMinSize)
            * (0.25 + 0.75 * fraction)
            * rng.random()
        )
        neighborhood = destroy_slots(operator, snapshot, incumbent, size, rng)
        if not neighborhood:
            break
        context = build_model(snapshot, allow_red=allow_red)
        selected = {(item.dateIso, item.role): item.staffId for item in incumbent}
        for key, staff_id in selected.items():
            if key in neighborhood:
                continue
            variable = context.x.get((key[0], key[1], staff_id))
            if variable is not None:
                context.model.add(variable == 1)
        apply_hint(context, incumbent)
        scalar = (
            1_000_000_000_000 * context.red_expr
            + 1_000_000_000 * context.orange_expr
            + 10_000_000 * context.yellow_expr
            + context.recommendation_expr
            + 10_000 * context.max_bd_deviation
            + 1_000 * context.total_bd_deviation
            + 10 * context.total_load_spread
            + context.weekend_load_spread
            + context.stability_expr
        )
        context.model.minimize(scalar)
        budget = min(2.0, max(0.05, deadline - time.monotonic()))
        started = time.monotonic()
        solver = configure_solver(snapshot, budget)
        status = solver.solve(context.model)
        cost_ms = max(0.1, (time.monotonic() - started) * 1000)
        metadata.neighborhoods += 1
        learning[operator]["uses"] += 1
        learning[operator]["costMs"] += cost_ms
        if has_solution(status):
            candidate = assignments_from_solution(context, solver)
            candidate_score = assignment_score(context_for_score, candidate)
            if candidate_score < incumbent_score:
                incumbent = candidate
                incumbent_score = candidate_score
                metadata.improvements += 1
                metadata.accepted += 1
                learning[operator]["reward"] += 33
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
                learning[operator]["reward"] += 1
                stagnation += 1
        else:
            metadata.rejected += 1
            stagnation += 1
        if metadata.rounds % 8 == 0:
            for item in operators:
                observed = learning[item]["reward"] / max(1.0, learning[item]["uses"])
                learning[item]["weight"] = 0.65 * learning[item]["weight"] + 0.35 * observed
        if stagnation >= 14:
            metadata.restarts += 1
            stagnation = 4

    metadata.operatorLearning = {
        operator: {
            "uses": int(values["uses"]),
            "reward": round(values["reward"], 3),
            "costMs": round(values["costMs"], 2),
            "weight": round(values["weight"], 4),
            "rewardPerSecond": round(values["reward"] / max(0.001, values["costMs"] / 1000), 3),
        }
        for operator, values in learning.items()
    }
    return incumbent, metadata


def generate_alternatives(
    snapshot: SolverSnapshot,
    primary: list[Assignment],
    allow_red: bool,
    deadline: float,
    emit: Emit,
    cancel: Event,
) -> list[Alternative]:
    alternatives: list[Alternative] = []
    prior_solutions: list[list[Assignment]] = [primary]
    score_context = build_model(snapshot, allow_red=allow_red)
    primary_score = assignment_score(score_context, primary)
    while (
        len(alternatives) < max(0, snapshot.config.alternatives - 1)
        and time.monotonic() < deadline
        and not cancel.is_set()
    ):
        context = build_model(snapshot, allow_red=allow_red)
        context.model.add(context.red_expr <= primary_score[0])
        red_offset = 2 if snapshot.config.goal == "minimal-change" else 1
        context.model.add(context.orange_expr <= primary_score[red_offset])
        context.model.add(context.yellow_expr <= primary_score[red_offset + 1] + 1)
        all_distance_terms: list[Expr] = []
        for prior in prior_solutions:
            differences: list[Expr] = []
            for item in prior:
                selected = context.x.get((item.dateIso, item.role, item.staffId))
                if selected is not None:
                    differences.append(1 - selected)
            if differences:
                distance = linear_sum(differences)
                context.model.add(distance >= snapshot.config.minimumAlternativeDistance)
                all_distance_terms.extend(differences)
        context.model.maximize(linear_sum(all_distance_terms))
        solver = configure_solver(snapshot, min(3.0, max(0.1, deadline - time.monotonic())))
        status = solver.solve(context.model)
        if not has_solution(status):
            break
        assignments = assignments_from_solution(context, solver)
        prior_solutions.append(assignments)
        metadata = SolverMetadata(
            objectiveValue=float(solver.objective_value),
            bestBound=float(solver.best_objective_bound),
            relativeGap=relative_gap(float(solver.objective_value), float(solver.best_objective_bound)),
            conflicts=int(solver.num_conflicts),
            branches=int(solver.num_branches),
            deterministicTime=float(solver.deterministic_time),
            wallTimeMs=int(solver.wall_time * 1000),
            deterministic=snapshot.config.deterministic,
        )
        alternatives.append(
            Alternative(
                status=status_name(solver, status),
                assignments=assignments,
                metadata=metadata,
            )
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


def solver_version() -> str:
    return distribution_version("ortools")


def empty_result(
    snapshot: SolverSnapshot,
    status: SolverStatus,
    started: float,
    *,
    solver: cp_model.CpSolver | None = None,
    stages: list[StageResult] | None = None,
    core: list[ConflictItem] | None = None,
    suggestions: list[RelaxationSuggestion] | None = None,
) -> SolverResult:
    metadata = SolverMetadata(
        conflicts=int(solver.num_conflicts) if solver is not None else 0,
        branches=int(solver.num_branches) if solver is not None else 0,
        deterministicTime=float(solver.deterministic_time) if solver is not None else 0.0,
        wallTimeMs=int((time.monotonic() - started) * 1000),
        deterministic=snapshot.config.deterministic,
        lexicographicStages=stages or [],
    )
    return SolverResult(
        rulesetVersion=snapshot.rulesetVersion,
        solverVersion=solver_version(),
        status=status,
        baselineFingerprint=snapshot.baselineFingerprint,
        assignments=[],
        conflictCore=core or [],
        relaxationSuggestions=suggestions or [],
        metadata=metadata,
    )


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

    strict_context = build_model(snapshot, allow_red=False)
    strict_budget = max(0.5, min((deadline - time.monotonic()) * 0.25, 45.0))
    strict_solver, strict_status = solve_model(
        strict_context,
        strict_budget,
        emit,
        cancel,
        "strict-feasibility",
        started,
    )
    strict_label = status_name(strict_solver, strict_status)
    emit(
        {
            "stage": "strict-feasibility",
            "phase": "search",
            "status": strict_label,
            "solverStatus": strict_label,
            "branches": int(strict_solver.num_branches),
            "conflicts": int(strict_solver.num_conflicts),
            "message": "Null-Rot-Machbarkeitsprüfung abgeschlossen.",
        }
    )

    core: list[ConflictItem] = []
    suggestions: list[RelaxationSuggestion] = []
    allow_red = False
    hint: list[Assignment] | None = None
    if has_solution(strict_status):
        hint = assignments_from_solution(strict_context, strict_solver)
    elif strict_status == cp_model.INFEASIBLE:
        diagnostic_budget = max(0.25, min(10.0, (deadline - time.monotonic()) * 0.12))
        core = diagnose_infeasibility(snapshot, allow_red=False, budget_seconds=diagnostic_budget)
        suggestions = relaxation_suggestions(core)
        emit(
            {
                "stage": "explain",
                "phase": "certify",
                "status": "INFEASIBLE",
                "solverStatus": "INFEASIBLE",
                "conflictCoreSize": len(core),
                "message": f"Reduzierter Konfliktkern mit {len(core)} Bedingungen bestimmt.",
            }
        )
        if snapshot.config.allowRedFallback:
            allow_red = True
        else:
            return empty_result(
                snapshot,
                "INFEASIBLE",
                started,
                solver=strict_solver,
                core=core,
                suggestions=suggestions,
            )
    elif snapshot.config.allowRedFallback:
        allow_red = True
    else:
        return empty_result(snapshot, strict_label, started, solver=strict_solver)

    initial_context = build_model(snapshot, allow_red=allow_red)
    if hint is None and snapshot.warmStarts:
        hint = snapshot.warmStarts[0].assignments
    initial_deadline = min(deadline, time.monotonic() + max(0.5, (deadline - time.monotonic()) * 0.48))
    initial_solver, initial_status, initial_stages = lexicographic_solve(
        initial_context,
        initial_deadline,
        emit,
        cancel,
        started,
        hint=hint,
    )
    if initial_solver is None or not has_solution(initial_status):
        return empty_result(
            snapshot,
            "UNKNOWN" if initial_solver is None else status_name(initial_solver, initial_status),
            started,
            solver=initial_solver,
            stages=initial_stages,
            core=core,
            suggestions=suggestions,
        )

    incumbent = assignments_from_solution(initial_context, initial_solver)
    lns_deadline = min(deadline, time.monotonic() + max(0.0, (deadline - time.monotonic()) * 0.55))
    incumbent, lns_metadata = adaptive_exact_lns(
        snapshot,
        incumbent,
        allow_red,
        lns_deadline,
        emit,
        cancel,
    )

    # A post-LNS proof pass is mandatory. Exact-LNS may improve the incumbent,
    # but cannot inherit a prior global proof after changing the assignment.
    final_context = build_model(snapshot, allow_red=allow_red)
    final_solver, final_status, final_stages = lexicographic_solve(
        final_context,
        deadline,
        emit,
        cancel,
        started,
        hint=incumbent,
    )
    if final_solver is not None and has_solution(final_status):
        primary = assignments_from_solution(final_context, final_solver)
        proof_stages = final_stages
        proof_solver = final_solver
    else:
        primary = incumbent
        proof_stages = initial_stages
        proof_solver = initial_solver

    alternatives = generate_alternatives(
        snapshot,
        primary,
        allow_red,
        deadline,
        emit,
        cancel,
    )
    proof_complete = (
        snapshot.config.targetGapPermille == 0
        and len(proof_stages) == len(final_context.objective_stages)
        and all(stage.status == "OPTIMAL" and stage.relativeGap == 0 for stage in proof_stages)
    )
    result_status: SolverStatus = "OPTIMAL" if proof_complete else "FEASIBLE"
    final_stage = proof_stages[-1] if proof_stages else None
    metadata = SolverMetadata(
        objectiveValue=float(final_stage.value) if final_stage?.value is not None else None,
        bestBound=float(final_stage.bestBound) if final_stage?.bestBound is not None else None,
        relativeGap=final_stage.relativeGap if final_stage else None,
        conflicts=int(proof_solver.num_conflicts),
        branches=int(proof_solver.num_branches),
        deterministicTime=float(proof_solver.deterministic_time),
        wallTimeMs=int((time.monotonic() - started) * 1000),
        deterministic=snapshot.config.deterministic,
        lexicographicStages=proof_stages,
        exactLns=lns_metadata,
    )
    emit(
        {
            "stage": "audit",
            "phase": "audit",
            "status": result_status,
            "solverStatus": result_status,
            "objectiveValue": metadata.objectiveValue,
            "bestBound": metadata.bestBound,
            "relativeGap": metadata.relativeGap,
            "branches": metadata.branches,
            "conflicts": metadata.conflicts,
            "message": "Nativer Solverlauf abgeschlossen; unabhängiger Browseraudit folgt.",
        }
    )
    return SolverResult(
        rulesetVersion=snapshot.rulesetVersion,
        solverVersion=solver_version(),
        status=result_status,
        baselineFingerprint=snapshot.baselineFingerprint,
        assignments=primary,
        alternatives=alternatives,
        conflictCore=core,
        relaxationSuggestions=suggestions,
        metadata=metadata,
    )
