from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


Role = Literal["bd", "hg"]
Level = Literal["green", "yellow", "orange", "red", "gray"]
SolverStatus = Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "MODEL_INVALID", "UNKNOWN"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=False)


class Limits(StrictModel):
    maxBd: int | None = Field(default=None, ge=0, le=62)
    maxHg: int | None = Field(default=None, ge=0, le=62)
    maxTotal: int | None = Field(default=None, ge=0, le=124)


class RoleProperties(StrictModel):
    canBd: bool = True
    canHg: bool = False
    canSaturdayBd: bool = False
    category: str | None = None
    roleLabel: str | None = None


class Staff(StrictModel):
    id: str = Field(min_length=1, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    name: str | None = Field(default=None, max_length=160)
    short: str | None = Field(default=None, max_length=80)
    category: str | None = Field(default=None, max_length=40)
    bdTarget: int = Field(default=0, ge=0, le=31)
    limits: Limits = Field(default_factory=Limits)
    roleProperties: dict[str, RoleProperties] = Field(default_factory=dict)


class Candidate(StrictModel):
    staffId: str = Field(min_length=1, max_length=50)
    level: Level
    canSelect: bool
    confirmationType: str | None = Field(default=None, max_length=40)
    recommendationScore: int = Field(default=0, ge=-100_000, le=100_000)
    recommendationVector: list[int] = Field(default_factory=list, max_length=32)
    reasons: list[str] = Field(default_factory=list, max_length=64)


class Slot(StrictModel):
    dateIso: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    role: Role
    fixedStaffId: str | None = Field(default=None, max_length=50)
    candidates: list[Candidate] = Field(default_factory=list, max_length=128)


class Relation(StrictModel):
    id: str = Field(min_length=1, max_length=80)
    dateIso: str | None = None
    roles: list[Role] | None = None
    leftDateIso: str | None = None
    rightDateIso: str | None = None
    role: Role | None = None
    leftRole: Role | None = None
    rightRole: Role | None = None


class FixedAssignment(StrictModel):
    dateIso: str
    role: Role
    staffId: str


class Assignment(StrictModel):
    dateIso: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    role: Role
    staffId: str = Field(min_length=1, max_length=50)


class WarmStart(StrictModel):
    source: str = Field(min_length=1, max_length=80)
    assignments: list[Assignment] = Field(min_length=1, max_length=62)

    @model_validator(mode="after")
    def unique_slots(self) -> WarmStart:
        keys = [(item.dateIso, item.role) for item in self.assignments]
        if len(keys) != len(set(keys)):
            raise ValueError("warm-start assignments must contain unique slot keys")
        return self


class RelaxationPolicy(StrictModel):
    absence: bool = True
    hardMaximum: bool = False
    organizational: bool = True


class SolverConfig(StrictModel):
    mode: Literal["quick", "balanced", "intensive", "proof"] = "balanced"
    goal: Literal["new-plan", "repair", "minimal-change"] = "new-plan"
    timeBudgetMs: int = Field(default=60_000, ge=10_000, le=900_000)
    allowRedFallback: bool = False
    maxRedViolations: int | None = Field(default=None, ge=0, le=62)
    alternatives: int = Field(default=3, ge=1, le=5)
    minimumAlternativeDistance: int = Field(default=5, ge=1, le=20)
    targetGapPermille: int = Field(default=20, ge=0, le=500)
    deterministic: bool = False
    exactLns: bool = True
    lnsMinSize: int = Field(default=8, ge=4, le=30)
    lnsMaxSize: int = Field(default=24, ge=8, le=62)
    maxChanges: int | None = Field(default=None, ge=0, le=62)
    optimizationFocus: str = Field(default="balanced", max_length=40)
    seed: int = Field(default=0, ge=0, le=2_147_483_647)
    relaxationPolicy: RelaxationPolicy = Field(default_factory=RelaxationPolicy)

    @model_validator(mode="after")
    def valid_lns_range(self) -> SolverConfig:
        if self.lnsMaxSize < self.lnsMinSize:
            raise ValueError("lnsMaxSize must be greater than or equal to lnsMinSize")
        return self


class SolverSnapshot(StrictModel):
    schemaVersion: Literal[9]
    rulesetVersion: str = Field(min_length=1, max_length=40)
    generatedAt: str
    year: int = Field(ge=2000, le=2200)
    month: int = Field(ge=1, le=12)
    dates: list[str] = Field(min_length=28, max_length=31)
    staff: list[Staff] = Field(min_length=1, max_length=128)
    slots: list[Slot] = Field(min_length=56, max_length=62)
    relations: list[Relation] = Field(default_factory=list, max_length=512)
    fixedAssignments: list[FixedAssignment] = Field(default_factory=list, max_length=62)
    warmStarts: list[WarmStart] = Field(default_factory=list, max_length=8)
    baseline: dict[str, Any]
    config: SolverConfig
    baselineFingerprint: str = Field(min_length=3, max_length=180)
    configFingerprint: str = Field(min_length=3, max_length=180)
    requestFingerprint: str = Field(min_length=3, max_length=180)

    @model_validator(mode="after")
    def validate_unique_scope(self) -> SolverSnapshot:
        date_set = set(self.dates)
        if self.dates != sorted(date_set):
            raise ValueError("dates must be sorted and unique")
        keys = [(slot.dateIso, slot.role) for slot in self.slots]
        if len(keys) != len(set(keys)):
            raise ValueError("slot keys must be unique")
        staff_ids = {person.id for person in self.staff}
        if len(staff_ids) != len(self.staff):
            raise ValueError("staff ids must be unique")
        slot_keys = set(keys)
        for slot in self.slots:
            if slot.dateIso not in date_set:
                raise ValueError("slot date outside planning horizon")
            if slot.fixedStaffId and slot.fixedStaffId not in staff_ids:
                raise ValueError("fixed assignment references unknown staff")
            candidate_ids = [candidate.staffId for candidate in slot.candidates]
            if len(candidate_ids) != len(set(candidate_ids)):
                raise ValueError("candidate ids must be unique per slot")
            if any(candidate_id not in staff_ids for candidate_id in candidate_ids):
                raise ValueError("candidate references unknown staff")
        for warm_start in self.warmStarts:
            for assignment in warm_start.assignments:
                if (assignment.dateIso, assignment.role) not in slot_keys:
                    raise ValueError("warm-start assignment references unknown slot")
                if assignment.staffId not in staff_ids:
                    raise ValueError("warm-start assignment references unknown staff")
        return self


class StageResult(StrictModel):
    id: str
    title: str
    status: SolverStatus
    value: int | float | None = None
    bestBound: int | float | None = None
    relativeGap: float | None = None
    wallTimeMs: int = 0


class ExactLnsMetadata(StrictModel):
    enabled: bool = False
    rounds: int = 0
    neighborhoods: int = 0
    improvements: int = 0
    accepted: int = 0
    rejected: int = 0
    restarts: int = 0
    operatorLearning: dict[str, dict[str, float | int]] = Field(default_factory=dict)


class SolverMetadata(StrictModel):
    objectiveValue: float | None = None
    bestBound: float | None = None
    relativeGap: float | None = None
    conflicts: int = 0
    branches: int = 0
    deterministicTime: float = 0.0
    wallTimeMs: int = 0
    deterministic: bool = False
    lexicographicStages: list[StageResult] = Field(default_factory=list)
    exactLns: ExactLnsMetadata = Field(default_factory=ExactLnsMetadata)


class ConflictItem(StrictModel):
    id: str
    title: str
    detail: str | None = None


class RelaxationSuggestion(StrictModel):
    id: str
    label: str
    severity: int = 1


class Alternative(StrictModel):
    status: SolverStatus
    assignments: list[Assignment]
    metadata: SolverMetadata


class SolverResult(StrictModel):
    schemaVersion: Literal[9] = 9
    rulesetVersion: str
    solverVersion: str
    status: SolverStatus
    baselineFingerprint: str
    assignments: list[Assignment]
    alternatives: list[Alternative] = Field(default_factory=list)
    conflictCore: list[ConflictItem] = Field(default_factory=list)
    relaxationSuggestions: list[RelaxationSuggestion] = Field(default_factory=list)
    metadata: SolverMetadata
