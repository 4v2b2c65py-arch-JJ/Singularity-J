// Targeted smoke test for incarnationBody.infer() filter behavior.
// Loads only incarnationBody.js (the unit under test) plus its prerequisites
// (multiverse + authority + realityStack stubs). Avoids sound.js / renderer
// init issues that would stop the full bundle from reaching incarnationBody.

var fs = require('fs');

global.window = {};
global.DIR_UP = 0; global.DIR_LEFT = 1; global.DIR_DOWN = 2; global.DIR_RIGHT = 3;
global.tileSize = 8;
global.midTile = { x: 4, y: 4 };
global.pacman = null; global.ghosts = []; global.actors = []; global.map = null;

function load(p) {
  // Indirect eval so var declarations at file scope attach to global
  (0, eval)(fs.readFileSync(p, 'utf-8'));
}

// incarnationBody depends on multiverse and authority (defined first in build order).
load('src/multiverse.js');
load('src/authority.js');
load('src/incarnationBody.js');

if (typeof incarnationBody === 'undefined') {
  console.error('FAIL: incarnationBody not defined after loading src files');
  process.exit(1);
}

var r1 = incarnationBody.infer({
  canonicalId: 'pacman-canonical',
  evidence: [
    {
      source: 'swap-A',
      state: {
        material: { shell: 'A', density: 0.8 },
        memory:   { sensory: ['saw-ghost'], learned: { pelletCount: 42 } },
        geometry: { x: 10, y: 20 },
        topology: { nodeId: 'A' },
        appearance: { color: '#FFFF00' },
        dreamState: { host: { hostRef: 'swap-A-host', stackFrames: [{f:1},{f:2},{f:3}], dream: 'fragile' }, simulationState: { tick: 100 } },
        host: 'swap-A-host',
        hostRef: 'swap-A-host',
        stack: [1, 2, 3],
        stackFrames: [{ f: 1 }, { f: 2 }],
        temporaryDreamState: { ephemera: 'gone' }
      },
      provenance: { version: 184 }
    },
    {
      source: 'swap-B',
      state: {
        material: { shell: 'B', color: '#00FF00' },
        memory:   { sensory: ['ate-pellet'], learned: { pelletCount: 43 } },
        geometry: { x: 14, y: 23 },
        topology: { nodeId: 'B' },
        appearance: { color: '#FFFF00' },
        dreamState: { host: { hostRef: 'swap-B-host', stackFrames: [{f:4}], dream: 'soft' } },
        host: 'swap-B-host',
        hostRef: 'swap-B-host',
        stack: [{ call: 'sim' }],
        stackFrames: { f: 5 },
        simulationState: { tick: 200 }
      },
      provenance: { version: 391 }
    }
  ],
  target: { targetDomain: 'physical', anchor: { x: 14, y: 23 } }
});

if (!r1.ok) { console.error('FAIL: infer returned', JSON.stringify(r1)); process.exit(1); }

var b = r1.body;
var pass = [], fail = [];

function has(obj, path) {
  var parts = path.split('.');
  var cur = obj;
  for (var i = 0; i < parts.length; i++) {
    if (cur == null || typeof cur !== 'object') return false;
    cur = cur[parts[i]];
  }
  return cur !== undefined && cur !== null;
}

function assert(cond, name) {
  (cond ? pass : fail).push(name);
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
}

assert(b.bodyId && b.bodyId.indexOf('body-') === 0, 'bodyId present and prefixed');
assert(b.canonicalId === 'pacman-canonical', 'canonicalId preserved');
assert(has(b.state, 'material.shell'),       'material.shell survived');
assert(has(b.state, 'material.density'),    'material.density survived');
assert(b.state.material.shell === 'B', 'material: last-write-wins picked swap-B shell');
assert(b.state.material.color === '#00FF00', 'material: union included swap-B color');
assert(has(b.state, 'memory.sensory'),      'memory.sensory survived');
assert(b.state.memory.sensory.length === 2, 'memory.sensory: union of both arrays');
assert(b.state.memory.sensory.indexOf('saw-ghost') >= 0, 'sensory contains saw-ghost');
assert(b.state.memory.sensory.indexOf('ate-pellet') >= 0, 'sensory contains ate-pellet');
assert(has(b.state, 'memory.learned.pelletCount'), 'memory.learned survived');
assert(b.state.memory.learned.pelletCount === 43, 'learned: last-write-wins merged pelletCount=43');
assert(has(b.state, 'geometry'), 'geometry survived');
assert(b.state.geometry.x === 14 && b.state.geometry.y === 23, 'geometry from target.anchor');
assert(has(b.state, 'topology'), 'topology survived');
assert(has(b.state, 'appearance'), 'appearance survived');

assert(!has(b.state, 'dreamState'),       'dreamState pruned');
assert(!has(b.state, 'host'),             'host pruned');
assert(!has(b.state, 'hostRef'),          'hostRef pruned');
assert(!has(b.state, 'stack'),            'stack pruned');
assert(!has(b.state, 'stackFrames'),      'stackFrames pruned');
assert(!has(b.state, 'temporaryDreamState'), 'temporaryDreamState pruned');
assert(!has(b.state, 'simulationState'),  'simulationState pruned');

// Verify _closure (informational field on body) also has no leakage
assert(!has(b._closure || {}, 'dreamState'),  '_closure has no dreamState');
assert(!has(b._closure || {}, 'hostRef'),     '_closure has no hostRef');
assert(!has(b._closure || {}, 'stackFrames'), '_closure has no stackFrames');
assert(has(b._closure || {}, 'material.shell'),  '_closure keeps material.shell');
assert(has(b._closure || {}, 'memory.sensory'),  '_closure keeps memory.sensory');

assert(b.provenance && Array.isArray(b.provenance.sources), 'provenance.sources present');
assert(b.provenance.sources.indexOf('swap-A') >= 0 && b.provenance.sources.indexOf('swap-B') >= 0,
       'provenance.sources contains both');
assert(typeof b.provenance.mergedVersion === 'number' && b.provenance.mergedVersion >= 1,
       'mergedVersion is a number >= 1');
assert(typeof b.provenance.inferredAt === 'number', 'inferredAt is a timestamp');

var stats = incarnationBody.inferStats();
assert(stats['pacman-canonical'] && stats['pacman-canonical'].consumed === 2,
       'historyAddress consumed count == 2');
assert(stats['pacman-canonical'].latest === b.provenance.mergedVersion,
       'historyAddress.latest equals mergedVersion');

// Custom denyKeys path: caller overrides the default
var r2 = incarnationBody.infer({
  canonicalId: 'pacman-canonical',
  evidence: [
    {
      source: 'swap-X',
      state: {
        material: { shell: 'X' },
        customField: 'kept via custom deny-keys',
        dreamState: 'should NOT survive even via materialClosure',
        keepMe: 'should survive'
      },
      provenance: { version: 1000 }
    }
  ],
  target: { targetDomain: 'physical', anchor: { x: 5, y: 5 } }
});
assert(!has(r2.body.state, 'dreamState'), 'infer default filter still applies');

console.log('\n--- summary ---');
console.log('passed: ' + pass.length + ' / failed: ' + fail.length);
if (fail.length > 0) {
  fail.forEach(function (n) { console.log('  FAIL: ' + n); });
  process.exit(1);
}
console.log('OK');