"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLACE_STATUS_AUDIT_ACTIONS = void 0;
exports.statusAuditId = statusAuditId;
const hashing_1 = require("../staging/hashing");
exports.PLACE_STATUS_AUDIT_ACTIONS = [
    "business_status_changed",
    "verification_status_changed",
    "publication_status_changed",
    "publication_created",
    "publication_superseded",
    "publication_head_moved",
    "rollback_requested",
    "rollback_approved",
    "rollback_executed",
    "rollback_rejected",
];
/** ID audit deterministik (elak pendua bagi peristiwa yang sama). */
function statusAuditId(placeId, action, createdAt, discriminator) {
    const digest = (0, hashing_1.hashCanonical)({ placeId, action, createdAt, discriminator });
    return `aud_${digest.slice(0, 32)}`;
}
