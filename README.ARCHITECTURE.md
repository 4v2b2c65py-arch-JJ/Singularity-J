# Architecture (this repository)

This repository contains two related concerns:

1. A playable Pac-Man remake in browser JavaScript (`public/`, `src/`,
   `font/`, `sounds/`, `sprites/`). See the original README in this
   directory for game documentation.
2. A standalone module — `src/incarnationBody.js` — that implements
   three coexisting primitives for state materialization. It is documented
   by the other files in this directory.

## Architecture diagram

```
                    ┌──────────────┐
                    │   Evidence   │   (snapshots of state from
                    └──────┬───────┘    one or more sources)
                           │
                           ▼
                    ┌──────────────┐
                    │    infer     │   prune-before-recurse
                    │              │   → deny-list filter
                    │              │   → memoryLattice.resolve
                    │              │   → one materialized body
                    └──────┬───────┘
                           │
                           ▼
                       body.state   (only materializable categories)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
            Voice        Visual       Audio
           consumer     consumer     consumer

warp()    = persistent-stream transition (bodies survive across calls)
allocate() = seven-stage incarnation construction (reserve an anchor slot)
infer()   = evidence → materialized state (atomic, prune-before-recurse)
```

## Information flow

```
Evidence
   ↓
materialClosure (deny-list filter, prune-before-recurse)
   ↓
memoryLattice.resolve (per-category rules)
   ↓
body.state
   ↓
representation (consumer)
```

The reverse direction — representation → `body.state` — is an
architectural violation. See `BOUNDARY_THREATS.md`.

## Where to read next

| Reader wants to understand... | Read |
|---|---|
| The big picture and the three primitives | `ARCHITECTURE.md` |
| What must never be violated | `INVARIANTS.md` |
| What categories of state exist | `DATA_MODEL.md` |
| What the smoke test actually proves | `TESTING.md` |
| How to modify the code safely | `CONTRIBUTING.md` |
| Concrete contamination scenarios | `BOUNDARY_THREATS.md` |

## Running the smoke test

```
node test_infer_filter.js
```

Expected: `passed: 35 / failed: 0`.

## The game

To run the game locally, see the original README in this directory and
the existing `build.sh`. The browser bundle is `public/pacman.js`,
served from `public/index.html`. The game and the architecture
documentation in this directory are independent concerns that happen to
share a working tree.

## Semantic version

The materialization contract is versioned. See `ARCHITECTURE.md`.

```
SEMANTIC_VERSION = "1.0.0"
```