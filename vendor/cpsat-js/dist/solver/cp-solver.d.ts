import { CpSolverStatus, type CpSolverResponse } from '../generated/cp_model_pb.js';
import type { CpModel } from '../model/cp-model.js';
import type { IntVar } from '../model/int-var.js';
export { CpSolverStatus };
export interface CpSolverOptions {
    /** Custom path resolver for the WASM binary */
    locateFile?: (path: string) => string;
}
interface CpSatModule {
    _solve(modelPtr: number, modelLen: number, paramsPtr: number, paramsLen: number, observe: number): number;
    _get_result_ptr(): number;
    _free_result(): void;
    _solution_count(): number;
    _solution_ptr(index: number): number;
    _solution_len(index: number): number;
    _malloc(size: number): number;
    _free(ptr: number): void;
    HEAPU8: Uint8Array;
    /** Where the C++ observer reaches for a live callback. Set only during a solve. */
    __cpsatOnSolution?: (bytes: Uint8Array) => void;
}
export type WasmFactory = (options?: Record<string, unknown>) => Promise<CpSatModule>;
/**
 * Loads the Emscripten glue for one build variant.
 *
 * Supplied by the package entry point rather than resolved here, so that each entry
 * references exactly one literal WASM path. A bundler following the "browser"
 * condition then only ever sees the portable binary, and never emits the threaded
 * one as an asset.
 */
export type GlueLoader = (locateFile?: (path: string) => string) => Promise<WasmFactory>;
/** @internal — called by the package entry point (index.threaded / index.portable). */
export declare function setGlueLoader(loader: GlueLoader, threaded: boolean): void;
export interface SolverParams {
    maxTimeInSeconds?: number;
    /**
     * Number of parallel subsolvers. Defaults to 8.
     *
     * This is not a simple speed/resource dial: `num_workers` selects which subsolver
     * portfolio CP-SAT runs. Below 6 it runs a degraded subset — 2 and 4 are slower
     * than 1 on real models. Use 1 or >= 6, never in between.
     */
    numWorkers?: number;
    /**
     * Report every solution rather than stopping at the first.
     *
     * **Only meaningful on a model with no objective.** CP-SAT's own wording is "whether
     * we enumerate all solutions of a problem without objective"; with an objective the
     * search reports improving solutions instead, and this does nothing for you.
     *
     * Combined with `onSolution` this is what streams a complete solution set as the
     * search finds it. The solutions arrive in whatever order the search happens on —
     * there is no objective, so there is no ordering — and OR-Tools warns against reading
     * anything into it beyond completeness.
     *
     * Setting this also disables the presolve reductions that can remove feasible
     * solutions, which is the same effect as `keep_all_feasible_solutions_in_presolve`.
     */
    enumerateAllSolutions?: boolean;
    /**
     * Called for each improving solution the search finds.
     *
     * Purely observational: the return value is ignored and nothing here can steer or
     * stop the search. Use `maxTimeInSeconds` to bound it.
     *
     * **When the calls arrive depends on `numWorkers`.** At 1 worker CP-SAT solves on
     * the calling thread, so these are live — they interleave with the search, and
     * `solve()` has not returned yet. Above 1 worker the search runs on threads that
     * cannot enter JS, so incumbents are recorded and replayed in order just before
     * `solve()` returns. `live` on each solution says which happened. The sequence and
     * its contents are the same either way; only the timing differs.
     *
     * At 1 worker the handler runs inside the solver, holding a lock: keep it quick,
     * and do not call back into the solver from it. Post the solution somewhere and
     * return.
     */
    onSolution?: (solution: CpSolverSolution) => void;
}
export interface CpSolverResult {
    status: CpSolverStatus;
    objectiveValue: number;
    bestObjectiveBound: number;
    wallTime: number;
    /** Get the value of a variable in the solution */
    value(variable: IntVar): number;
    /** Raw response proto */
    response: CpSolverResponse;
}
/**
 * One improving solution seen during the search.
 *
 * The same shape as a final result — including `value()` — so an incumbent and an
 * answer can be read by the same code.
 */
export interface CpSolverSolution extends CpSolverResult {
    /** Delivered mid-solve (1 worker), or replayed just before solve() returned. */
    live: boolean;
}
/**
 * Loads the WASM module and solves CP-SAT models.
 *
 * Usage:
 *   const solver = await CpSolver.create();
 *   const result = solver.solve(model);
 */
export declare class CpSolver {
    private module;
    private constructor();
    static create(options?: CpSolverOptions): Promise<CpSolver>;
    solve(model: CpModel, params?: SolverParams): CpSolverResult;
}
/**
 * Shared plumbing for the per-variant glue loaders. Each caller passes its own
 * statically-analysable import, so only that variant's WASM is ever emitted.
 */
export declare function makeGlueLoader(importGlue: () => Promise<{
    default?: unknown;
}>, wasmUrl: () => string): GlueLoader;
//# sourceMappingURL=cp-solver.d.ts.map