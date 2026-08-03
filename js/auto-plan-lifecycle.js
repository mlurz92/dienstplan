/** Lebenszyklusbausteine für sicher abbrechbare Auto-Plan-Läufe. */

function abortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error('Auto-Plan wurde abgebrochen.');
  error.name = 'AbortError';
  return error;
}

export function abortableDelay(milliseconds, signal, {
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout
} = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }

    let settled = false;
    let timer = null;
    const cleanup = () => signal?.removeEventListener?.('abort', onAbort);
    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      clearTimeoutFn(timer);
      cleanup();
      reject(abortError(signal));
    };
    timer = setTimeoutFn(finish, Math.max(0, Number(milliseconds) || 0));
    if (!settled) {
      signal?.addEventListener?.('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    }
  });
}

export class AutoPlanRunEpoch {
  constructor() {
    this.value = 0;
  }

  begin() {
    this.value += 1;
    return this.value;
  }

  invalidate() {
    this.value += 1;
  }

  isCurrent(token) {
    return token === this.value;
  }

  assertCurrent(token) {
    if (this.isCurrent(token)) return;
    const error = new Error('Ein neuerer Auto-Plan-Zustand hat diesen Lauf ersetzt.');
    error.name = 'AbortError';
    throw error;
  }
}
