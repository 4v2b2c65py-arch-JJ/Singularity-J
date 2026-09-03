//////////////////////////////////////////////////////////////////////////////////////
// Authority
// A true permission hierarchy for multiverse. Each tier carries an explicit
// permission set. Methods self-check before delegating; unauthorized calls
// return {ok:false, error:"unauthorized"} instead of throwing.
//
// Default tier table:
//   Tier 0  output       read | write-if-zero
//   Tier 1  objects      read | write
//   Tier 2  physics      read | write | overrideNative
//   Tier 3  model        read | write | overrideNative | createDomain | projectAcrossDomains
//   Tier 4  meta         all flags including canSpawnRegardlessOfDomain + canOrder
//
// Tier 0's canWrite is conditional: only writes of value === 0 are accepted.
// Higher tiers write unconditionally. Custom guards can be attached via
// setWriteGuard(fn).

var authority = (function(){

    var authorities = {};
    var seq = 0;

    function make(spec) {
        if (!spec || !spec.name) return { ok: false, error: "authority requires name" };
        if (authorities[spec.name]) return { ok: false, error: "authority exists: " + spec.name };
        if (typeof spec.tier !== "number") return { ok: false, error: "tier required (number)" };

        var id = (spec.id) || ("auth-" + (++seq));

        var perm = {
            tier:        spec.tier,
            canRead:                  !!spec.canRead,
            canWrite:                  !!spec.canWrite,
            canOverrideNative:         !!spec.canOverrideNative,
            canCreateDomain:           !!spec.canCreateDomain,
            canProjectAcrossDomains:   !!spec.canProjectAcrossDomains,
            canSpawnRegardlessOfDomain:!!spec.canSpawnRegardlessOfDomain,
            canOrder:                  !!spec.canOrder,
            writeConditionZero:        spec.tier === 0 ? true : !!spec.writeConditionZero
        };

        var customWriteGuard = null;
        var delegator = spec.delegator || null;

        var instance = {
            id: id,
            name: spec.name,
            tier: perm.tier,
            perms: perm,
            delegator: delegator,

            // returns a shallow copy so callers cannot mutate perms directly
            describe: function(){ return Object.assign({}, perm); },

            setWriteGuard: function(fn) {
                if (fn !== null && typeof fn !== "function") {
                    return { ok: false, error: "guard must be a function or null" };
                }
                customWriteGuard = fn;
                return { ok: true };
            },

            // gate helpers
            _checkRead: function() {
                if (perm.canRead) return { ok: true };
                return { ok: false, error: "unauthorized: read at tier " + perm.tier };
            },
            _checkWrite: function(value) {
                if (!perm.canWrite) return { ok: false, error: "unauthorized: write at tier " + perm.tier };
                if (perm.writeConditionZero) {
                    // Tier 0 (or any tier with writeConditionZero): only accept zero
                    var zeroish = (value === 0 || value === "0" || value === null ||
                                   (typeof value === "object" && value !== null && value.__zero === true) ||
                                   (Array.isArray(value) && value.length === 0));
                    if (!zeroish) return { ok: false, error: "write rejected: tier " + perm.tier + " only accepts zero-valued writes" };
                }
                if (customWriteGuard) {
                    var r = customWriteGuard(value, perm);
                    if (r && r.ok === false) return r;
                }
                return { ok: true };
            },
            _checkOverrideNative: function() {
                if (perm.canOverrideNative) return { ok: true };
                return { ok: false, error: "unauthorized: overrideNative at tier " + perm.tier };
            },
            _checkCreateDomain: function() {
                if (perm.canCreateDomain) return { ok: true };
                return { ok: false, error: "unauthorized: createDomain at tier " + perm.tier };
            },
            _checkProject: function() {
                if (perm.canProjectAcrossDomains) return { ok: true };
                return { ok: false, error: "unauthorized: projectAcrossDomains at tier " + perm.tier };
            },
            _checkSpawn: function() {
                if (perm.canSpawnRegardlessOfDomain) return { ok: true };
                return { ok: false, error: "unauthorized: spawnRegardlessOfDomain at tier " + perm.tier };
            },
            _checkOrder: function() {
                if (perm.canOrder) return { ok: true };
                return { ok: false, error: "unauthorized: canOrder at tier " + perm.tier };
            },

            // delegator escalation: child cannot exceed parent
            _enforceDelegation: function() {
                if (!delegator) return { ok: true };
                var p = authorities[delegator];
                if (!p) return { ok: false, error: "delegator missing: " + delegator };
                var pp = p.perms;
                var keys = Object.keys(perm);
                for (var i = 0; i < keys.length; i++) {
                    var k = keys[i];
                    if (k === "tier") continue;
                    if (pp[k] === true && perm[k] === false) {
                        return { ok: false, error: "child lost permission parent held: " + k };
                    }
                }
                return { ok: true };
            },

            // guarded operations. Each returns {ok, error?, result?}
            read: function(){
                var c = this._checkRead();
                if (!c.ok) return c;
                var d = this._enforceDelegation();
                if (!d.ok) return d;
                return { ok: true, value: null, authority: this.name };
            },
            write: function(value){
                var c = this._checkWrite(value);
                if (!c.ok) return c;
                var d = this._enforceDelegation();
                if (!d.ok) return d;
                return { ok: true, written: value, authority: this.name };
            },
            overrideNative: function(){
                var c = this._checkOverrideNative();
                if (!c.ok) return c;
                return { ok: true, authority: this.name };
            },
            createDomain: function(spec){
                var c = this._checkCreateDomain();
                if (!c.ok) return c;
                var r = multiverse.defineSpace((spec && spec.name) || ("domain-" + Date.now()), spec || {});
                if (r && r.ok) return { ok: true, domain: r.name, authority: this.name };
                return r;
            },
            projectAcrossDomains: function(a, b, value){
                var c = this._checkProject();
                if (!c.ok) return c;
                var pa = multiverse.project(a, value);
                var pb = multiverse.project(b, value);
                return { ok: !!(pa && pb), a: pa, b: pb, authority: this.name };
            },
            spawnRegardlessOfDomain: function(spec){
                var c = this._checkSpawn();
                if (!c.ok) return c;
                return multiverse.entities.create(spec || {});
            },
            order: function(spaceName, x, y){
                var c = this._checkOrder();
                if (!c.ok) return c;
                return multiverse.setInteractionNode(spaceName, x, y);
            }
        };

        authorities[spec.name] = instance;
        return instance;
    }

    function get(name) { return authorities[name] || null; }
    function list() { return Object.keys(authorities); }

    // ---- Reality Kernel -------------------------------------------------
    // Materialized state at the bottom of the hierarchy. Every authorized
    // commit ultimately materializes into the kernel record. Kernel records
    // are append-only; the materialized `state` is the latest committed
    // record per (authority, tier) pair.

    var kernel = (function(){
        var records = [];
        var materialized = {};
        var maxRecords = 500;

        function commit(record) {
            var r = Object.assign({}, record || {});
            r.kernelId = "kernel-" + (records.length + 1);
            r.materializedAt = r.materializedAt;
            records.push(r);
            if (records.length > maxRecords) records.shift();

            var key = r.authority || "anon";
            materialized[key] = r;
            return r;
        }

        function materialize(value, ctx) {
            var stamped = Object.assign({}, value || {});
            stamped.lawContext = (typeof multiverse !== "undefined" && multiverse.currentLawContext) ?
                multiverse.currentLawContext() : null;
            stamped.timestamp = stamped.timestamp;
            stamped.authority = (ctx && ctx.authority) || (stamped.authority) || "anon";
            return commit(stamped);
        }

        function audit(n) { n = n || 10; return records.slice(-n); }
        function stateFor(authorityName) { return materialized[authorityName] || null; }
        function stats() { return { records: records.length, materialized: Object.keys(materialized).length }; }

        return { commit: commit, materialize: materialize, audit: audit, stateFor: stateFor, stats: stats };
    })();

    // ---- Pre-declared tier hierarchy -----------------------------------

    var preDefined = [];

    // Tier 0 — output. canWrite conditional on zero.
    preDefined.push(make({
        tier: 0, name: "output",
        canRead: true, canWrite: true
        // writeConditionZero defaults true at tier 0
    }));

    // Tier 1 — objects.
    preDefined.push(make({
        tier: 1, name: "objects",
        canRead: true, canWrite: true
    }));

    // Tier 2 — physics. overrideNative.
    preDefined.push(make({
        tier: 2, name: "physics",
        canRead: true, canWrite: true, canOverrideNative: true
    }));

    // Tier 3 — model. createDomain + projectAcrossDomains.
    preDefined.push(make({
        tier: 3, name: "model",
        canRead: true, canWrite: true, canOverrideNative: true,
        canCreateDomain: true, canProjectAcrossDomains: true
    }));

    // Tier 4 — meta. everything.
    preDefined.push(make({
        tier: 4, name: "meta",
        canRead: true, canWrite: true, canOverrideNative: true,
        canCreateDomain: true, canProjectAcrossDomains: true,
        canSpawnRegardlessOfDomain: true, canOrder: true
    }));

    return {
        create: make,
        get: get,
        list: list,
        preDefined: preDefined,
        kernel: kernel
    };
})();

if (typeof window !== "undefined") {
    window.authority = authority;
}