/**
 * Semantische v9-Erweiterung der bestehenden Canvas-Visualisierung.
 * Sie zeichnet keine erfundenen Solverbewegungen, sondern spiegelt nur
 * tatsächliche Status-, Bound-, Gap-, Core- und Exact-LNS-Ereignisse.
 */
const STATUS = new Set(['OPTIMAL', 'FEASIBLE', 'INFEASIBLE', 'UNKNOWN', 'MODEL_INVALID', 'HEURISTIC']);

function bounded(value, min, max, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export class AutoPlanV9ProofVisualizer {
  constructor(dialog) {
    this.dialog = dialog;
    this.canvas = dialog?.querySelector('#autoPlanCanvas');
    this.host = this.canvas?.parentElement || null;
    this.lastSequence = -1;
    this.improvements = 0;
    this.install();
  }

  install() {
    if (!this.host || this.host.querySelector('.auto-plan-v9-proof-orbit')) return;
    const orbit = document.createElement('div');
    orbit.className = 'auto-plan-v9-proof-orbit';
    orbit.setAttribute('aria-hidden', 'true');
    orbit.innerHTML = '<i class="orbit-bound"></i><i class="orbit-gap"></i><i class="orbit-core"></i><span><b>CP-SAT</b><small>vorbereitet</small></span>';
    this.host.append(orbit);
    this.orbit = orbit;
    this.host.dataset.v9Proof = 'idle';
  }

  reset() {
    this.lastSequence = -1;
    this.improvements = 0;
    if (!this.host) return;
    this.host.dataset.v9Proof = 'idle';
    this.host.style.removeProperty('--v9-gap-angle');
    this.host.style.removeProperty('--v9-bound-energy');
    this.host.style.removeProperty('--v9-core-energy');
    this.orbit?.querySelector('small')?.replaceChildren(document.createTextNode('vorbereitet'));
  }

  update(update = {}) {
    if (!this.host) return;
    const sequence = Number(update.sequence);
    if (Number.isFinite(sequence) && sequence < this.lastSequence) return;
    if (Number.isFinite(sequence)) this.lastSequence = sequence;
    const status = String(update.solverStatus || update.status || '').toUpperCase();
    const stage = String(update.stage || update.phase || 'running').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const gap = bounded(update.relativeGap, 0, 1, null);
    const boundEnergy = bounded(Math.log10(1 + Math.max(0, Number(update.branches) || Number(update.evaluations) || 0)) / 6, 0, 1);
    const coreSize = Number(update.conflictCoreSize || update.coreSize || update.conflictCore?.length || 0);
    const coreEnergy = bounded(coreSize / 12, 0, 1);
    const improvements = Math.max(this.improvements, Number(update.improvements) || 0);
    const gained = improvements > this.improvements;
    this.improvements = improvements;

    this.host.dataset.v9Proof = STATUS.has(status) ? status.toLowerCase() : stage;
    this.host.dataset.v9Stage = stage;
    if (gap !== null) this.host.style.setProperty('--v9-gap-angle', `${Math.round(gap * 360)}deg`);
    this.host.style.setProperty('--v9-bound-energy', String(boundEnergy));
    this.host.style.setProperty('--v9-core-energy', String(coreEnergy));
    if (gained) {
      this.orbit?.classList.remove('is-improved');
      void this.orbit?.offsetWidth;
      this.orbit?.classList.add('is-improved');
    }

    const label = STATUS.has(status)
      ? status === 'OPTIMAL' ? 'Optimum bewiesen'
        : status === 'FEASIBLE' ? gap === null ? 'Lösung gefunden' : `Gap ${(gap * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`
          : status === 'INFEASIBLE' ? 'Konflikt bewiesen'
            : status === 'HEURISTIC' ? 'lokaler Fallback'
              : status.toLowerCase()
      : stage.replaceAll('-', ' ');
    const detail = this.orbit?.querySelector('small');
    if (detail) detail.textContent = label;
  }

  finish(result) {
    this.update({
      stage: 'complete',
      solverStatus: result?.metrics?.solverStatus || result?.solverStatus || 'HEURISTIC',
      relativeGap: result?.metrics?.relativeGap,
      branches: result?.metrics?.branches,
      conflictCoreSize: result?.metrics?.conflictCore?.length || 0,
      improvements: result?.metrics?.optimizer?.improvements || 0
    });
  }
}
