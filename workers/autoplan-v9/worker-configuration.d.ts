import type {
  AutoPlanContainer,
  AutoPlanJob,
  AutoPlanWorkflowParams
} from './src/index.js';

declare global {
  interface Env {
    AUTO_PLAN_JOBS: DurableObjectNamespace<AutoPlanJob>;
    AUTO_PLAN_CONTAINER: DurableObjectNamespace<AutoPlanContainer>;
    AUTO_PLAN_WORKFLOW: Workflow<AutoPlanWorkflowParams>;
    ENVIRONMENT: string;
    SOLVER_TIMEOUT_SECONDS: string;
  }
}

export {};
