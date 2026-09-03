// boundary_test/load_singularity.js
//
// Loader for the three Singularity-J modules used by the end-to-end
// boundary test: incarnationBody.js, multiverse.js, authority.js.
//
// Each module is wrapped in an IIFE that declares its public API as
// a top-level `var`. To make those visible to the calling test, we
// load each file via indirect eval so the `var` bindings attach to
// the global scope rather than to a local function scope.
//
// Order matters: multiverse and authority are dependencies of
// incarnationBody. Load order is preserved.
//
// SINGULARITY_SRC is an absolute path. The default points at the
// Singularity-J clone used during the v1.0.1 validation run. Override
// the SINGULARITY_SRC environment variable to point at a different
// clone.

const fs = require('fs');
const path = require('path');

const SINGULARITY_SRC = process.env.SINGULARITY_SRC || '/Users/jjmarte/Documents/Singularity-J/src';

function indirectEvalFile(p) {
  const src = fs.readFileSync(p, 'utf-8');
  (0, eval)(src);
}

function loadAll() {
  indirectEvalFile(path.join(SINGULARITY_SRC, 'multiverse.js'));
  indirectEvalFile(path.join(SINGULARITY_SRC, 'authority.js'));
  indirectEvalFile(path.join(SINGULARITY_SRC, 'incarnationBody.js'));
}

module.exports = { loadAll, SINGULARITY_SRC };