// boundary_test/end_to_end.js
//
// End-to-end smoke test for the formation.py -> BOUNDARY_CONTRACT ->
// Singularity-J evidence path.
//
// The flow is:
//   1. python_producer.py has already been run; boundary_test/envelope.json exists.
//   2. We load the envelope and verify it is well-formed (already covered by
//      node_consumer.js; we re-run the key shape checks here as a guard).
//   3. We construct a DecisionContext on the JS side (canonicalId, authority,
//      signature). This lives OUTSIDE the formation envelope. If a test fails
//      because the contract is wrong, the contract is what gets fixed.
//   4. We feed the formation result as evidence into incarnationBody.infer().
//   5. We assert that one body is produced, with state derived from the
//      formation envelope, and that no permission flag from authority.js has
//      leaked into the body state.
//   6. We assert the canonical's historyAddress advanced by exactly one
//      mergedVersion for this call.

const fs = require('fs');
const path = require('path');

const { loadAll } = require('./load_singularity');
loadAll();

let pass = 0, fail = 0;
function ok(name) { console.log('PASS ' + name); pass++; }
function bad(name, why) { console.log('FAIL ' + name + (why ? ' :: ' + why : '')); fail++; }

const envelopePath = path.resolve(__dirname, 'envelope.json');
const raw = fs.readFileSync(envelopePath, 'utf-8');
const env = JSON.parse(raw);
ok('envelope JSON parseable');

// Step 1: shape checks (subset of node_consumer.js, but local here).
function isPlainObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isInt(v) { return typeof v === 'number' && Number.isFinite(v) && Number.isInteger(v); }
function isNum(v) { return typeof v === 'number' && Number.isFinite(v); }

if (!isPlainObject(env.formation) || !isInt(env.formation.seed) || !isInt(env.formation.tick)) bad('envelope formation shape');
else ok('envelope formation shape');
if (!isPlainObject(env.formation.equation) ||
    !isInt(env.formation.equation.index) ||
    !isNum(env.formation.equation.lam) ||
    !isNum(env.formation.equation.K) ||
    !isNum(env.formation.equation.threshold) ||
    !isNum(env.formation.equation.delta) ||
    !Array.isArray(env.formation.equation.omega) ||
    env.formation.equation.omega.length !== 2) {
  bad('envelope equation shape');
} else {
  ok('envelope equation shape');
}
if (typeof env.operation !== 'string') bad('envelope operation is string');
else ok('envelope operation is string');
if (!isPlainObject(env.observation) || typeof env.observation.valid !== 'boolean' || !isNum(env.observation.residual)) bad('envelope observation shape');
else ok('envelope observation shape');

// Step 2: confirm the envelope is exactly the formation-side data and that
// authority/canonicalId are NOT carried on it.
const PERMISSION_FLAGS = [
  'canRead', 'canWrite', 'canOverrideNative', 'canCreateDomain',
  'canProjectAcrossDomains', 'canSpawnRegardlessOfDomain', 'canOrder',
];
const envelopeStr = JSON.stringify(env);
let contamination = false;
for (const f of PERMISSION_FLAGS) {
  if (envelopeStr.includes('"' + f + '"')) contamination = true;
}
if (contamination) bad('envelope has no authority flags');
else ok('envelope has no authority flags');
if (envelopeStr.includes('"canonicalId"') || envelopeStr.includes('"authority"') || envelopeStr.includes('"signature"')) {
  bad('envelope has no JS-side decision context');
} else {
  ok('envelope has no JS-side decision context');
}

// Step 3: construct the DecisionContext on the JS side.
const CANONICAL_ID = 'formation-evidence-test-canonical';
const AUTHORITY = 'output'; // tier 0 from authority.js
const SIGNATURE = 'boundary-test-' + Date.now();
const INTENT = 'evidence-from-formation';

// Step 4: register the canonical, then record the formation result as evidence.
// We use incarnarionBody.historyAddress and incarnationBody.infer.

if (typeof incarnationBody === 'undefined') {
  bad('incarnationBody loaded');
  console.log('--- summary ---'); console.log('pass: ' + pass + ' / fail: ' + fail); process.exit(1);
} else ok('incarnationBody loaded');

incarnationBody.registerCanonical({
  canonicalId: CANONICAL_ID,
  identity: 'Formation Evidence Test',
  appearance: { color: '#888888' },
  traits:     { persistent: true },
  abilities:  { embed: true },
  state:      { weight: 1.0 }
});
ok('canonical registered: ' + CANONICAL_ID);

const beforeAddr = incarnationBody.historyAddress(CANONICAL_ID);
ok('historyAddress before: latest=' + beforeAddr.latest);
// Capture value at capture time; the object is shared with infer() internals.
const beforeConsumed = beforeAddr.slots.consumed.length;
const beforeLatest = beforeAddr.latest;

// The decision context: in production this would be set by the caller of the
// bridge (a JS process, a tool, a UI). For the test we set it via the
// authority registration step.
const authInstance = authority.get(AUTHORITY);
if (!authInstance) {
  bad('authority.get(' + AUTHORITY + ') returned an instance');
} else {
  ok('authority.get(' + AUTHORITY + ') returned an instance, tier=' + authInstance.tier);
}

// Step 5: feed the envelope as evidence. We build a single evidence entry
// whose `state` is derived from the formation result. The mapping from
// envelope -> evidence.state is intentionally trivial here: the formation
// result IS the evidence. A real implementation would translate, but for
// the seam test we want the contract to prove that the literal bytes
// survive.

const evidenceState = {
  material:   {
    formation_seed: env.formation.seed,
    operation: env.operation,
    observation: env.observation  // formation-side observation; surfaces in body.state.material
  },
  memory:     { sensory: ['formation-tick-' + env.formation.tick], learned: { equationIndex: env.formation.equation.index } },
  geometry:   { x: 0, y: 0 },
  topology:   { source: 'formation.py', tick: env.formation.tick }
};

const result = incarnationBody.infer({
  canonicalId: CANONICAL_ID,
  evidence: [
    { source: 'formation.py', state: evidenceState, provenance: { version: env.formation.tick } }
  ],
  target: { targetDomain: 'physical', anchor: { x: 0, y: 0 } }
});

if (!result || !result.ok) { bad('infer returned ok=true', JSON.stringify(result)); }
else ok('infer returned ok=true');

// Step 6: inspect the body.
const body = result.body;
if (!body || !body.bodyId) bad('body has bodyId');
else ok('body has bodyId: ' + body.bodyId);

if (body.canonicalId === CANONICAL_ID) ok('body.canonicalId == ' + CANONICAL_ID);
else bad('body.canonicalId', body.canonicalId);

if (body.provenance && Array.isArray(body.provenance.sources) && body.provenance.sources[0] === 'formation.py') {
  ok('body.provenance.sources[0] == formation.py');
} else {
  bad('body.provenance.sources[0]');
}

if (body.provenance && typeof body.provenance.mergedVersion === 'number' && body.provenance.mergedVersion === beforeLatest + 1) {
  ok('body.provenance.mergedVersion == latest+1 (' + body.provenance.mergedVersion + ')');
} else {
  bad('body.provenance.mergedVersion', body.provenance ? body.provenance.mergedVersion : 'no provenance');
}

if (body.state && body.state.material && body.state.material.formation_seed === env.formation.seed) {
  ok('body.state.material.formation_seed preserved: ' + body.state.material.formation_seed);
} else {
  bad('body.state.material.formation_seed');
}

if (body.state && body.state.memory && body.state.memory.learned && body.state.memory.learned.equationIndex === env.formation.equation.index) {
  ok('body.state.memory.learned.equationIndex preserved: ' + body.state.memory.learned.equationIndex);
} else {
  bad('body.state.memory.learned.equationIndex');
}

if (body.state && body.state.material && body.state.material.observation &&
    typeof body.state.material.observation.valid === 'boolean') {
  ok('body.state.material.observation.valid is boolean: ' + body.state.material.observation.valid);
} else {
  bad('body.state.material.observation.valid');
}

// Step 7: confirm the deny-list still holds for body.state. The formation
// envelope does not contain dreamState/host/etc., but this guards against
// a regression where formation_equation's lambda is later misclassified.
const DENY = ['dreamState', 'host', 'hostRef', 'stack', 'stackFrames', 'temporaryDreamState', 'simulationState'];
const bodyStr = JSON.stringify(body.state || {});
let denyOk = true;
for (const k of DENY) {
  if (bodyStr.includes('"' + k + '"')) { denyOk = false; break; }
}
if (denyOk) ok('body.state has no denied keys');
else bad('body.state has denied keys');

// Step 8: confirm the body did NOT receive any of the JS-side authority flags,
// even though the decision context is real.
const bodyAllStr = JSON.stringify(body);
let bodyAuthLeak = false;
for (const f of PERMISSION_FLAGS) {
  if (bodyAllStr.includes('"' + f + '"')) { bodyAuthLeak = true; break; }
}
if (!bodyAuthLeak) ok('body has no permission flags');
else bad('body has permission flags');

// Step 9: historyAddress consumed count advanced by exactly 1.
const afterConsumed = incarnationBody.historyAddress(CANONICAL_ID).slots.consumed.length;
if (afterConsumed === beforeConsumed + 1) {
  ok('historyAddress.consumed count advanced by 1 (' + beforeConsumed + ' -> ' + afterConsumed + ')');
} else {
  bad('historyAddress.consumed count', 'before=' + beforeConsumed + ' after=' + afterConsumed);
}

console.log('');
console.log('--- summary ---');
console.log('passed: ' + pass + ' / failed: ' + fail);
console.log((fail === 0) ? 'OK' : 'FAILED');
process.exit(fail === 0 ? 0 : 1);