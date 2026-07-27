import assert from "node:assert/strict"

import { auditDiffRows, formatAuditValue } from "@/lib/audit-diff"

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

// Secret-looking keys never reach the page, even if a writer puts them there.
assert.deepEqual(
  auditDiffRows(null, {
    name: "CI key",
    keyPrefix: "fsk_dev_ab12",
    keyHash: "d0d0deadbeef",
    plaintext: "fsk_dev_ab12_supersecret",
  }),
  [
    { key: "name", before: "—", after: "CI key" },
    { key: "keyPrefix", before: "—", after: "fsk_dev_ab12" },
  ],
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

console.log("audit-diff.test.ts OK")
