import test from 'node:test';
import assert from 'node:assert/strict';

const { reconcileV95Certification } = await import('../js/auto-plan-certification-v9-5.js');

function result({ source = 'cp-sat-v9.5', proven = true, red = 0, complete = true, trace = null } = {}) {
  const certification = {
    status: proven ? 'MODEL_OPTIMAL_AUDITED' : 'BEST_FOUND_FEASIBLE',
    proven,
    scope: proven ? 'v9.5-boolean-model' : 'none',
    allPhasesOptimal: proven,
    auditPassed: true,
    source
  };
  return {
    complete,
    certified: proven,
    certification,
    metrics: {
      red,
      cpSatUsed: source !== 'heuristic-v8.5',
      cpSat: {
        trace: trace || [{ status: proven ? 'OPTIMAL' : 'FEASIBLE', proven }]
      },
      certification
    }
  };
}

test('der unveränderte optimale CP-SAT-Incumbent behält seinen Modellnachweis', () => {
  const input = result();
  const output = reconcileV95Certification(input);
  assert.equal(output, input);
  assert.equal(output.certified, true);
  assert.equal(output.metrics.certification.status, 'MODEL_OPTIMAL_AUDITED');
  assert.equal(output.metrics.certification.scope, 'v9.5-boolean-model');
});

test('ein nachträglich ausgewählter LNS-Incumbent erbt niemals den vorgelagerten Modellnachweis', () => {
  const output = reconcileV95Certification(result({ source: 'cp-sat-lns-v9.5' }));
  assert.equal(output.certified, false);
  assert.equal(output.certification.proven, false);
  assert.equal(output.certification.scope, 'none');
  assert.equal(output.certification.status, 'BEST_FOUND_FEASIBLE');
  assert.equal(output.certification.proofInvalidatedBy, 'selected-plan-not-original-optimal-incumbent');
  assert.equal(output.certification.upstreamStatus, 'MODEL_OPTIMAL_AUDITED');
  assert.equal(output.certification.upstreamAllPhasesOptimal, true);
});

test('rote Ausnahmen schließen einen Modellnachweis auch bei optimaler Phasenkette aus', () => {
  const output = reconcileV95Certification(result({ red: 1 }));
  assert.equal(output.certified, false);
  assert.equal(output.certification.proofInvalidatedBy, 'selected-plan-has-red-exceptions');
});

test('ein widersprüchlicher Phasentrace wird defensiv herabgestuft', () => {
  const output = reconcileV95Certification(result({
    trace: [{ status: 'OPTIMAL', proven: true }, { status: 'FEASIBLE', proven: false }]
  }));
  assert.equal(output.certified, false);
  assert.equal(output.certification.proofInvalidatedBy, 'lexicographic-proof-incomplete');
});

test('nicht bewiesene Ergebnisse werden niemals versehentlich aufgewertet', () => {
  const output = reconcileV95Certification(result({ proven: false }));
  assert.equal(output.certified, false);
  assert.equal(output.certification.status, 'BEST_FOUND_FEASIBLE');
  assert.equal(output.certification.proofInvalidatedBy, undefined);
});
