"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FORBIDDEN_PUBLICATION_FIELDS = void 0;
/**
 * Medan penerbitan DILARANG hadir dalam input staging (rekod staging tidak
 * boleh membawa keadaan penerbitan). Digunakan oleh pengesahan.
 */
exports.FORBIDDEN_PUBLICATION_FIELDS = [
    "publicationStatus",
    "publishedAt",
    "publishedVersion",
];
