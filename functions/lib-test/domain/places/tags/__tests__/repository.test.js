"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const fixtures_1 = require("./fixtures");
const ACTOR = { actorUid: "server_admin", actorRole: "admin" };
async function seededStore() {
    const store = new index_1.InMemoryTagStore({ now: () => fixtures_1.T });
    for (const d of index_1.SEED_TAG_DEFINITIONS)
        await store.seedDefinition(d);
    return store;
}
(0, node_test_1.default)("seed + get definition + resolve alias", async () => {
    const store = await seededStore();
    strict_1.default.equal((await store.getDefinition("restaurant"))?.familyId, "place_type");
    strict_1.default.equal(await store.resolveAlias("malaysian"), "malay");
    strict_1.default.equal(await store.resolveAlias("western_food"), "western"); // deprecated → replacement
    strict_1.default.equal(await store.resolveAlias("zzz"), null);
});
(0, node_test_1.default)("list by family is bounded + paginated", async () => {
    const store = await seededStore();
    const p1 = await store.listByFamily("cuisine", { limit: 3 });
    strict_1.default.equal(p1.items.length, 3);
    strict_1.default.ok(p1.nextCursor);
    const p2 = await store.listByFamily("cuisine", { limit: 3, cursor: p1.nextCursor });
    strict_1.default.ok(p2.items.length > 0);
});
(0, node_test_1.default)("propose evidence + approve via valid transition (server actor)", async () => {
    const store = await seededStore();
    await store.createProposedEvidence("mm_1", (0, fixtures_1.ev)("cuisine", "malay"), ACTOR);
    const approved = await store.transitionEvidenceStatus("mm_1", "malay", "approved", ACTOR);
    strict_1.default.equal(approved.status, "approved");
    strict_1.default.equal(approved.approvedBy, "server_admin");
    // Peralihan tidak sah ditolak (approved → proposed).
    await strict_1.default.rejects(() => store.transitionEvidenceStatus("mm_1", "malay", "proposed", ACTOR));
});
(0, node_test_1.default)("store normalized tag set + audit append-only", async () => {
    const store = await seededStore();
    await store.storeNormalizedTagSet("mm_2", [(0, fixtures_1.ev)("place_type", "restaurant"), (0, fixtures_1.ev)("cuisine", "malay")], ACTOR);
    const set = await store.getTagSet("mm_2");
    strict_1.default.equal(set.length, 2);
    const audit = await store.listAudit("mm_2");
    strict_1.default.ok(audit.length >= 1);
    strict_1.default.ok(audit.every((a) => a.actorUid === "server_admin"));
});
// 36 & 37. No place_registry write / publish / delete surface.
(0, node_test_1.default)("repository exposes no registry, publish or delete operation", async () => {
    const store = await seededStore();
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(store));
    const forbidden = names.filter((n) => /registry|publish|promote|delete/i.test(n));
    strict_1.default.deepEqual(forbidden, []);
});
