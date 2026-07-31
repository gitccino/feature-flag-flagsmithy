import assert from "node:assert/strict"

import {
  auditDiffRows,
  auditPayloadName,
  formatAuditValue,
} from "@/lib/audit-diff"

// A create has no `before` — every field reads as added.
assert.deepEqual(auditDiffRows(null, { name: "Checkout", key: "checkout" }), [
  { key: "name", before: "—", after: "Checkout" },
  { key: "key", before: "—", after: "checkout" },
])

// A delete has no `after` — every field reads as removed.
assert.deepEqual(auditDiffRows({ name: "Checkout" }, null), [
  { key: "name", before: "Checkout", after: "—" },
])

// An update lists only the fields that actually moved.
assert.deepEqual(
  auditDiffRows(
    { enabled: false, rolloutPercentage: 100 },
    { enabled: true, rolloutPercentage: 100 },
  ),
  [{ key: "enabled", before: "false", after: "true" }],
)

// api_key entries are allowlisted: only name/keyPrefix/revokedAt render, so
// an unforeseen field name fails closed rather than leaking.
assert.deepEqual(
  auditDiffRows(
    null,
    {
      name: "CI key",
      keyPrefix: "fsk_dev_ab12",
      keyHash: "d0d0deadbeef",
      plaintext: "fsk_dev_ab12_supersecret",
      // a field no denylist pattern would have caught
      apiKey: "fsk_dev_ab12_supersecret",
    },
    "api_key",
  ),
  [
    { key: "name", before: "—", after: "CI key" },
    { key: "keyPrefix", before: "—", after: "fsk_dev_ab12" },
  ],
)

// A revoke renders its timestamp — revokedAt is on the allowlist.
assert.deepEqual(
  auditDiffRows(
    { name: "CI key", keyPrefix: "fsk_dev_ab12" },
    {
      name: "CI key",
      keyPrefix: "fsk_dev_ab12",
      revokedAt: "2026-07-27T10:00:00.000Z",
    },
    "api_key",
  ),
  [
    {
      key: "revokedAt",
      before: "—",
      after: "2026-07-27T10:00:00.000Z",
    },
  ],
)

// Every other entity keeps the denylist: ordinary config renders, secrets
// don't. A flag's `key` is a real field, not secret material.
assert.deepEqual(
  auditDiffRows(null, { key: "checkout", secretToken: "abc" }, "flag"),
  [{ key: "key", before: "—", after: "checkout" }],
)

// An unrecognised entity type falls back to the denylist — a new writer is
// never accidentally exempt from filtering.
assert.deepEqual(
  auditDiffRows(null, { name: "x", passwordHash: "abc" }, "something_new"),
  [{ key: "name", before: "—", after: "x" }],
)

// jsonb is untyped: a non-object payload must diff as empty, not throw.
assert.deepEqual(auditDiffRows("nope", 42), [])
assert.deepEqual(auditDiffRows(["a"], null), [])

// Cell rendering: absent and null both read as "not set".
assert.equal(formatAuditValue(null), "—")
assert.equal(formatAuditValue(undefined), "—")
assert.equal(formatAuditValue(""), '""')
assert.equal(formatAuditValue("Checkout"), "Checkout")
assert.equal(formatAuditValue(0), "0")
assert.equal(formatAuditValue(false), "false")
assert.equal(formatAuditValue({ a: 1 }), '{"a":1}')

// An API key revoke leaves name and keyPrefix unchanged, so the diff drops
// both — the payload name is the only thing left identifying which key.
assert.equal(
  auditPayloadName(
    { name: "CI key", keyPrefix: "fsk_dev_ab12" },
    {
      name: "CI key",
      keyPrefix: "fsk_dev_ab12",
      revokedAt: "2026-07-27T10:00:00.000Z",
    },
  ),
  "CI key",
)

// A rename shows the new name: `after` wins over `before`.
assert.equal(auditPayloadName({ name: "Old" }, { name: "New" }), "New")

// A delete has no `after` at all — fall back to `before`.
assert.equal(auditPayloadName({ name: "Gone" }, null), "Gone")

// No name to find, or an unusable one, is null rather than a blank label.
assert.equal(auditPayloadName(null, { enabled: true }), null)
assert.equal(auditPayloadName(null, { name: "" }), null)
assert.equal(auditPayloadName(null, { name: 42 }), null)
assert.equal(auditPayloadName("nope", null), null)

console.log("audit-diff.test.ts OK")
