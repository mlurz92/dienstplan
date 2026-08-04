import type { MonthState } from './src/index.js';

declare global {
  interface Env {
    MONTHS: DurableObjectNamespace<MonthState>;
    ENVIRONMENT: string;
  }
}

export {};
