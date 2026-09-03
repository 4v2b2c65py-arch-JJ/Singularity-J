# Invariants

The implementation MUST honor these invariants. If a change to the code would
violate one of them, the change is wrong, not the invariant.

## 1. Materialization invariant

> **Only materializable state may enter canonical `body.state`.**

Materializable state is the union of the categories listed in
`DATA_MODEL.md`: `identity`, `appearance`, `material`, `memory`,
`geometry`, `topology`, `position`, `provenance`.

Nothing else may enter `body.state`.

## 2. Negative-space invariant

> **Execution context is not material state.**

The following fields, regardless of where they appear in an evidence
snapshot, are **non-material** and MUST NOT appear in `body.state`:

```
dreamState
host
hostRef
stack
stackFrames
temporaryDreamState
simulationState
```

Plus anything else classified as execution, media, or transient context.

The mechanism is **prune-before-recurse** in `materialClosure()`. This
makes the boundary structural: a denied key's entire subtree is skipped
before traversal, so denied fields cannot leak into the closed graph even
if they are deeply nested.

## 3. History invariant

> **History is provenance, not replay.**

`infer()` records provenance on the resulting body:

```js
provenance: {
  sources: ["swap-A", "swap-B"],
  mergedVersion: <latest+1>,
  inferredAt: <timestamp>,
  historyAddress: { canonicalId, latest }
}
```

It MUST NOT replay execution histories, stack frames, or any sequence of
past states to decide what the current state is. The merged version number
is monotonically increasing, drawn from `historyAddress(canonicalId).latest +
1`. It is a label, not a derivation.

## 4. Identity invariant

> **Canonical identity survives inference.**

For any canonical entity with id `C`, every body produced by `infer(C, …)`
has `canonicalId === C`. `infer()` does not produce bodies for unregistered
canonicals. It does not produce bodies whose canonical identity has
changed.

## 5. Representation invariant

> **Voice / visual / animation / audio consume state. They do not manufacture canonical state.**

Representation layers:

- **MAY** read `body.state`.
- **MAY** derive their own data structures (voice IDs, animation curves,
  audio buffers) from `body.state`.
- **MUST NOT** write into `body.state`.
- **MUST NOT** cause new fields to appear in `body.state`.
- **MUST NOT** cause denied fields to appear in `body.state` by writing
  them through the body and re-running `infer()`.

If a representation layer needs to feed back into canonical state, it
MUST do so by producing **new evidence** that is then passed to a fresh
`infer()` call. It MUST NOT mutate an existing body in place.

This invariant deserves to be bolded approximately 47 times, because
future developers possess a mysterious instinct to violate exactly this
boundary.

## 6. Singularity invariant

> **`infer()` produces exactly one new bodyId per call.**

After `infer()` returns successfully for a given canonical, the resulting
`bodyId` is the materialized identity for the canonical's current state.
No prior bodyIds produced by `infer()` for the same canonical are
required to remain accessible. They may be garbage-collected.

This is the exclusivity invariant. It does NOT apply to `warp()` or
`allocate()`, which are explicitly the persistent-stream primitives.

## 7. Coexistence invariant

> **`warp`, `allocate`, and `infer` are distinct primitives with distinct semantics.**

- `warp()` returns instantly when the destination body is pre-embedded.
- `allocate()` runs a seven-stage pipeline and reserves an anchor slot.
- `infer()` is atomic; it does not have intermediate states that an
  external observer can witness.

Removing any of the three is a breaking change. Replacing one with the
other is an architectural violation.

## Enforcement

These invariants are enforced by:

1. The deny-list filter in `materialClosure()` (negative-space invariant).
2. The deep-clone in `infer()` that severs the evidence source
   representations from the resulting body (singularity invariant).
3. The `memoryLattice.resolve()` per-category resolution rules
   (materialization invariant).
4. The smoke test in `test_infer_filter.js` (all of the above, see
   `TESTING.md`).

There is no runtime check that prevents a representation layer from
writing into `body.state`. That boundary is enforced by code review and
the contributor rules in `CONTRIBUTING.md`.