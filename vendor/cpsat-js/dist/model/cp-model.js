import { create } from '@bufbuild/protobuf';
import { CpModelProtoSchema, ConstraintProtoSchema, IntegerVariableProtoSchema, AllDifferentConstraintProtoSchema, BoolArgumentProtoSchema, NoOverlapConstraintProtoSchema, CircuitConstraintProtoSchema, LinearConstraintProtoSchema, IntervalConstraintProtoSchema, CpObjectiveProtoSchema, PartialVariableAssignmentSchema, } from '../generated/cp_model_pb.js';
import { IntVar, BoolVar } from './int-var.js';
import { BoundedLinearExpression, toLinearExpr } from './linear-expr.js';
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
export class CpModel {
    proto;
    /**
     * Hinted values, keyed by variable index.
     *
     * A Map rather than the proto's two parallel arrays because CpModelProto requires
     * the hinted indices to be unique. Keyed this way, hinting one variable twice
     * cannot be expressed, so it cannot produce an invalid model.
     */
    hints = new Map();
    constructor(name) {
        this.proto = create(CpModelProtoSchema, { name: name ?? '' });
    }
    // ── Variable creation ──
    newIntVar(lb, ub, name) {
        const index = this.proto.variables.length;
        this.proto.variables.push(create(IntegerVariableProtoSchema, {
            name,
            domain: [BigInt(lb), BigInt(ub)],
        }));
        return new IntVar(index, name);
    }
    newBoolVar(name) {
        const index = this.proto.variables.length;
        this.proto.variables.push(create(IntegerVariableProtoSchema, {
            name,
            domain: [0n, 1n],
        }));
        return new BoolVar(index, name);
    }
    newConstant(value) {
        const v = BigInt(value);
        const name = `const_${v}`;
        const index = this.proto.variables.length;
        this.proto.variables.push(create(IntegerVariableProtoSchema, {
            name,
            domain: [v, v],
        }));
        return new IntVar(index, name);
    }
    // ── Interval creation ──
    newIntervalVar(start, size, end, name) {
        const ct = this.addConstraintProto();
        ct.name = name;
        ct.constraint = {
            case: 'interval',
            value: create(IntervalConstraintProtoSchema, {
                start: toLinearExpr(start).toProto(),
                size: toLinearExpr(size).toProto(),
                end: toLinearExpr(end).toProto(),
            }),
        };
        return new IntervalVar(this.proto.constraints.length - 1, name);
    }
    // ── Constraints ──
    /** Add a bounded linear constraint: lb <= expr <= ub */
    add(bounded) {
        const ct = this.addConstraintProto();
        const vars = [];
        const coeffs = [];
        for (const [varIdx, coeff] of bounded.expr.terms) {
            vars.push(varIdx);
            coeffs.push(coeff);
        }
        ct.constraint = {
            case: 'linear',
            value: create(LinearConstraintProtoSchema, {
                vars,
                coeffs,
                domain: [bounded.lb - bounded.expr.offset, bounded.ub - bounded.expr.offset],
            }),
        };
        return new Constraint(ct);
    }
    addLinearConstraint(expr, lb, ub) {
        const linearExpr = toLinearExpr(expr);
        return this.add(new BoundedLinearExpression(linearExpr, BigInt(lb), BigInt(ub)));
    }
    addAllDifferent(exprs) {
        const ct = this.addConstraintProto();
        ct.constraint = {
            case: 'allDiff',
            value: create(AllDifferentConstraintProtoSchema, {
                exprs: exprs.map((e) => toLinearExpr(e).toProto()),
            }),
        };
        return new Constraint(ct);
    }
    addBoolOr(literals) {
        const ct = this.addConstraintProto();
        ct.constraint = {
            case: 'boolOr',
            value: create(BoolArgumentProtoSchema, {
                literals: literals.map((lit) => (typeof lit === 'number' ? lit : lit.index)),
            }),
        };
        return new Constraint(ct);
    }
    addBoolAnd(literals) {
        const ct = this.addConstraintProto();
        ct.constraint = {
            case: 'boolAnd',
            value: create(BoolArgumentProtoSchema, {
                literals: literals.map((lit) => (typeof lit === 'number' ? lit : lit.index)),
            }),
        };
        return new Constraint(ct);
    }
    addNoOverlap(intervals) {
        const ct = this.addConstraintProto();
        ct.constraint = {
            case: 'noOverlap',
            value: create(NoOverlapConstraintProtoSchema, {
                intervals: intervals.map((iv) => iv.constraintIndex),
            }),
        };
        return new Constraint(ct);
    }
    addCircuit(arcs) {
        const tails = [];
        const heads = [];
        const literals = [];
        for (const [tail, head, lit] of arcs) {
            tails.push(tail);
            heads.push(head);
            literals.push(typeof lit === 'number' ? lit : lit.index);
        }
        const ct = this.addConstraintProto();
        ct.constraint = {
            case: 'circuit',
            value: create(CircuitConstraintProtoSchema, { tails, heads, literals }),
        };
        return new Constraint(ct);
    }
    // ── Objective ──
    minimize(expr) {
        this.setObjective(expr, false);
    }
    maximize(expr) {
        this.setObjective(expr, true);
    }
    // ── Hints ──
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
    addHint(variable, value) {
        this.hints.set(variable.index, BigInt(value));
    }
    /** Forget every hint added so far. */
    clearHints() {
        this.hints.clear();
    }
    // ── Serialization ──
    toProto() {
        // Materialised here rather than on each addHint so that clearing hints really
        // does leave the proto as it was, and so repeated calls stay idempotent.
        this.proto.solutionHint = this.hints.size
            ? create(PartialVariableAssignmentSchema, {
                vars: [...this.hints.keys()],
                values: [...this.hints.values()],
            })
            : undefined;
        return this.proto;
    }
    // ── Internal ──
    addConstraintProto() {
        const ct = create(ConstraintProtoSchema, {});
        this.proto.constraints.push(ct);
        return ct;
    }
    setObjective(expr, maximize) {
        const linearExpr = toLinearExpr(expr);
        const vars = [];
        const coeffs = [];
        for (const [varIdx, coeff] of linearExpr.terms) {
            vars.push(varIdx);
            // For maximization, negate coefficients (CP-SAT always minimizes)
            coeffs.push(maximize ? -coeff : coeff);
        }
        this.proto.objective = create(CpObjectiveProtoSchema, {
            vars,
            coeffs,
            offset: maximize ? -Number(linearExpr.offset) : Number(linearExpr.offset),
            scalingFactor: maximize ? -1.0 : 1.0,
        });
    }
}
//# sourceMappingURL=cp-model.js.map