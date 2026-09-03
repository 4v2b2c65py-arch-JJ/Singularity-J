//////////////////////////////////////////////////////////////////////////////////////
// Incarnation Body
//
// Canonical entity -> embedding -> incarnated body.
//
// The canonical entity lives in the host process. Its identity / appearance /
// traits / abilities are inherited by every incarnated body; its state is NOT
// inherited — each incarnation receives fresh state.
//
// Allocation pipeline (in fixed order):
//   resolveIncarnationPoint
//     -> occupancy
//        -> checkTerrain
//           -> checkCollisionVolume
//              -> checkChronology
//                 -> reserve
//                    -> instantiate
//
// Warp-time:
//   E:(S_A, t_A) -> (S_B, t_B). If the destination body is already embedded
//   at the target anchor, the mapping is instant — no simulated travel frames.

var incarnationBody = (function(){

    var canonicals = {};          // canonicalId -> canonical entity
    var bodies = [];              // incarnated bodies
    var reservations = {};         // anchor (x,y) -> reservation token
    var seq = 0;

    // ---- Canonical entity ----------------------------------------------

    function registerCanonical(spec) {
        if (!spec || !spec.canonicalId) {
            return { ok: false, error: "canonicalId required" };
        }
        if (canonicals[spec.canonicalId]) {
            return { ok: false, error: "canonical exists: " + spec.canonicalId };
        }
        var c = {
            canonicalId: spec.canonicalId,
            identity:   spec.identity   || spec.canonicalId,
            appearance: spec.appearance || {},
            traits:     spec.traits     || {},
            abilities:  spec.abilities  || {},
            state:      (typeof spec.state === "object" && spec.state) || {},
            host:       spec.host       || null,    // optional live reference
            createdAt:  Date.now()
        };
        canonicals[c.canonicalId] = c;
        return c;
    }

    function getCanonical(id) { return canonicals[id] || null; }
    function listCanonicals() { return Object.keys(canonicals); }

    // ---- Allocation pipeline (fixed order) -----------------------------

    // 1. resolveIncarnationPoint
    function resolveIncarnationPoint(spec) {
        var a = (spec && spec.anchor) ||
                ((spec && typeof spec.geography === "object") ? spec.geography : null);
        if (!a || typeof a.x !== "number" || typeof a.y !== "number") {
            return { ok: false, stage: "resolve", error: "no anchor or geography {x,y}" };
        }
        return { ok: true, anchor: { x: a.x|0, y: a.y|0 } };
    }

    // 2. occupancy
    function occupancy(anchor) {
        var key = anchor.x + "," + anchor.y;
        return { ok: !reservations[key], stage: "occupancy", anchor: anchor };
    }

    // 3. checkTerrain
    function checkTerrain(anchor, terrain) {
        if (!terrain) return { ok: true, stage: "terrain", note: "no terrain specified" };
        if (typeof terrain.isFloorTile === "function") {
            var passable = terrain.isFloorTile(anchor.x, anchor.y);
            return { ok: !!passable, stage: "terrain", anchor: anchor };
        }
        return { ok: true, stage: "terrain", note: "terrain provided but no isFloorTile" };
    }

    // 4. checkCollisionVolume
    function checkCollisionVolume(anchor, size) {
        var s = size || { w: 1, h: 1 };
        // default reservation grid: one slot per tile
        for (var dx = 0; dx < (s.w || 1); dx++) {
            for (var dy = 0; dy < (s.h || 1); dy++) {
                var key = (anchor.x + dx) + "," + (anchor.y + dy);
                if (reservations[key]) return { ok: false, stage: "collision", overlap: { x: anchor.x+dx, y: anchor.y+dy } };
            }
        }
        return { ok: true, stage: "collision" };
    }

    // 5. checkChronology
    function checkChronology(temporalOffset) {
        // default: any non-negative offset is acceptable
        if (typeof temporalOffset === "number" && temporalOffset < 0) {
            return { ok: false, stage: "chronology", error: "negative temporal offset" };
        }
        return { ok: true, stage: "chronology" };
    }

    // 6. reserve
    function reserve(anchor, size, meta) {
        var s = size || { w: 1, h: 1 };
        var key = anchor.x + "," + anchor.y;
        var token = "res-" + (++seq);
        reservations[key] = {
            token: token,
            canonicalId: (meta && meta.canonicalId) || null,
            anchor: anchor,
            size: s,
            at: Date.now()
        };
        return { ok: true, stage: "reserve", token: token, anchor: anchor };
    }

    // 7. instantiate (produces the live body)
    function instantiate(canonical, opts) {
        if (!canonical) return { ok: false, stage: "instantiate", error: "no canonical" };
        var o = opts || {};
        var body = {
            bodyId: "body-" + (++seq),
            canonicalId: canonical.canonicalId,
            inherited: canonical.inherited || ["identity", "appearance", "traits", "abilities"],
            identity: canonical.identity,
            appearance: canonical.appearance,
            traits: canonical.traits,
            abilities: canonical.abilities,
            state: o.freshState || {},
            target: o.targetDomain || null,
            anchor: o.anchor || null,
            localLaw: o.lawAdapter || null,
            temporalOffset: o.temporalOffset || 0,
            spawnedAt: Date.now()
        };
        bodies.push(body);
        return { ok: true, stage: "instantiate", body: body };
    }

    // ---- Top-level allocator -------------------------------------------

    function allocate(spec) {
        if (!spec || !spec.canonicalId) {
            return { ok: false, error: "canonicalId required" };
        }
        var canonical = canonicals[spec.canonicalId];
        if (!canonical) return { ok: false, error: "no canonical: " + spec.canonicalId };

        var trace = [];
        var step, ok = true;

        // 1. resolve
        step = resolveIncarnationPoint(spec);
        trace.push(step);
        if (!step.ok) ok = false;
        if (!ok) return { ok: false, trace: trace, failed: "resolve" };

        var anchor = step.anchor;

        // 2. occupancy
        step = occupancy(anchor);
        trace.push(step);
        if (!step.ok) return { ok: false, trace: trace, failed: "occupancy", reason: "anchor already reserved" };

        // 3. terrain
        step = checkTerrain(anchor, spec.terrain);
        trace.push(step);
        if (!step.ok) return { ok: false, trace: trace, failed: "terrain", anchor: anchor };

        // 4. collision volume
        step = checkCollisionVolume(anchor, spec.size);
        trace.push(step);
        if (!step.ok) return { ok: false, trace: trace, failed: "collision", overlap: step.overlap };

        // 5. chronology
        step = checkChronology(spec.temporalOffset);
        trace.push(step);
        if (!step.ok) return { ok: false, trace: trace, failed: "chronology" };

        // 6. reserve
        step = reserve(anchor, spec.size, { canonicalId: spec.canonicalId });
        trace.push(step);

        // 7. instantiate
        var freshState = Object.assign({}, canonical.state || {});
        if (spec.freshState) Object.assign(freshState, spec.freshState);

        step = instantiate(canonical, {
            targetDomain: spec.targetDomain,
            anchor: anchor,
            lawAdapter: spec.lawAdapter,
            temporalOffset: spec.temporalOffset,
            freshState: freshState
        });
        trace.push(step);

        return step.ok ? { ok: true, trace: trace, body: step.body } : step;
    }

    // ---- Warp-time E:(S_A, t_A) -> (S_B, t_B) ---------------------------

    function warp(opts) {
        if (!opts || !opts.canonicalId) return { ok: false, error: "canonicalId required" };
        if (!opts.from || !opts.to) return { ok: false, error: "from and to required" };

        var canonical = canonicals[opts.canonicalId];
        if (!canonical) return { ok: false, error: "no canonical: " + opts.canonicalId };

        // check if a body is already embedded at the destination anchor
        var existing = bodies.find(function(b){
            return b.canonicalId === opts.canonicalId &&
                   b.target === opts.to.targetDomain &&
                   b.anchor && opts.to.anchor &&
                   b.anchor.x === opts.to.anchor.x &&
                   b.anchor.y === opts.to.anchor.y;
        });

        if (existing) {
            // warp is instant: just record the mapping
            var mapping = {
                E: opts.canonicalId,
                from: opts.from,
                to: opts.to,
                warpTime: 0,
                method: "pre-embedded",
                bodyId: existing.bodyId,
                at: Date.now()
            };
            return { ok: true, warp: true, mapping: mapping, body: existing };
        }

        // destination empty: allocate a new one (the host's original is isolated)
        var allocation = allocate({
            canonicalId: opts.canonicalId,
            anchor: opts.to.anchor,
            targetDomain: opts.to.targetDomain,
            temporalOffset: (opts.to.t != null) ? opts.to.t - opts.from.t : 0,
            terrain: opts.terrain,
            freshState: opts.freshState
        });

        if (!allocation.ok) return { ok: false, error: "warp allocation failed", trace: allocation.trace };

        var mapping = {
            E: opts.canonicalId,
            from: opts.from,
            to: opts.to,
            warpTime: 0,
            method: "new-incarnation",
            bodyId: allocation.body.bodyId,
            at: Date.now()
        };
        return { ok: true, warp: true, mapping: mapping, body: allocation.body };
    }

    // ---- Listing / stats -----------------------------------------------

    function listBodies() { return bodies.slice(); }
    function reservationsFor(anchor) {
        var key = anchor.x + "," + anchor.y;
        return reservations[key] || null;
    }
    function stats() {
        return {
            canonicals: Object.keys(canonicals),
            bodies: bodies.length,
            reservations: Object.keys(reservations).length
        };
    }

    function release(anchor) {
        var key = anchor.x + "," + anchor.y;
        if (reservations[key]) { delete reservations[key]; return { ok: true }; }
        return { ok: false, error: "no reservation at " + key };
    }

    // ---- Pre-declared canonical for Pac-Man ----------------------------

    registerCanonical({
        canonicalId: "pacman-canonical",
        identity: "Pac-Man",
        appearance: { color: "#FFFF00", shape: "arc" },
        traits:     { persistent: true, momentum: true },
        abilities:  { eat: true, warp: true, embed: true },
        state:      { weight: 1.0, dirEnum: 1 },
        host:       null    // bind via registerCanonical again or set later
    });

    // ====================================================================
    // INFERENCE LAYER (additive; warp/allocate remain available)
    //
    // infer() collapses two evidence snapshots of the same canonical into
    // ONE materialized body. Source representations are consumed; their
    // contributed information becomes part of the new body's state.
    //
    // The body shape follows the canonical memory-lattice contract:
    //
    //   {
    //     bodyId, canonicalId,
    //     state: { material, memory, geometry, topology, ... },
    //     target,
    //     provenance: {
    //       sources: ["swap-A", "swap-B"],
    //       mergedVersion: <latest+1>,
    //       inferredAt: <ts>,
    //       historyAddress: <block>
    //     }
    //   }
    //
    // bodyId is the only newly materialized identity for this canonical
    // post-call. History is provenance only — never replayed.

    var historyAddresses = {};   // canonicalId -> {latest, slots:{retained,consumed}, blocks:[]}

    function historyAddress(canonicalId) {
        if (!historyAddresses[canonicalId]) {
            historyAddresses[canonicalId] = {
                canonicalId: canonicalId,
                latest: 0,
                slots: { retained: [], consumed: [] },
                blocks: []
            };
        }
        return historyAddresses[canonicalId];
    }

    // memoryLattice: applies the per-category policy. Sensory/learned info
    // is preserved as resolved canonical memory; source representations
    // themselves are consumed.
    var memoryLattice = (function(){

        function pickAppearance(snapshots) {
            // "latest-authoritative" = the snapshot whose provenance.version is largest
            var latest = snapshots[0];
            for (var i = 1; i < snapshots.length; i++) {
                if ((snapshots[i].provenance && snapshots[i].provenance.version || 0) >
                    (latest.provenance && latest.provenance.version || 0)) {
                    latest = snapshots[i];
                }
            }
            return (latest && latest.state && latest.state.appearance) || {};
        }

        function unionMaterial(snapshots) {
            // Material structure: union + conflict resolution (last write wins per key)
            var out = {};
            for (var i = 0; i < snapshots.length; i++) {
                var m = (snapshots[i].state && snapshots[i].state.material) || {};
                for (var k in m) {
                    if (Object.prototype.hasOwnProperty.call(m, k)) out[k] = m[k];
                }
            }
            return out;
        }

        function mergeMemory(snapshots) {
            // Sensory/learned → union into canonical memory container.
            // Source sensory representations are NOT deleted from the
            // function inputs here — they are consumed by infer() AFTER
            // their information has been copied into the resolved memory.
            var sensory = [];
            var learned = {};
            for (var i = 0; i < snapshots.length; i++) {
                var s = snapshots[i];
                var mem = (s.state && s.state.memory) || {};
                if (Array.isArray(mem.sensory)) {
                    for (var j = 0; j < mem.sensory.length; j++) sensory.push(mem.sensory[j]);
                }
                if (mem.learned && typeof mem.learned === "object") {
                    for (var k in mem.learned) {
                        if (Object.prototype.hasOwnProperty.call(mem.learned, k)) learned[k] = mem.learned[k];
                    }
                }
            }
            return { sensory: sensory, learned: learned, policy: "union" };
        }

        function dropHostRefs(snapshots) {
            // Host references are removed entirely; their info has already
            // been pulled into material/memory above.
            for (var i = 0; i < snapshots.length; i++) {
                if (snapshots[i].state && "host" in snapshots[i].state) delete snapshots[i].state.host;
                if (snapshots[i].state && "hostRef" in snapshots[i].state) delete snapshots[i].state.hostRef;
            }
        }

        function resolve(snapshots, target) {
            if (!Array.isArray(snapshots) || snapshots.length === 0) {
                return { ok: false, error: "no snapshots" };
            }
            dropHostRefs(snapshots);

            var appearance = pickAppearance(snapshots);
            var material   = unionMaterial(snapshots);
            var memory     = mergeMemory(snapshots);
            var geometry   = target && target.anchor ? { x: target.anchor.x, y: target.anchor.y } :
                             ((snapshots[0].state && snapshots[0].state.geometry) || {});
            var topology   = (snapshots[0].state && snapshots[0].state.topology) || {};

            return {
                ok: true,
                resolvedState: {
                    appearance: appearance,
                    material:   material,
                    memory:     memory,
                    geometry:   geometry,
                    topology:   topology
                }
            };
        }

        return { resolve: resolve };
    })();

    // materialClosure: recursively resolves every reachable field across
    // snapshots into one closed object. Not Object.assign — walks the graph.
    //
    // denyKeys filter: any key matching the list has its ENTIRE subtree
    // pruned BEFORE traversal, so transient dream / host / stack data
    // cannot leak into the closed graph.
    function materialClosure(snapshots, opts) {
        var denyKeys = (opts && Array.isArray(opts.denyKeys)) ? opts.denyKeys :
            // default: fields whose content should not survive into the
            // materialized body, per the memory-lattice policy.
            ["dreamState", "host", "hostRef", "stack", "stackFrames",
             "temporaryDreamState", "simulationState"];

        var denySet = {};
        for (var i = 0; i < denyKeys.length; i++) denySet[denyKeys[i]] = true;

        var seen = new Set();
        var closed = {};

        // absorb with prune-before-recurse semantics: if a key is denied,
        // skip the subtree entirely. Transient data cannot leak through.
        function absorb(value) {
            if (value === null || value === undefined) return;
            if (typeof value !== "object") return;
            if (seen.has(value)) return;
            seen.add(value);

            if (Array.isArray(value)) {
                for (var i = 0; i < value.length; i++) absorb(value[i]);
                return;
            }

            for (var k in value) {
                if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
                if (denySet[k]) continue;          // PRUNE BEFORE RECURSE
                var v = value[k];
                if (v === null || typeof v !== "object" || seen.has(v)) {
                    closed[k] = v;
                    continue;
                }
                if (Array.isArray(v) || (v && typeof v === "object")) absorb(v);
                closed[k] = v;
            }
        }

        for (var i = 0; i < snapshots.length; i++) {
            var s = snapshots[i];
            if (s && s.state) absorb(s.state);
        }
        return closed;
    }

    // infer: collapse two evidence snapshots into one materialized body.
    function infer(opts) {
        if (!opts || !opts.canonicalId) return { ok: false, error: "canonicalId required" };
        if (!Array.isArray(opts.evidence) || opts.evidence.length < 1) {
            return { ok: false, error: "evidence[] required" };
        }
        var canonical = canonicals[opts.canonicalId];
        if (!canonical) return { ok: false, error: "no canonical: " + opts.canonicalId };

        // snapshot the evidence — once read, this closure owns them.
        var snapshots = opts.evidence.map(function(e){
            return {
                source: e.source || "anon",
                state: (e.state && typeof e.state === "object") ? JSON.parse(JSON.stringify(e.state)) : {},
                provenance: Object.assign({}, e.provenance || {})
            };
        });

        // 1. closure: walk every reachable field once, prune-before-recurse
        // so dreamState / host / stack subtrees cannot leak in.
        var closed = materialClosure(snapshots, {
            denyKeys: ["dreamState", "host", "hostRef", "stack", "stackFrames",
                       "temporaryDreamState", "simulationState"]
        });

        // 2. resolve conflicts via the memory lattice (writes back into snapshot states).
        var resolution = memoryLattice.resolve(snapshots, opts.target || {});
        if (!resolution.ok) return { ok: false, error: resolution.error };

        // 3. consult historyAddress — mergedVersion pulls from latest.
        var addr = historyAddress(opts.canonicalId);
        var mergedVersion = addr.latest + 1;

        // 4. construct ONE canonical materialized body.
        var bodyId = "body-" + (++seq);
        var body = {
            bodyId: bodyId,
            canonicalId: opts.canonicalId,
            state: resolution.resolvedState,
            _closure: closed,    // materialized closure reachable fields (informational)
            target: (opts.target && opts.target.targetDomain) || null,
            anchor: (opts.target && opts.target.anchor) || null,
            provenance: {
                sources: snapshots.map(function(s){ return s.source; }),
                mergedVersion: mergedVersion,
                inferredAt: Date.now(),
                historyAddress: { canonicalId: addr.canonicalId, latest: addr.latest }
            },
            materializedAt: Date.now()
        };

        // 5. consume source representations. Their info is already in body.state.
        for (var i = 0; i < snapshots.length; i++) {
            addr.slots.consumed.push({ source: snapshots[i].source, at: Date.now() });
        }
        addr.latest = mergedVersion;
        addr.blocks.push({ bodyId: bodyId, version: mergedVersion, sources: body.provenance.sources });

        // 6. invariant: only this bodyId is materialized for the canonical post-call.
        //    (no prior bodyIds are tracked for infer materializations.)

        return { ok: true, body: body };
    }

    function inferStats() {
        var out = {};
        for (var k in historyAddresses) {
            var a = historyAddresses[k];
            out[k] = { latest: a.latest, consumed: a.slots.consumed.length, blocks: a.blocks.length };
        }
        return out;
    }

    // ---- Exports --------------------------------------------------------

    return {
        // canonicals (persistent + addressable)
        registerCanonical: registerCanonical,
        getCanonical: getCanonical,
        listCanonicals: listCanonicals,
        // bodies (warp / allocate path)
        listBodies: listBodies,
        stats: stats,
        reservationsFor: reservationsFor,
        release: release,
        // allocation pipeline
        allocate: allocate,
        resolveIncarnationPoint: resolveIncarnationPoint,
        occupancy: occupancy,
        checkTerrain: checkTerrain,
        checkCollisionVolume: checkCollisionVolume,
        checkChronology: checkChronology,
        reserve: reserve,
        instantiate: instantiate,
        // warp-time (persistent-stream primitive)
        warp: warp,
        // inference layer (singularity collapse)
        infer: infer,
        inferStats: inferStats,
        materialClosure: materialClosure,
        historyAddress: historyAddress,
        memoryLattice: memoryLattice
    };
})();

if (typeof window !== "undefined") {
    window.incarnationBody = incarnationBody;
}