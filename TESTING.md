# Testing

The repository ships a smoke test that defines the materialization boundary.

## What 35/35 actually means

It is **not** a statement that "tests pass."

It is a statement that **the inference filter test suite defines what is
and is not allowed to enter canonical `body.state`.**

Each PASS line below is a load-bearing assertion about the system. Each
FAIL line below is a boundary violation that has been demonstrated to be
detectable.

## How to run

```
node test_infer_filter.js
```

Expected output ends with:

```
--- summary ---
passed: 35 / failed: 0
OK
```

## Categories of assertion

### Positive materialization (must survive)

These fields MUST appear in `body.state` when present in evidence:

| Field | Required behavior |
|---|---|
| `identity` / `canonicalId` | preserved on body |
| `material` | union with last-write-wins per key |
| `memory.sensory` | union of arrays across evidence |
| `memory.learned` | merged objects, last-write-wins |
| `geometry` | from `target.anchor` if provided, else from first snapshot |
| `topology` | preserved from first snapshot |
| `appearance` | preserved (latest-authoritative by `provenance.version`) |
| `provenance.sources` | array containing all source identifiers |
| `provenance.mergedVersion` | monotonically increasing integer ≥ 1 |
| `provenance.inferredAt` | numeric timestamp |
| `bodyId` | present, prefixed with `body-` |
| `_closure` (informational) | leak-free of denied keys |

### Negative materialization (must be pruned)

These fields MUST NOT appear anywhere in `body.state` even when present
in evidence:

| Field | Reason |
|---|---|
| `dreamState` | execution context |
| `host` | host reference |
| `hostRef` | host reference |
| `stack` | execution stack |
| `stackFrames` | execution stack |
| `temporaryDreamState` | transient dream context |
| `simulationState` | execution context |

The prune happens **before** recursion in `materialClosure()`. This is a
structural property of the implementation, not a runtime filter applied
after the fact.

## Adding new assertions

When you add a new category of materializable state, you MUST also add:

1. A positive assertion that fields of that category survive into
   `body.state`.
2. If the field could be confused with a denied category, a negative
   assertion that it is not pruned.
3. If you add a new denied category, a negative assertion that it is
   pruned at the leaf level.

When you add a new denied category to the deny-list, you MUST add a
negative assertion for it.

## What the test does NOT cover

- Audio or rendering correctness. This is a JS game; audio and rendering
  have their own concerns.
- Voice or representation layers. There are no representation layers in
  this repository. The smoke test asserts that `body.state` does not
  contain representation artifacts; it does not assert that any
  representation layer exists.
- Cross-engine determinism. The smoke test runs in Node. Browser-only
  code paths are not exercised here.