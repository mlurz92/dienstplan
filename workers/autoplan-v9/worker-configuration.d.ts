import type { AutoPlanContainer, AutoPlanJob } from './src/index.js';

declare global {
  interface Env {
    AUTO_PLAN_JOBS: DurableObjectNamespace<AutoPlanJob>;
    AUTO_PLAN_CONTAINER: DurableObjectNamespace<AutoPlanContainer>;
    ENVIRONMENT: string;
    SOLVER_TIMEOUT_SECONDS: string;
  }
}

export {};
