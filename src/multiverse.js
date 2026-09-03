//////////////////////////////////////////////////////////////////////////////////////
// Multiverse
//
// Three native realities (Physical, Spiritual, Abstract), a canonical anchor,
// cross-space law registration, atomic commits stamped with lawContext, an
// EntityRegistry that unifies Pac-Man, ghosts, and humans into a single data
// class with a weight primitive, and a coincidence / common-layer mechanism
// that erases native laws when two spaces' interaction nodes coincide.

var multiverse = (function(){

    // ---- EntityRegistry ------------------------------------------------
    // Single data class for every actor: Pac-Man, every ghost, the human
    // at the keyboard, anyone else the user creates. Each entity is a
    // canonical record with .kind, .name, .weight (numeric primitive), .id.

    var entities = {};
    var entityList = [];
    var entitySeq = 0;

    function createEntity(spec) {
        var e = {
            id: (spec && spec.id) || ("entity-" + (++entitySeq)),
            kind:   (spec && spec.kind)   || "agent",
            name:   (spec && spec.name)   || null,
            weight: (typeof (spec && spec.weight) === "number") ? spec.weight : 1.0,
            ref:    (spec && spec.ref) || null,    // optional live binding (e.g. pacman instance)
            meta:   (spec && spec.meta) || {},
            createdAt: Date.now()
        };
        entities[e.id] = e;
        entityList.push(e);
        return e;
    }

    function getEntity(id) { return entities[id] || null; }
    function allEntities() { return entityList.slice(); }
    function ofKind(kind)  { return entityList.filter(function(e){ return e.kind === kind; }); }
    function setWeight(id, w) {
        var e = entities[id];
        if (!e) return { ok: false, error: "no entity: " + id };
        if (typeof w !== "number") return { ok: false, error: "weight must be a number" };
        e.weight = w;
        return { ok: true, id: id, weight: w };
    }
    function weightOf(id) {
        var e = entities[id];
        return e ? e.weight : null;
    }

    // pre-register canonical actors so Pac-Man, ghosts, and the human are
    // already instances of the same data class at module-load time.
    (function preRegister(){
        createEntity({ id: "pacman",    kind: "agent",      name: "pacman", weight: 1.0, meta: { role: "player" } });
        createEntity({ id: "blinky",    kind: "ghost",      name: "blinky", weight: 0.9, meta: { color: "#FF0000" } });
        createEntity({ id: "pinky",     kind: "ghost",      name: "pinky",  weight: 0.9, meta: { color: "#FFB8FF" } });
        createEntity({ id: "inky",      kind: "ghost",      name: "inky",   weight: 0.9, meta: { color: "#00FFFF" } });
        createEntity({ id: "clyde",     kind: "ghost",      name: "clyde",  weight: 0.9, meta: { color: "#FFB851" } });
        createEntity({ id: "human",     kind: "controller", name: "human",  weight: 1.0, meta: { input: "keyboard+touch" } });
    })();

    // optional: re-bind entities to live instances once the game has them.
    function bindLiveRef(id, ref) {
        var e = entities[id];
        if (!e) return { ok: false, error: "no entity: " + id };
        e.ref = ref;
        return { ok: true, id: id };
    }

    // ---- Spaces, anchor, laws, embeddings (kept from prior turn) ------

    var spaces = {};
    var laws = {};
    var embeddings = {};
    var commits = [];
    var maxCommits = 200;

    function anchor(x, y) { return { x: x|0, y: y|0 }; }

    function defineSpace(name, def) {
        if (!name || typeof name !== "string") {
            return { ok: false, error: "space name required" };
        }
        if (spaces[name]) return { ok: false, error: "space exists: " + name };
        spaces[name] = {
            name: name,
            objects: (def && def.objects) ? def.objects : [],
            rules:   (def && def.rules)   ? def.rules   : {},
            interactionNode: anchor(0, 0),
            getCoord: function(obj) {
                if (obj && obj.tile) return anchor(obj.tile.x, obj.tile.y);
                if (obj && obj.pixel) {
                    var ts = (typeof tileSize !== "undefined") ? tileSize : 8;
                    return anchor(Math.floor(obj.pixel.x / ts), Math.floor(obj.pixel.y / ts));
                }
                if (obj && obj.historyIndex !== undefined) return anchor(0, obj.historyIndex);
                if (obj && obj.id && entities[obj.id] && entities[obj.id].weight !== undefined) {
                    return anchor(0, Math.floor(entities[obj.id].weight * 100));
                }
                return anchor(0, 0);
            }
        };
        return { ok: true, name: name };
    }

    function getSpace(name) { return spaces[name] || null; }
    function listSpaces() { return Object.keys(spaces); }

    function setInteractionNode(name, x, y) {
        var s = spaces[name];
        if (!s) return { ok: false, error: "no space: " + name };
        s.interactionNode = anchor(x, y);
        return { ok: true, name: name, node: s.interactionNode };
    }
    function interactionNodeOf(name) {
        var s = spaces[name];
        return s ? Object.assign({}, s.interactionNode) : null;
    }

    function law(name, fromName, toName, fn) {
        if (!spaces[fromName] || !spaces[toName]) {
            return { ok: false, error: "unknown space: " + fromName + " or " + toName };
        }
        if (typeof fn !== "function") {
            return { ok: false, error: "law fn must be a function" };
        }
        laws[name] = { from: fromName, to: toName, fn: fn };
        return { ok: true, name: name };
    }

    function runLaw(name, value, ctx) {
        var l = laws[name];
        if (!l) return { ok: false, error: "no law: " + name };
        try { return { ok: true, result: l.fn(value, ctx || {}) }; }
        catch (e) { return { ok: false, error: "law threw: " + e.message }; }
    }

    function listLaws() { return Object.keys(laws); }

    function embed(parent, child) {
        if (!spaces[parent] || !spaces[child]) {
            return { ok: false, error: "unknown space: " + parent + " or " + child };
        }
        embeddings[child] = parent;
        return { ok: true, child: child, parent: parent };
    }
    function parentOf(name) { return embeddings[name] || null; }

    function project(spaceName, object) {
        var s = spaces[spaceName];
        if (!s) return null;
        return { space: spaceName, anchor: s.getCoord(object), object: object };
    }

    // ---- Law context (META / AUTHORITY stamping) -----------------------

    function currentLawContext() {
        var ctx = { signature: null, intent: null, validFor: 0, version: 0, entities: entityList.map(function(e){ return {id:e.id, kind:e.kind, weight:e.weight}; }) };
        if (typeof realityStack !== "undefined" && realityStack) {
            try {
                var snap = realityStack.snapshot();
                if (typeof realityStack.read === "function") {
                    var m = realityStack.read(4);
                    if (m) {
                        ctx.signature = m.signature || null;
                        ctx.intent = m.intent || null;
                    }
                }
                ctx.validFor = snap.frame;
                ctx.version = snap.frame;
            } catch (e) { /* realityStack read failed; ctx stays default */ }
        }
        return ctx;
    }

    // ---- Coincidence and common layer ----------------------------------

    // coincide: two spaces coincide iff their interaction nodes match.
    function coincide(spaceA, spaceB) {
        var a = spaces[spaceA], b = spaces[spaceB];
        if (!a || !b) return { ok: false, error: "unknown space" };
        var same = (a.interactionNode.x === b.interactionNode.x &&
                    a.interactionNode.y === b.interactionNode.y);
        if (!same) {
            return { coincident: false, a: a.interactionNode, b: b.interactionNode };
        }
        // when coincident: collect the native laws that would normally apply
        var erasedNativeLaws = [];
        for (var name in laws) {
            var l = laws[name];
            if ((l.from === spaceA || l.from === spaceB) &&
                (l.to  === spaceA || l.to  === spaceB)) {
                erasedNativeLaws.push(name);
            }
        }
        return {
            coincident: true,
            anchor: anchor(a.interactionNode.x, a.interactionNode.y),
            erasedNativeLaws: erasedNativeLaws,
            mergedSpaces: [spaceA, spaceB]
        };
    }

    function coincideAll() {
        var names = Object.keys(spaces);
        var pairs = [];
        for (var i = 0; i < names.length; i++) {
            for (var j = i + 1; j < names.length; j++) {
                var r = coincide(names[i], names[j]);
                if (r.coincident) pairs.push({ a: names[i], b: names[j], anchor: r.anchor, erasedNativeLaws: r.erasedNativeLaws });
            }
        }
        return pairs;
    }

    // commonLayer: when two spaces coincide, their native laws cancel and
    // only cross-space laws run. This is exposed as a single object the
    // user invokes; it never auto-triggers.
    var commonLayer = (function(){
        function commit(event) {
            var stamped = Object.assign({}, event || {});
            stamped.lawContext = currentLawContext();
            stamped.timestamp = stamped.timestamp;

            // find all coincident space pairs touched by this event
            var pairs = coincideAll();
            var touchedSpaces = [];
            for (var i = 0; i < pairs.length; i++) {
                if (event && event.space &&
                    (pairs[i].a === event.space || pairs[i].b === event.space)) {
                    touchedSpaces.push(pairs[i]);
                }
            }
            stamped.coincidentPairs = touchedSpaces;

            // run only cross-space laws; native rules are masked
            var applied = [];
            if (event && event.space) {
                for (var name in laws) {
                    var l = laws[name];
                    if (l.from === event.space) {
                        var r = runLaw(name, event.value || event.object, { event: stamped, maskNative: true });
                        if (r.ok) applied.push({ law: name, from: l.from, to: l.to, result: r.result });
                    }
                }
            }
            stamped.appliedLaws = applied;

            commits.push(stamped);
            if (commits.length > maxCommits) commits.shift();
            return stamped;
        }

        function isActive() { return coincideAll().length > 0; }

        return { commit: commit, isActive: isActive };
    })();

    // ---- Atomic commit (kept; now also uses coincidence info) ---------

    function atomic(event) {
        var stamped = Object.assign({}, event || {});
        stamped.lawContext = currentLawContext();
        stamped.timestamp = stamped.timestamp;
        stamped.anchor = (event && event.anchor) ? event.anchor : anchor(0, 0);

        var applied = [];
        if (event && event.space && laws) {
            for (var name in laws) {
                var l = laws[name];
                if (l.from === event.space) {
                    var r = runLaw(name, event.value || event.object, { event: stamped });
                    if (r.ok) applied.push({ law: name, from: l.from, to: l.to, result: r.result });
                }
            }
        }
        stamped.appliedLaws = applied;

        if (event && event.space && embeddings[event.space]) {
            var p = embeddings[event.space];
            stamped.parentProjection = project(p, event.value || event.object);
        }

        stamped.coincident = coincideAll().length > 0;
        commits.push(stamped);
        if (commits.length > maxCommits) commits.shift();
        return stamped;
    }

    function recent(n) { n = n || 10; return commits.slice(-n); }

    function stats() {
        return {
            spaces: Object.keys(spaces),
            laws: Object.keys(laws),
            embeddings: Object.assign({}, embeddings),
            commits: commits.length,
            entities: entityList.map(function(e){ return { id:e.id, kind:e.kind, name:e.name, weight:e.weight }; }),
            coincidentPairs: coincideAll().length
        };
    }

    // ---- Pre-declared native realities ---------------------------------

    // Native objects now source from the EntityRegistry, so Pac-Man, ghosts,
    // and humans are the same data class at this layer.
    function physicalObjects() {
        var arr = allEntities();
        if (typeof actors !== "undefined") {
            for (var i = 0; i < actors.length; i++) arr.push(actors[i]);
        }
        return arr;
    }
    function spiritualObjects() {
        return allEntities().filter(function(e){ return e.kind === "ghost" || e.kind === "agent" || e.kind === "controller"; });
    }
    function abstractObjects() {
        return commits.slice(-50);
    }

    defineSpace("physical", { objects: physicalObjects, rules: { floor: "isFloorTile", step: "commitPos" } });
    defineSpace("spiritual", { objects: spiritualObjects, rules: { transition: "ghostCommander", release: "ghostReleaser" } });
    defineSpace("abstract",  { objects: abstractObjects,  rules: { validate: "incarnation", signature: "realityStack" } });

    // default cross-space laws (entity-aware)
    law("physicalToSpiritual", "physical", "spiritual", function(value, ctx) {
        if (typeof ghosts === "undefined" || !ghosts) return value;
        var p = (typeof pacman !== "undefined") ? pacman : null;
        if (!p) return value;
        for (var i=0;i<ghosts.length;i++) {
            if (ghosts[i].mode === 2) ghosts[i].mode = 6;
        }
        return { pacmanTile: p.tile, ghosts: ghosts.length, weights: ofKind("ghost").map(function(g){ return g.weight; }) };
    });
    law("spiritualToAbstract", "spiritual", "abstract", function(value, ctx) {
        var stamped = Object.assign({}, value || {});
        stamped.recordedAt = commits.length;
        return stamped;
    });

    embed("physical", "spiritual");
    embed("physical", "abstract");

    return {
        // anchor / spaces / laws / embeddings
        anchor: anchor,
        defineSpace: defineSpace,
        getSpace: getSpace,
        listSpaces: listSpaces,
        setInteractionNode: setInteractionNode,
        interactionNodeOf: interactionNodeOf,
        law: law,
        runLaw: runLaw,
        listLaws: listLaws,
        embed: embed,
        parentOf: parentOf,
        project: project,
        // commits
        atomic: atomic,
        recent: recent,
        currentLawContext: currentLawContext,
        stats: stats,
        // entity registry (Pac-Man, ghosts, human, all the same class)
        entities: {
            create: createEntity,
            get: getEntity,
            all: allEntities,
            ofKind: ofKind,
            setWeight: setWeight,
            weightOf: weightOf,
            bindLiveRef: bindLiveRef
        },
        // coincidence + common layer
        coincide: coincide,
        coincideAll: coincideAll,
        commonLayer: commonLayer
    };
})();

if (typeof window !== "undefined") {
    window.multiverse = multiverse;
}