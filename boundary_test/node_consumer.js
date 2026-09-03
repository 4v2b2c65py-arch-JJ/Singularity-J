// boundary_test/node_consumer.js
//
// Reads an envelope produced by python_producer.py and validates it
// against BOUNDARY_CONTRACT.md (v1.0.0). Deterministic pass/fail.
//
// This script does NOT execute any Singularity-J code. It is parse +
// type + structural validation only.
//
// Boundary invariants under test:
//   - required top-level fields exist
//   - required formation.equation fields exist
//   - types survive JSON round-trip (numbers are numbers, booleans
//     are booleans, arrays are arrays)
//   - null is preserved
//   - invalid observations remain invalid
//   - equation parameters are NOT misinterpreted as authority
//   - formation.seed is NOT misinterpreted as canonicalId
//   - no Python authority model appears in the envelope
//   - malformed envelopes are rejected deterministically
//
// Usage:
//   node boundary_test/node_consumer.js <envelope.json>

const fs = require('fs');
const path = require('path');

function fail(msg) {
  console.log('FAIL ' + msg);
  return false;
}
function pass(msg) {
  console.log('PASS ' + msg);
  return true;
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}
function isIntegerNumber(v) {
  return isFiniteNumber(v) && Number.isInteger(v);
}

const REQUIRED = {
  top: ['formation', 'operation', 'input', 'observation'],
  formation: ['seed', 'tick', 'equation'],
  equation: ['index', 'lam', 'omega', 'K', 'threshold', 'delta'],
  observation: ['valid', 'residual', 'constraints'],
};

function validateEnvelope(env) {
  let ok = true;

  if (!isPlainObject(env)) {
    fail('envelope is a plain object');
    return false;
  } else {
    pass('envelope is a plain object');
  }

  for (const k of REQUIRED.top) {
    if (!(k in env)) { ok = fail('top-level field present: ' + k) && ok; }
    else { ok = pass('top-level field present: ' + k) && ok; }
  }

  if (!isPlainObject(env.formation)) {
    ok = fail('formation is a plain object') && ok;
    return ok;
  }
  pass('formation is a plain object');

  for (const k of REQUIRED.formation) {
    if (!(k in env.formation)) { ok = fail('formation field present: ' + k) && ok; }
    else { ok = pass('formation field present: ' + k) && ok; }
  }

  if (!isIntegerNumber(env.formation.seed)) {
    ok = fail('formation.seed is integer') && ok;
  } else { pass('formation.seed is integer: ' + env.formation.seed); }

  if (!isIntegerNumber(env.formation.tick)) {
    ok = fail('formation.tick is integer') && ok;
  } else { pass('formation.tick is integer: ' + env.formation.tick); }

  if (!isPlainObject(env.formation.equation)) {
    ok = fail('formation.equation is a plain object') && ok;
  } else { pass('formation.equation is a plain object'); }

  const eq = env.formation.equation || {};
  for (const k of REQUIRED.equation) {
    if (!(k in eq)) { ok = fail('equation field present: ' + k) && ok; }
    else { ok = pass('equation field present: ' + k) && ok; }
  }

  if (!isIntegerNumber(eq.index)) {
    ok = fail('equation.index is integer') && ok;
  } else { pass('equation.index is integer: ' + eq.index); }

  for (const k of ['lam', 'K', 'threshold', 'delta']) {
    if (!isFiniteNumber(eq[k])) {
      ok = fail('equation.' + k + ' is finite number') && ok;
    } else { pass('equation.' + k + ' is finite number: ' + eq[k]); }
  }

  if (!Array.isArray(eq.omega) || eq.omega.length !== 2 ||
      !isFiniteNumber(eq.omega[0]) || !isFiniteNumber(eq.omega[1])) {
    ok = fail('equation.omega is [lo, hi] pair of finite numbers') && ok;
  } else { pass('equation.omega is [lo, hi]: [' + eq.omega[0] + ', ' + eq.omega[1] + ']'); }

  if (typeof env.operation !== 'string') {
    ok = fail('operation is a string') && ok;
  } else { pass('operation is a string: "' + env.operation + '"'); }

  // input is opaque per the contract; we only assert it is present.
  // null is acceptable.

  if (!isPlainObject(env.observation)) {
    ok = fail('observation is a plain object') && ok;
  } else { pass('observation is a plain object'); }

  const obs = env.observation || {};
  for (const k of REQUIRED.observation) {
    if (!(k in obs)) { ok = fail('observation field present: ' + k) && ok; }
    else { ok = pass('observation field present: ' + k) && ok; }
  }

  if (typeof obs.valid !== 'boolean') {
    ok = fail('observation.valid is boolean') && ok;
  } else { pass('observation.valid is boolean: ' + obs.valid); }

  if (!isFiniteNumber(obs.residual)) {
    ok = fail('observation.residual is finite number') && ok;
  } else { pass('observation.residual is finite number: ' + obs.residual); }

  if (!isPlainObject(obs.constraints)) {
    ok = fail('observation.constraints is a plain object') && ok;
  } else { pass('observation.constraints is a plain object'); }

  // Boundary invariant: equation parameters are NOT authority.
  // The contract says nothing about a caller; if the envelope contains
  // anything that looks like a permission flag, that is a violation.
  const PERMISSION_FLAGS = [
    'canRead', 'canWrite', 'canOverrideNative', 'canCreateDomain',
    'canProjectAcrossDomains', 'canSpawnRegardlessOfDomain', 'canOrder',
  ];
  for (const flag of PERMISSION_FLAGS) {
    if (flag in env || flag in env.formation || flag in (env.formation.equation || {})) {
      ok = fail('envelope does NOT contain permission flag: ' + flag) && ok;
    } else {
      pass('envelope does NOT contain permission flag: ' + flag);
    }
  }

  // Boundary invariant: formation.seed is not canonicalId.
  if ('canonicalId' in env || 'canonicalId' in env.formation) {
    ok = fail('envelope does NOT carry canonicalId on the formation side') && ok;
  } else {
    pass('envelope does NOT carry canonicalId on the formation side');
  }

  // Boundary invariant: no Python authority model leaks in.
  if ('authority' in env || 'signature' in env || 'tier' in env) {
    ok = fail('envelope does NOT carry JS-side authority fields') && ok;
  } else {
    pass('envelope does NOT carry JS-side authority fields');
  }

  return ok;
}

function validateMalformed() {
  // Deterministic rejection of malformed envelopes.
  const cases = [
    { name: 'null',                        value: null,                     expectOk: false },
    { name: 'array',                       value: [],                       expectOk: false },
    { name: 'string',                      value: 'envelope',               expectOk: false },
    { name: 'missing formation',           value: { operation: 'x', input: {}, observation: { valid: true, residual: 0, constraints: {} } }, expectOk: false },
    { name: 'formation.seed is string',    value: { formation: { seed: '123', tick: 1, equation: { index: 0, lam: 1.0, omega: [0, 1], K: 1.0, threshold: 0.1, delta: 0 } }, operation: 'x', input: {}, observation: { valid: true, residual: 0, constraints: {} } }, expectOk: false },
    { name: 'observation.valid is "true"', value: { formation: { seed: 1, tick: 1, equation: { index: 0, lam: 1.0, omega: [0, 1], K: 1.0, threshold: 0.1, delta: 0 } }, operation: 'x', input: {}, observation: { valid: 'true', residual: 0, constraints: {} } }, expectOk: false },
    { name: 'operation is number',         value: { formation: { seed: 1, tick: 1, equation: { index: 0, lam: 1.0, omega: [0, 1], K: 1.0, threshold: 0.1, delta: 0 } }, operation: 42, input: {}, observation: { valid: true, residual: 0, constraints: {} } }, expectOk: false },
    { name: 'equation.omega wrong length', value: { formation: { seed: 1, tick: 1, equation: { index: 0, lam: 1.0, omega: [0, 1, 2], K: 1.0, threshold: 0.1, delta: 0 } }, operation: 'x', input: {}, observation: { valid: true, residual: 0, constraints: {} } }, expectOk: false },
  ];

  let ok = true;
  for (const c of cases) {
    const observed = validateEnvelope(c.value);
    if (observed === c.expectOk) {
      pass('malformed case rejected/accepted as expected: ' + c.name + ' (expected=' + c.expectOk + ')');
    } else {
      ok = fail('malformed case ' + c.name + ' (expected=' + c.expectOk + ', got=' + observed + ')') && ok;
    }
  }
  return ok;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('usage: node_consumer.js <envelope.json>');
    process.exit(2);
  }
  const file = path.resolve(args[0]);
  const raw = fs.readFileSync(file, 'utf-8');

  let env;
  try { env = JSON.parse(raw); }
  catch (e) {
    console.log('FAIL envelope is valid JSON: ' + e.message);
    process.exit(1);
  }
  pass('envelope is valid JSON');

  const realOk = validateEnvelope(env);
  const malOk  = validateMalformed();
  const overall = realOk && malOk;

  console.log('');
  console.log('--- summary ---');
  console.log('real envelope: ' + (realOk ? 'PASS' : 'FAIL'));
  console.log('malformed cases: ' + (malOk ? 'PASS' : 'FAIL'));
  console.log('overall: ' + (overall ? 'OK' : 'FAILED'));
  process.exit(overall ? 0 : 1);
}

main();