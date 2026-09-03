# Contributing

The repository has architectural rules. They are not suggestions.

## Before modifying `src/incarnationBody.js`

1. **Read `INVARIANTS.md`.** If your change would violate any invariant,
   do not make the change. Discuss the invariant instead.
2. **Run `node test_infer_filter.js`.** It must report `passed: 35 /
   failed: 0` before and after your change.
3. **Preserve prune-before-recurse.** Denied keys must be skipped at the
   point of encounter, not after traversal. See the `materialClosure`
   implementation.
4. **Preserve history/provenance semantics.** Provenance is recorded, not
   replayed. If you change how provenance is structured, update
   `DATA_MODEL.md` and `TESTING.md`.
5. **Do not introduce representation → canonical-state dependencies.**
   Representation layers consume `body.state`. They do not write to it.
6. **Add a regression test for every new materialization rule.** If you
   add a new category that can enter `body.state`, add a positive
   assertion to `test_infer_filter.js`. If you add a new denied
   category, add a negative assertion.

## Before rebuilding the browser bundle

The browser bundle is `public/pacman.js`. It is produced by:

```
bash build.sh
cp pacman.js public/pacman.js
```

`build.sh` concatenates every file under `src/` in the order listed in
its `js_order` list. Adding a new module requires adding it to that
list in a position where its prerequisites are already defined.

After rebuilding, smoke-test the running game in a browser. The game is
served from `public/` and is not coupled to the incarnation body code.

## Style

This codebase uses 4-space indentation, `var` for declarations, function
expressions assigned to named globals, and IIFE-as-module pattern. Match
the existing style. Do not introduce TypeScript, ES modules, or a
bundler unless the repository's `build.sh` is rewritten to consume
them.

Do not add comments inside functions. Top-of-file header comments are
acceptable; per-line commentary is not.

## When to bump the semantic version

See `ARCHITECTURE.md` for the definition of `SEMANTIC_VERSION`.

- **MAJOR (X.0.0)** — breaking change to `infer()`, `warp()`, or
  `allocate()` semantics. Any change to the deny-list. Any change to
  what counts as a category of materializable state.
- **MINOR (0.X.0)** — additive feature that does not break existing
  callers. New exported function. New field on `body` that callers
  might want to read.
- **PATCH (0.0.X)** — bug fix or internal refactor that preserves
  observable behavior.

## What is not acceptable as a contribution

- A voice module that reads from anywhere other than `body.state`.
- An animation module that writes into `body.state`.
- An audio module whose metadata ends up in `body.state`.
- A "convenience" that calls `infer()` from inside a representation
  callback.
- Removing or aliasing `warp`, `allocate`, or `infer`.
- Loosening the deny-list "temporarily" to make a feature work.