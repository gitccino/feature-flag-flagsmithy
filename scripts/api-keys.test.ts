import assert from "node:assert/strict";

import { generateApiKey, hashApiKey, parseBearer } from "@/lib/api-keys";
import { revokeApiKeySchema } from "@/lib/zod-schema";

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

// The stored prefix is displayed in the admin UI, so it must not be usable as a
// credential: hashing it can never produce the stored hash the endpoint looks up.
assert.notEqual(hashApiKey(keyPrefix), keyHash, "prefix does not authenticate");
assert.ok(
  keyPrefix.length < plaintext.length,
  "prefix is a truncation, not the whole key",
);

// Revoke input is uuid-only — a non-uuid must never reach the DB as a raw cast.
assert.equal(revokeApiKeySchema.safeParse({ apiKeyId: "nope" }).success, false);
assert.equal(revokeApiKeySchema.safeParse({}).success, false);
assert.equal(
  revokeApiKeySchema.safeParse({
    apiKeyId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
  }).success,
  true,
);

console.log("api-keys round-trip ok");
