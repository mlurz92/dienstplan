import { create, toBinary, fromBinary } from '@bufbuild/protobuf';
import { CpModelProtoSchema, CpSolverResponseSchema, CpSolverStatus, } from '../generated/cp_model_pb.js';
import { SatParametersSchema, } from '../generated/sat_parameters_pb.js';
export { CpSolverStatus };
let glueLoader;
let glueIsThreaded = false;
/** @internal — called by the package entry point (index.threaded / index.portable). */
export function setGlueLoader(loader, threaded) {
    glueLoader = loader;
    glueIsThreaded = threaded;
}
/** Build the caller-facing view of a response. Shared by results and incumbents. */
function readResponse(response) {
    return {
        status: response.status,
        objectiveValue: response.objectiveValue,
        bestObjectiveBound: response.bestObjectiveBound,
        wallTime: response.wallTime,
        value(variable) {
            return Number(response.solution[variable.index]);
        },
        response,
    };
}
/**
 * Loads the WASM module and solves CP-SAT models.
 *
 * Usage:
 *   const solver = await CpSolver.create();
 *   const result = solver.solve(model);
 */
export class CpSolver {
    module;
    constructor(module) {
        this.module = module;
    }
    static async create(options) {
        if (!glueLoader) {
            throw new Error("No WASM build was registered. Import the package entry point ('cpsat-js', " +
                "'cpsat-js/threaded' or 'cpsat-js/portable') rather than a deep internal path.");
        }
        // The glue — and therefore the 6MB WASM — is only loaded here, on first create().
        const createModule = await glueLoader(options?.locateFile);
        const module = await createModule();
        return new CpSolver(module);
    }
    solve(model, params) {
        const modelProto = model.toProto();
        const modelBytes = toBinary(CpModelProtoSchema, modelProto);
        const satParams = create(SatParametersSchema, {});
        // CP-SAT's speed comes from its parallel subsolver portfolio, which only engages
        // at >= 6 workers; 2 and 4 are measurably SLOWER than 1. The threaded WASM is
        // built with a pre-spawned pthread pool, so 8 is both safe and the right default.
        satParams.numWorkers = 8;
        if (params?.maxTimeInSeconds !== undefined) {
            satParams.maxTimeInSeconds = params.maxTimeInSeconds;
        }
        if (params?.numWorkers !== undefined) {
            satParams.numWorkers = params.numWorkers;
        }
        if (params?.enumerateAllSolutions !== undefined) {
            satParams.enumerateAllSolutions = params.enumerateAllSolutions;
        }
        // The portable build has no threads. Clamp to 1 rather than to some lower count:
        // anything in 2..5 selects a degraded portfolio and is slower than a single worker.
        if (!glueIsThreaded) {
            satParams.numWorkers = 1;
        }
        const paramsBytes = toBinary(SatParametersSchema, satParams);
        // Allocate WASM heap memory for model
        const modelPtr = this.module._malloc(modelBytes.length);
        this.module.HEAPU8.set(modelBytes, modelPtr);
        // Allocate WASM heap memory for params
        const paramsPtr = this.module._malloc(paramsBytes.length);
        this.module.HEAPU8.set(paramsBytes, paramsPtr);
        const onSolution = params?.onSolution;
        if (onSolution) {
            this.module.__cpsatOnSolution = (bytes) => {
                onSolution({ ...readResponse(fromBinary(CpSolverResponseSchema, bytes)), live: true });
            };
        }
        let resultLen;
        try {
            resultLen = this.module._solve(modelPtr, modelBytes.length, paramsPtr, paramsBytes.length, onSolution ? 1 : 0);
        }
        finally {
            this.module._free(modelPtr);
            this.module._free(paramsPtr);
            delete this.module.__cpsatOnSolution;
        }
        // Incumbents the observer could only record, because it ran on a thread that
        // cannot enter JS. Drained unconditionally: a live solve recorded nothing, so the
        // count is zero and this does nothing. That way the 1-vs-many rule lives in one
        // place — the C++ observer — and is never restated here to drift out of step.
        if (onSolution) {
            const recorded = this.module._solution_count();
            for (let i = 0; i < recorded; i++) {
                const ptr = this.module._solution_ptr(i);
                const len = this.module._solution_len(i);
                // Re-read HEAPU8 each time: growing the heap replaces the buffer.
                const bytes = this.module.HEAPU8.slice(ptr, ptr + len);
                onSolution({ ...readResponse(fromBinary(CpSolverResponseSchema, bytes)), live: false });
            }
        }
        // Read result from WASM memory
        const resultPtr = this.module._get_result_ptr();
        const resultBytes = new Uint8Array(this.module.HEAPU8.buffer, resultPtr, resultLen);
        // Copy before freeing
        const resultCopy = new Uint8Array(resultBytes);
        this.module._free_result();
        const response = fromBinary(CpSolverResponseSchema, resultCopy);
        return {
            status: response.status,
            objectiveValue: response.objectiveValue,
            bestObjectiveBound: response.bestObjectiveBound,
            wallTime: response.wallTime,
            value(variable) {
                return Number(response.solution[variable.index]);
            },
            response,
        };
    }
}
/**
 * Shared plumbing for the per-variant glue loaders. Each caller passes its own
 * statically-analysable import, so only that variant's WASM is ever emitted.
 */
export function makeGlueLoader(importGlue, wasmUrl) {
    return async (locateFile) => {
        const glue = await importGlue();
        const factory = glue.default;
        if (typeof factory !== 'function') {
            throw new Error('cpsat glue did not export a factory function');
        }
        const url = wasmUrl();
        const resolvedLocate = locateFile ?? ((path) => (path.endsWith('.wasm') ? url : path));
        return (options) => factory({ ...options, locateFile: resolvedLocate });
    };
}
//# sourceMappingURL=cp-solver.js.map