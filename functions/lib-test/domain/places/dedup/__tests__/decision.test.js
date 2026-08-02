"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const index_1 = require("../index");
const F = __importStar(require("./fixtures"));
const decide = (a, b) => (0, index_1.evaluateDuplicateDecision)((0, index_1.computeSignals)(a, b));
// 1 & Golden A. Exact same provider ID → auto-link.
(0, node_test_1.default)("exact provider id → auto_link_source", () => {
    strict_1.default.equal(decide(F.A_google1, F.A_google2).decision, "auto_link_source");
});
// 2. Exact merchant registration ID → auto-link.
(0, node_test_1.default)("exact merchant id → auto_link_source", () => {
    strict_1.default.equal(decide(F.M_a, F.M_b).decision, "auto_link_source");
});
// 3 & Golden B. Same phone + close coordinates → review (high confidence).
(0, node_test_1.default)("phone + close coords → review_required", () => {
    const r = decide(F.B_google, F.B_owner);
    strict_1.default.equal(r.decision, "review_required");
});
// 4. Same name only → not auto-merge (possible duplicate max).
(0, node_test_1.default)("same name only → possible_duplicate (never auto-merge)", () => {
    const r = decide(F.N_a, F.N_b);
    strict_1.default.equal(r.decision, "possible_duplicate");
});
// 5 & Golden C & 20. Same chain + different branch → likely separate branch.
(0, node_test_1.default)("same chain different branch → likely_separate_branch (blocks auto-merge)", () => {
    const r = decide(F.C_mall1, F.C_mall2);
    strict_1.default.equal(r.decision, "likely_separate_branch");
    strict_1.default.notEqual(r.decision, "auto_link_source");
});
// 6 & Golden D. Same name + far coordinates → separate (not merged).
(0, node_test_1.default)("same name + far coordinates → not merged", () => {
    const r = decide(F.D_kl, F.D_penang);
    strict_1.default.ok(["likely_separate_branch", "separate_place"].includes(r.decision));
    strict_1.default.notEqual(r.decision, "auto_link_source");
});
// 7. Similar name + same address + same phone → review.
(0, node_test_1.default)("name + address + phone → review_required", () => {
    strict_1.default.equal(decide(F.G7_a, F.G7_b).decision, "review_required");
});
// 8. Conflicting verified phones → no auto-merge.
(0, node_test_1.default)("conflicting phones → no auto-merge", () => {
    const r = decide(F.P_a, F.P_b);
    strict_1.default.ok(!["auto_link_source", "exact_duplicate"].includes(r.decision));
});
// Golden E. Renamed at same location + phone → review with rename warning.
(0, node_test_1.default)("renamed at same location+phone → review + possible_rename warning", () => {
    const r = decide(F.E_old, F.E_new);
    strict_1.default.equal(r.decision, "review_required");
    strict_1.default.ok(r.warnings.includes("possible_rename_or_moved"));
});
// Golden F. Moved restaurant → review (do not auto-merge).
(0, node_test_1.default)("moved restaurant (same name+phone, far coords) → review_required", () => {
    const r = decide(F.F_before, F.F_after);
    strict_1.default.equal(r.decision, "review_required");
});
// Golden H. Similar spelling + exact phone → review (high confidence).
(0, node_test_1.default)("similar spelling + exact phone → review_required", () => {
    strict_1.default.equal(decide(F.H_a, F.H_b).decision, "review_required");
});
// Separate businesses → separate_place.
(0, node_test_1.default)("clearly different businesses → separate_place", () => {
    strict_1.default.equal(decide(F.S_a, F.S_b).decision, "separate_place");
});
