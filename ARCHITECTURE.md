# Architecture

A formal software model of hierarchical state, incarnation, evidence
resolution, and representation boundaries.

The repository contains a game (Pac-Man, browser-based JavaScript) plus a
standalone module (`src/incarnationBody.js`) that implements three coexisting
primitives for moving between representations of state:

| Primitive | Semantics |
|---|---|
| `warp()` | persistent-stream transition. Bodies survive across calls. |
| `allocate()` | seven-stage incarnation construction (resolve → occupancy → terrain → collision volume → chronology → reserve → instantiate). |
| `infer()` | evidence → materialized state. Atomic, prune-before-recurse. |

These three primitives coexist. They are not aliases for each other. They are
not alternative implementations of the same operation.

## `infer()` is not a replay engine, a simulation engine, or a representation engine

`infer()` takes one or more evidence snapshots, applies the memory lattice
resolution rules, and produces **one** materialized body whose `state`
contains only materializable information.

It does not:

- Replay histories. Histories become provenance, not authority.
- Execute code. There is no interpreter inside `infer()`.
- Produce a presentation. The body has `state`, not a voice, animation, or
  rendered output.

## Representation systems are consumers of `body.state`, never producers of canonical state

This is the single most important architectural statement in this document.

Voice, visual, animation, audio, and any other representation layer:

- **MAY** consume `body.state`.
- **MUST NOT** write back to canonical state.
- **MUST NOT** cause fields to enter or leave `body.state`.

The information flow is unidirectional:

```
Evidence
   ↓
materialClosure (prune-before-recurse)
   ↓
memoryLattice.resolve
   ↓
body.state
   ↓
representation (consumer)
```

The reverse direction — `representation → body.state` — is an architectural
violation. See `BOUNDARY_THREATS.md` for concrete examples.

## The two coexisting models

The architecture explicitly tolerates two complementary models:

1. **Persistent stream.** `warp()` and `allocate()` produce bodies that
   survive across calls. Multiple simultaneous materializations of the same
   canonical are allowed because the canonical's `state` is *the* materialization.
2. **Singularity collapse.** `infer()` produces exactly one new body per
   call. No prior bodyIds for the canonical survive the call. Source
   representations are consumed; their information content survives as
   resolved canonical state.

The two models coexist because they answer different questions. `warp()` /
`allocate()` answer "where does this body live?" `infer()` answers "what is
the canonical state given this evidence?"

## Documentation hierarchy

```
ARCHITECTURE.md     ← you are here
INVARIANTS.md       ← what must never be violated
DATA_MODEL.md       ← what categories of state exist and which way info flows
TESTING.md          ← what 35/35 actually means
CONTRIBUTING.md     ← how to modify the system safely
BOUNDARY_THREATS.md ← concrete attempted-contamination scenarios
README.md           ← landing page with the architecture diagram
```

If anything in the implementation contradicts a statement in
`INVARIANTS.md`, the implementation is wrong, not the invariant.

## Semantic version

```
SEMANTIC_VERSION = "1.0.0"
```

Breaking changes to the meaning of `infer()`, `warp()`, or `allocate()`
require a major version bump. Internal refactors that preserve the contract
are minor or patch.