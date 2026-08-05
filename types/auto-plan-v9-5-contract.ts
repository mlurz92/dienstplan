export type AutoPlanRole = 'bd' | 'hg';
export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'MODEL_INVALID' | 'UNKNOWN' | 'ABORTED';

export interface AutoPlanSlot {
  readonly dateIso: string;
  readonly role: AutoPlanRole;
  readonly key: `${string}|${AutoPlanRole}`;
}

export interface LinearTerm {
  readonly 0: number;
  readonly 1: number;
}

export interface AssignmentVariable {
  readonly index: number;
  readonly name: string;
  readonly lb: 0;
  readonly ub: 1;
  readonly kind: 'assignment';
  readonly staffId: string;
  readonly slot: AutoPlanSlot;
}

export interface AuxiliaryVariable {
  readonly index: number;
  readonly name: string;
  readonly lb: number;
  readonly ub: number;
  readonly kind: 'auxiliary';
  readonly objective?: string;
  readonly staffId?: string;
}

export interface LinearConstraint {
  readonly id: string;
  readonly group: string;
  readonly terms: readonly LinearTerm[];
  readonly lb: number;
  readonly ub: number;
  readonly detail: string;
  readonly relaxable: boolean;
}

export interface ObjectiveComponent {
  readonly id: string;
  readonly label: string;
  readonly priority: number;
  readonly terms: readonly LinearTerm[];
  readonly constant: number;
}

export interface BooleanAutoPlanModel {
  readonly revision: 95;
  readonly id: 'v9.5-boolean-assignment-ir';
  readonly variables: readonly (AssignmentVariable | AuxiliaryVariable)[];
  readonly assignmentVariables: readonly AssignmentVariable[];
  readonly auxiliaryVariables: readonly AuxiliaryVariable[];
  readonly constraints: readonly LinearConstraint[];
  readonly components: Readonly<Record<string, ObjectiveComponent>>;
  readonly phaseOrder: readonly string[];
  readonly fingerprint: string;
}

export interface LexicographicPhaseTrace {
  readonly componentId: string | null;
  readonly label: string;
  readonly status: SolverStatus;
  readonly objectiveValue: number;
  readonly bestBound: number | null;
  readonly gap: number | null;
  readonly wallTimeMs: number;
  readonly proven: boolean;
}

export interface ModelCertification {
  readonly status:
    | 'MODEL_OPTIMAL_AUDITED'
    | 'BEST_FOUND_FEASIBLE'
    | 'HEURISTIC_WON_RULE_OBJECTIVE'
    | 'MODEL_OPTIMAL_AUDIT_NOT_CLEAN'
    | 'SOLVER_UNAVAILABLE_FALLBACK';
  readonly proven: boolean;
  readonly scope: 'v9.5-boolean-model' | 'none';
  readonly allPhasesOptimal?: boolean;
  readonly auditPassed?: boolean;
  readonly source?: string;
}

export interface LexicographicSolveResult {
  readonly status: SolverStatus;
  readonly solution: Readonly<Record<string, string>>;
  readonly trace: readonly LexicographicPhaseTrace[];
  readonly certified: boolean;
  readonly allOptimal: boolean;
  readonly wallTimeMs: number;
}
