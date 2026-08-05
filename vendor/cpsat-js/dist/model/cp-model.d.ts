import { type CpModelProto } from '../generated/cp_model_pb.js';
import { IntVar, BoolVar, type LinearExprLike } from './int-var.js';
import { BoundedLinearExpression } from './linear-expr.js';
import { IntervalVar } from './interval-var.js';
import { Constraint } from './constraint.js';
/**
 * Builder for a CP-SAT model. Mirrors the Python CpModel API.
 *
 * Usage:
 *   const model = new CpModel();
 *   const x = model.newIntVar(0, 10, 'x');
 *   model.maximize(x);
 */
export declare class CpModel {
    private readonly proto;
    /**
     * Hinted values, keyed by variable index.
     *
     * A Map rather than the proto's two parallel arrays because CpModelProto requires
     * the hinted indices to be unique. Keyed this way, hinting one variable twice
     * cannot be expressed, so it cannot produce an invalid model.
     */
    private readonly hints;
    constructor(name?: string);
    newIntVar(lb: number | bigint, ub: number | bigint, name: string): IntVar;
    newBoolVar(name: string): BoolVar;
    newConstant(value: number | bigint): IntVar;
    newIntervalVar(start: LinearExprLike, size: LinearExprLike, end: LinearExprLike, name: string): IntervalVar;
    /** Add a bounded linear constraint: lb <= expr <= ub */
    add(bounded: BoundedLinearExpression): Constraint;
    addLinearConstraint(expr: LinearExprLike, lb: number | bigint, ub: number | bigint): Constraint;
    addAllDifferent(exprs: LinearExprLike[]): Constraint;
    addBoolOr(literals: (BoolVar | IntVar | number)[]): Constraint;
    addBoolAnd(literals: (BoolVar | IntVar | number)[]): Constraint;
    addNoOverlap(intervals: IntervalVar[]): Constraint;
    addCircuit(arcs: [number, number, BoolVar | IntVar | number][]): Constraint;
    minimize(expr: LinearExprLike): void;
    maximize(expr: LinearExprLike): void;
    /**
     * Suggest a value for a variable, tried before the search proper begins.
     *
     * A hint is advisory. It does not constrain anything: a wrong one costs search
     * time and nothing else, and cannot change the optimal value. So this is a way
     * to say "start from here", not a way to fix a variable — use `add(v.equals(n))`
     * for that.
     *
     * Hints may be partial, and usually should be. Naming the few variables that
     * decide a solution lets propagation derive the rest, which is both less work to
     * build and less to get wrong than spelling out every variable.
     */
    addHint(variable: IntVar, value: number | bigint): void;
    /** Forget every hint added so far. */
    clearHints(): void;
    toProto(): CpModelProto;
    private addConstraintProto;
    private setObjective;
}
//# sourceMappingURL=cp-model.d.ts.map