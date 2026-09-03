# Boundary Contract: `formation.py` ↔ `Singularity-J`

## Purpose

This document defines the **data envelope** that crosses the runtime
boundary between a Python caller of `formation.py` and a JavaScript
caller of `Singularity-J`. It is **transport-agnostic**, **interpretation-free**, and
**governance-free**. It does not assert that either runtime represents
a conscious entity, a biological system, or any metaphysical category.
It moves data.

Anything that interprets the data — authority checks, identity
materialization, persistence, biological modeling — happens **outside**
this contract, on whichever side owns that concern.

## What is in scope

- The shape of the **formation result envelope** that the Python side
  is willing to forward.
- The **JS-side requirements** a caller must satisfy for a formation
  result to be evaluated.
- The set of **resolution paths** the JS side may take after
  evaluation.
- The **non-duplication rule** for `Singularity-J/authority.js`.

## What is out of scope

- Authority semantics. `Singularity-J/src/authority.js` is the single
  source. This contract does not duplicate it in Python.
- Canonical identity, persistence, provenance. Those are JS-side
  concerns and remain in `Singularity-J/src/incarnationBody.js`.
- Biological modeling, embodiment, lifecycle, sex classification, or
  any domain-specific ontology. If a `formation` result carries
  domain-specific data, it carries it as opaque payload. The contract
  does not characterize it.
- Transport mechanism. The envelope is the same whether the
  transport is HTTP, stdin/stdout, an in-process bridge, a shared
  file, or a message queue.
- Validation of the envelope's contents. The contract defines the
  shape; whether a particular instance is well-formed is the caller's
  responsibility on either side.

## Actors

| Side | Role | Owns |
|---|---|---|
| Python | Producer | `formation.py` and its public operations |
| Bridge | Carrier | The transport, whatever it is |
| JavaScript | Consumer | `Singularity-J/authority.js`, `incarnationBody.js`, `multiverse.js` |

The bridge is not an actor. It does not interpret, validate, or
transform. It carries the envelope.

## The formation result envelope

This is what crosses the boundary, as a single structured value:

```json
{
  "formation": {
    "seed": <integer>,
    "tick": <integer>,
    "equation": {
      "index": <integer>,
      "lam": <number>,
      "omega": [<number>, <number>],
      "K": <number>,
      "threshold": <number>,
      "delta": <number>
    }
  },

  "operation": <string>,
  "input": <any>,
  "observation": {
    "valid": <boolean>,
    "residual": <number>,
    "constraints": <object>
  }
}
```

Field-by-field:

| Field | Type | Origin | Notes |
|---|---|---|---|
| `formation.seed` | integer | `FormationEngine.seed` | The engine's seed. |
| `formation.tick` | integer | `FormationEngine.tick_count` | Ticks elapsed. |
| `formation.equation.index` | integer | `EquationField.active.index` | Index into the equation-state list. |
| `formation.equation.lam` | number | `EquationState.lam` | Coupling strength. |
| `formation.equation.omega` | [lo, hi] | `EquationState.omega` | Operating range. |
| `formation.equation.K` | number | `EquationState.K` | Kernel coefficient. |
| `formation.equation.threshold` | number | `EquationState.threshold` | Mutation gate. |
| `formation.equation.delta` | number | `EquationState.delta` | Mutable offset. |
| `operation` | string | The triggered peer-op | One of: `valid`, `save`, `genesis`, `mutate`, `couple`, `couple_bidirectional`, `couple_with_lwk`, `apply_force`, `resurrect`, `null_return`, `materialize`. |
| `input` | any | The argument to the operation | Opaque to the contract. |
| `observation.valid` | boolean | `RealityObservation.valid` | |
| `observation.residual` | number | `RealityObservation.residual` | |
| `observation.constraints` | object | `RealityObservation.constraints` | |

`operation` values are **labels**, not commands. The JS side decides
what each label means in its own context.

### `observation` placement

`observation` is a top-level field of the formation result, but it is
**not** a new category of materializable state in the Singularity-J
lattice. It is **formation-derived observational metadata** — a readout
from the formation's own constraint check, not a property of the
canonical entity being materialized.

The validated end-to-end mapping as of contract v1.0.0 is:

```
FormationResult.observation
    │
    ▼
when materialized via infer() as evidence:
    body.state.material.observation
```

Rationale: the lattice has no `observation` category, so this field
must attach to an existing one. Placing it under `material` preserves
the semantic that observation is part of the formation's output, not
canonical state in its own right. A future contract revision may
introduce a dedicated category if the formation semantics warrant it.

Callers that put `observation` directly under evidence `state` (rather
than under `state.material`) will see the field survive only in
`body._closure`, not in `body.state`. This is intentional: the lattice
does not promote opaque top-level fields into canonical state.

## The JS-side requirements

For a formation result to be evaluated by the JS side, the caller must
provide:

| Field | Type | Required | Notes |
|---|---|---|---|
| `canonicalId` | string | yes | The canonical entity the result pertains to. |
| `authority` | string | yes | An authority name registered in `Singularity-J/authority.js`. |
| `signature` | string | yes | The TIER 4 signature from `realityStack.define()`. |
| `target` | object | no | `{ targetDomain, anchor }` for materialization targets. |
| `validFrames` | integer | no | Override the default `validFrames` from `define()`. |
| `provenance` | object | no | Caller-supplied provenance to merge with the formation result. |

The JS side does **not** evaluate the formation result if any required
field is missing. It returns `{ ok: false, reason: "missing required:
<field>" }`.

## Resolution paths

After evaluation, the JS side takes **exactly one** of the following
paths. The path is chosen by the JS-side policy, not by the formation
result.

| Path | Description | JS-side operation |
|---|---|---|
| `update` | The result updates an existing canonical body. | `infer` (with the result as evidence), or a targeted update via a registered tool. |
| `evidence` | The result is preserved as provenance for a future `infer`. | Stored in `historyAddress(canonicalId).blocks`. |
| `new incarnation` | The result produces a new body for a new canonical. | `infer` with a new `canonicalId`, after `registerCanonical`. |
| `rejected` | The result is dropped. The reason is recorded. | Returned to the caller with `{ ok: false, reason }`. |
| `local-only` | The result is consumed entirely on the JS side; no canonical state changes. | Used for observation, debugging, telemetry. |

The contract does not pick between these. It only lists them.

## Non-duplication rule

`Singularity-J/src/authority.js` is the **single source of authority
semantics**. The Python side does not reimplement the tier table, the
permission flags, or the kernel. If the Python caller needs authority
information, the bridge returns whatever the JS side already
evaluates. The Python side does not invent its own.

If a future need arises for authority evaluation on the Python side
before any JS evaluation, the answer is to call into the JS runtime
(subprocess, embedded V8, RPC), not to clone the tier table in Python.

## What the contract is not

- It is **not** an authority layer. Authority stays in
  `Singularity-J/authority.js`.
- It is **not** a persistence layer. Persistence stays in
  `Singularity-J/incarnationBody.js`.
- It is **not** a domain ontology. Domain meaning stays in whichever
  side owns the domain.
- It is **not** a transport specification. The envelope is the
  contract; the transport is implementation.
- It is **not** a guarantee of correctness. A conforming envelope can
  still be ill-formed in the sense that the formation result is
  invalid; the contract does not catch that.

## Version

```
BOUNDARY_CONTRACT_VERSION = "1.0.1"
```

### 1.0.1

- Clarified `observation` placement: it is formation-derived observational
  metadata, not a new lattice category. The validated end-to-end mapping
  is `FormationResult.observation -> body.state.material.observation`
  when fed as evidence. Top-level placement under `state` survives only
  in `body._closure`, not in `body.state`. This is a clarification of
  v1.0.0, not a breaking change.

### Breaking-change policy

Breaking changes to the envelope shape, required fields, or
resolution-path semantics require a major version bump. Adding a new
optional field is minor. Bug fixes / clarifications that preserve
observable behavior are patch.

## Open questions

These are not part of the contract. They are recorded for the next
review pass:

- Is `input` always opaque, or should the contract declare a small
  set of recognized input shapes for the most common operations?
- Should `provenance` be required for `update` and `new incarnation`,
  or remain optional?
- What is the canonical transport for v1.0.0? (HTTP, in-process,
  file-polling, message queue?) The contract does not require a
  specific transport but a reference implementation would help.
- Should the contract specify a failure-mode response envelope, or
  is `{"ok": false, "reason": "<string>"}` sufficient?
- The lattice currently lacks an `observation` category. Is the
  v1.0.1 mapping (under `material`) the right home for
  formation-derived observation, or should the lattice grow a
  dedicated category? This is a runtime question, not a contract
  question, but it is recorded here for traceability.
- The end-to-end evidence path has been validated. The `update`,
  `new incarnation`, `rejected`, and `local-only` resolution paths
  have not. They should each be tested before the contract is
  committed.