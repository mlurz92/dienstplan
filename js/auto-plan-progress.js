/**
 * Wahrheitsgetreues Fortschrittsmodell für ein paralleles Auto-Plan-Portfolio.
 *
 * Solverereignisse treffen ungeordnet ein. Ein einzelner schneller Lauf darf
 * deshalb weder langsamere noch noch nicht gestartete Läufe unsichtbar machen.
 * Das Modell bildet beobachtbare Arbeitsanteile auf feste Phasenfenster ab und
 * hält den sichtbaren Wert monoton. Hundert Prozent bleiben einem terminalen
 * Ereignis vorbehalten.
 */

const STAGE_BOUNDS = Object.freeze({
  construction: Object.freeze({ start: .03, end: .55 }),
  perfection: Object.freeze({ start: .55, end: .97 })
});

const clamp = (value, minimum = 0, maximum = 1) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(Number(value)) ? Number(value) : minimum));

function stageOf(update) {
  const phase = String(update?.phase || '').toLowerCase();
  const stage = String(update?.stage || '').toLowerCase();
  if (phase === 'complete' || phase === 'blocked' || stage === 'abschluss') return 'complete';
  if (stage.includes('perfekt') || phase === 'perfect' || phase === 'certify' || phase === 'audit') return 'perfection';
  return 'construction';
}

function finiteInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback;
}

export class AutoPlanProgressModel {
  constructor() {
    this.reset();
  }

  reset() {
    this.progress = 0;
    this.stage = 'construction';
    this.runs = {
      construction: new Map(),
      perfection: new Map()
    };
    this.stageTotals = { construction: 1, perfection: 1 };
    this.workload = { processed: 0, total: 0 };
    this.portfolio = { completed: 0, active: 0, total: 1, cancelled: 0, failed: 0 };
    this.improvements = 0;
    this.terminal = false;
    return this.snapshot();
  }

  observe(update = {}) {
    const stage = stageOf(update);
    const phase = String(update.phase || 'analysis');
    if (stage === 'complete') {
      this.stage = 'complete';
      this.progress = 1;
      this.terminal = true;
      this.improvements = Math.max(this.improvements, finiteInteger(update.improvements));
      return this.snapshot({ phase, raw: update });
    }

    if (stage !== this.stage) {
      this.portfolio = { completed: 0, active: 0, total: 1, cancelled: 0, failed: 0 };
    }
    this.stage = stage;
    const bounds = STAGE_BOUNDS[stage];
    const hasRunIndex = Number.isInteger(update.searchIndex);
    const index = hasRunIndex ? finiteInteger(update.searchIndex) : null;
    const requestedTotal = Math.max(1, finiteInteger(update.searchCount, 1), index + 1, finiteInteger(update.portfolioTotal, 0));
    this.stageTotals[stage] = Math.max(this.stageTotals[stage], requestedTotal);

    const processed = finiteInteger(update.processed);
    const total = finiteInteger(update.total);
    if (total > 0) {
      this.workload.processed = Math.max(this.workload.processed, Math.min(processed, total));
      this.workload.total = Math.max(this.workload.total, total);
    }

    const rawProgress = clamp(update.progress);
    if (hasRunIndex) {
      const priorRun = this.runs[stage].get(index) || 0;
      const measuredShare = total > 0
        ? clamp(processed / total)
        : clamp((rawProgress - bounds.start) / Math.max(.0001, bounds.end - bounds.start));
      this.runs[stage].set(index, Math.max(priorRun, measuredShare));
    }

    const portfolioTotal = this.stageTotals[stage];
    const completed = Math.min(portfolioTotal, finiteInteger(update.portfolioCompleted, this.portfolio.completed));
    const cancelled = Math.min(portfolioTotal - completed, finiteInteger(update.portfolioCancelled, this.portfolio.cancelled));
    const failed = Math.min(portfolioTotal - completed - cancelled, finiteInteger(update.portfolioFailed, this.portfolio.failed));
    const activeFallback = [...this.runs[stage].values()].filter(value => value < 1).length;
    const active = Math.min(
      Math.max(0, portfolioTotal - completed - cancelled - failed),
      finiteInteger(update.portfolioActive, activeFallback)
    );
    this.portfolio = { completed, active, total: portfolioTotal, cancelled, failed };

    let accumulated = completed + cancelled + failed;
    for (const share of this.runs[stage].values()) accumulated += share;
    // Ein als abgeschlossen gemeldeter Lauf darf nicht zusätzlich über seinen
    // zuletzt beobachteten Teilstand gezählt werden.
    accumulated -= [...this.runs[stage].values()].sort((a, b) => b - a)
      .slice(0, Math.min(completed + cancelled + failed, this.runs[stage].size))
      .reduce((sum, share) => sum + share, 0);
    const portfolioShare = clamp(accumulated / portfolioTotal);
    let candidate = bounds.start + portfolioShare * (bounds.end - bounds.start);

    // Nicht portfoliofähige Inline-Läufe besitzen bereits einen belastbaren
    // phasengewichteten Rohwert. Er bleibt als Untergrenze erhalten.
    if (!hasRunIndex && !update.portfolioEvent) candidate = Math.max(candidate, rawProgress);
    if (rawProgress >= .99 && (phase === 'certify' || phase === 'audit')) candidate = .99;

    this.progress = Math.min(.99, Math.max(this.progress, bounds.start, candidate));
    this.improvements = Math.max(this.improvements, finiteInteger(update.improvements));
    return this.snapshot({ phase, raw: update });
  }

  snapshot({ phase = 'analysis', raw = null } = {}) {
    return {
      phase,
      stage: this.stage,
      progress: Number(this.progress.toFixed(6)),
      percent: Math.round(this.progress * 100),
      terminal: this.terminal,
      workload: { ...this.workload },
      portfolio: { ...this.portfolio },
      improvements: this.improvements,
      raw
    };
  }
}
