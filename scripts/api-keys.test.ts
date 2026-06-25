import assert from "node:assert/strict";

import { generateApiKey, hashApiKey, parseBearer } from "@/lib/api-keys";

// generate -> hash -> parse round-trip
const { plaintext, keyPrefix, keyHash } = generateApiKey("production");

assert.match(plaintext, /^fsk_production_[A-Za-z0-9_-]+$/, "plaintext format");
assert.ok(keyPrefix.startsWith("fsk_production_"), "prefix format");
assert.ok(plaintext.startsWith(keyPrefix), "prefix is a prefix of plaintext");
assert.equal(hashApiKey(plaintext), keyHash, "hash is stable + deterministic");
assert.notEqual(plaintext, keyHash, "hash != plaintext");

// the hash a client request would produce must match what we stored
const fromBearer = parseBearer(`Bearer ${plaintext}`);
assert.equal(fromBearer, plaintext, "parseBearer round-trips plaintext");
assert.equal(hashApiKey(fromBearer!), keyHash, "bearer hash matches stored");

// parseBearer edge cases
assert.equal(parseBearer(null), null);
assert.equal(parseBearer("bearer abc"), "abc", "scheme is case-insensitive");
assert.equal(parseBearer("Bearer   "), null, "empty token -> null");
assert.equal(parseBearer("abc"), null, "no scheme -> null");

// uniqueness: two keys differ
assert.notEqual(generateApiKey("staging").plaintext, generateApiKey("staging").plaintext);

console.log("api-keys round-trip ok");
