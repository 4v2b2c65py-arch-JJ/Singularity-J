# Boundary Threats

This document records **identified possible boundary violations** and the
current defense status of each. It is not a list of rules the code
enforces; it is a list of things the repository's authors should be
aware of, with an honest note about whether the implementation
currently defends against them.

A threat is documented here regardless of whether a defense exists.
Adding a defense is a deliberate semantic change that follows the
progression described in `CONTRIBUTING.md` and `TESTING.md`:

```
new semantic rule
   ↓
deny-list entry
   ↓
negative assertion in test_infer_filter.js
   ↓
test count rises (e.g. 35/35 → 42/42)
   ↓
bundle rebuild
   ↓
defense status updated here
```

Threats that are mechanically defended today may still be added to
this document even though no future change is planned. Threats that
are not yet defended are tracked as **known gaps**, not as silent
fixes to be sneaked in.

## 1. Evidence contains a host reference

**Attempt:**
```js
incarnationBody.infer({
  canonicalId: "pacman-canonical",
  evidence: [
    { source: "swap-A", state: { host: "some-runtime-instance" } }
  ],
  target: {}
});
```

**Rule:** Negative-space invariant (`INVARIANTS.md` §2).

**Defense:** `materialClosure()` prunes the `host` key before recursing
into its subtree. The string `"some-runtime-instance"` never reaches
the closed graph. The `hostRef` field is similarly pruned.

**Verified by:** `test_infer_filter.js` — `host pruned`, `hostRef pruned`.

## 2. Evidence contains dream state

**Attempt:**
```js
incarnationBody.infer({
  canonicalId: "pacman-canonical",
  evidence: [
    { source: "swap-A", state: { dreamState: { scenery: { trees: 5 } } } }
  ],
  target: {}
});
```

**Rule:** Negative-space invariant.

**Defense:** `materialClosure()` prunes `dreamState`. The nested
`scenery.trees` value is also pruned because the entire subtree is
skipped at the moment `dreamState` is encountered.

**Verified by:** `test_infer_filter.js` — `dreamState pruned`.

## 3. Evidence contains an execution stack

**Attempt:**
```js
incarnationBody.infer({
  canonicalId: "pacman-canonical",
  evidence: [
    { source: "swap-A", state: { stackFrames: [{ fn: "tick" }, { fn: "render" }] } }
  ],
  target: {}
});
```

**Rule:** Negative-space invariant.

**Defense:** `stackFrames` (and `stack`) are both in the deny-list. The
array of frames is pruned whole.

**Verified by:** `test_infer_filter.js` — `stack pruned`, `stackFrames pruned`.

## 4. Voice service modifies `body.state`

**Attempt (in a hypothetical voice module):**
```js
function onVoiceMatched(body, voice) {
  body.state.lastSpokenVoice = voice.id;   // architectural violation
  return body;
}
```

**Rule:** Representation invariant (`INVARIANTS.md` §5).

**Defense:** None at runtime. The boundary is enforced by code review
and by the rule in `CONTRIBUTING.md` that representation layers do not
write into `body.state`. If a voice module needed to record that it had
spoken, it would either (a) keep that fact in its own data structure or
(b) produce new evidence and call `infer()` again.

**If you find yourself writing the line above, stop and read
`INVARIANTS.md` §5.**

## 5. Animation writes canonical geometry

**Attempt:**
```js
function onFrameTick(body, dt) {
  body.state.geometry.x += dt * body.state.material.speed;   // architectural violation
}
```

**Rule:** Representation invariant.

**Defense:** None at runtime. Same as threat #4. Animation is a
consumer of geometry, not a writer of it.

The correct pattern is to produce new evidence at each tick and call
`infer()`. That is intentionally heavyweight, which is the architectural
signal that geometry should not be mutated by animation in the first
place.

## 6. Simulation state enters `infer()`

**Attempt:**
```js
incarnationBody.infer({
  canonicalId: "pacman-canonical",
  evidence: [
    { source: "engine-A", state: { simulationState: { tick: 1234, rng: "xorshift" } } }
  ],
  target: {}
});
```

**Rule:** Materialization invariant; negative-space invariant.

**Defense:** `simulationState` is in the deny-list. Pruned before
recursion.

**Verified by:** `test_infer_filter.js` — `simulationState pruned`.

## 7. Media context ends up in evidence

**Attempt:**
```js
incarnationBody.infer({
  canonicalId: "pacman-canonical",
  evidence: [
    {
      source: "engine-A",
      state: {
        material: { shell: "A" },
        soundtrack: ["opening.mp3", "ghost-eat.mp3"],
        ghostSounds: ["siren.wav"],
        renderTarget: ctx
      }
    }
  ],
  target: {}
});
```

**Invariant at risk:** Materialization; negative-space; data model.

**Current defense status:** **PARTIAL — known gap.** `soundtrack`,
`ghostSounds`, and `renderTarget` are not in the current deny-list.
They would currently pass through `materialClosure()` because they
are unknown keys, not denied keys. The smoke test does not currently
assert against them.

**Status of record:** This is a documented possible boundary violation,
not a silent fix in progress. Adding `soundtrack, ghostSounds,
renderTarget, gameAssets, audioBuffer, spriteAtlas` to the deny-list
is a deliberate semantic change that requires (per
`CONTRIBUTING.md`): a deny-list entry, negative assertions in
`test_infer_filter.js`, an updated summary table here, and a bundle
rebuild.

## 8. Replaying history to derive state

**Attempt:**
```js
function inferWithReplay(opts) {
  var hist = incarnationBody.historyAddress(opts.canonicalId);
  var snapshot = hist.replayAllFrames();   // architectural violation
  return incarnationBody.materialize(snapshot, opts.target);
}
```

**Rule:** History invariant (`INVARIANTS.md` §3).

**Defense:** There is no `replayAllFrames` function exposed by the
module. The history address only stores slot consumption records and
block labels; it has no facility to replay. If such a function is
added, it MUST NOT be called from `infer()`.

## Summary table

| Threat | Invariant at risk | Currently defended? |
|---|---|---|
| 1. Host reference | Negative-space | YES (deny-list) |
| 2. Dream state | Negative-space | YES (deny-list) |
| 3. Execution stack | Negative-space | YES (deny-list) |
| 4. Voice writes `body.state` | Representation | NO (code review only) |
| 5. Animation writes geometry | Representation | NO (code review only) |
| 6. Simulation state | Negative-space | YES (deny-list) |
| 7. Media context | Negative-space | PARTIAL (known gap, see threat text) |
| 8. History replay | History | YES (no replay API) |

Threats 4 and 5 are the most likely to be introduced by well-meaning
contributors. Threats 1–3 and 6–8 are mechanically defended by the
current implementation. Threat 7 is an identified possible violation
without an enforced defense; it is documented here so that any change
to deny-list behavior is deliberate.

This table is a status snapshot, not a punch list. Threats marked NO or
PARTIAL are not obligations to fix; they are records of what the
implementation does and does not currently defend against.