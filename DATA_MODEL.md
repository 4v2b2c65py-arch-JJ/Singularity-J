# Data Model

Two disjoint sets of field categories, with strict rules about which
direction information is allowed to flow.

## Materializable categories

These are the only categories that may appear in `body.state`.

| Category | | Example fields | Resolution rule |
|---|---|---|---|
| `identity` | | `canonicalId`, `bodyId` | preserved on body; one per infer call |
| `appearance` | | `color`, `visual style` | latest-authoritative by `provenance.version` |
| `material` | | `shell`, `density`, `composition` | union + last-write-wins per key |
| `memory` | | `sensory[]`, `learned{}` | union across evidence |
| `geometry` | | `x`, `y`, anchor coordinates | from `target.anchor` if provided |
| `topology` | | `nodeId`, graph relationships | preserved from first snapshot |
| `position` | | (alias of geometry for some callers) | same as geometry |
| `provenance` | | `sources[]`, `mergedVersion`, `inferredAt`, `historyAddress{}` | recorded by `infer()` |

## Non-material categories

These MUST NOT appear in `body.state`.

| Category | Example fields | Why non-material |
|---|---|---|
| `execution` | `stack`, `stackFrames`, current instruction pointer | describes how something ran, not what it is |
| `host` | `host`, `hostRef` | reference to a runtime that produced the evidence |
| `dream` | `dreamState`, `temporaryDreamState` | transient simulation context |
| `simulation` | `simulationState` | engine state, not entity state |
| `media` | audio buffers, render targets, sprite atlases | environmental, not intrinsic |

## Allowed information flow

```
Evidence
   ↓
materialClosure (deny-list filter, prune-before-recurse)
   ↓
memoryLattice.resolve (per-category rules)
   ↓
body.state (only materializable categories)
   ↓
representation (consumer)
```

## Forbidden information flow

```
representation  →  body.state          ✗ never

host             →  body.state          ✗ pruned at filter
stack            →  body.state          ✗ pruned at filter
dreamState       →  body.state          ✗ pruned at filter
media            →  body.state          ✗ pruned at filter
```

## The body shape produced by `infer()`

```js
{
  bodyId: <string, unique>,
  canonicalId: <string, from registered canonical>,

  state: {
    appearance: <latest-authoritative>,
    material:   <union + last-write-wins>,
    memory:     <union: { sensory[], learned{}, policy }>,
    geometry:   <from target>,
    topology:   <from first snapshot>,
    // no dreamState, no host, no stack, no simulationState
  },

  target: <string or null>,
  anchor: { x, y: } | null,

  provenance: {
    sources:       <array of source identifiers>,
    mergedVersion: <monotonic integer>,
    inferredAt:    <numeric timestamp>,
    historyAddress: { canonicalId, latest: }
  },

  materializedAt: <numeric timestamp>
}
```

## What a representation layer receives

```js
{
  voice:   <derived from body.state>,
  visual:  <derived from body.state>,
  audio:   <derived from body.state>,
  // ... whatever the representation needs
}
```

These are derived artifacts, not canonical state. They MUST NOT be
written back into `body.state`. If a new canonical fact emerges from
the representation work, the representation layer MUST produce new
evidence and call `infer()` again.