/**
 * Turn an audit entry's `before`/`after` jsonb into a flat list of changed
 * fields for rendering. Both sides are `unknown` — the columns are untyped
 * jsonb and every writer shapes them differently — so nothing here trusts a
 * shape it hasn't checked.
 */

/**
 * Secrets are not supposed to reach this table: the API key writers persist
 * `name` + `keyPrefix` only, never the plaintext or hash. This is the second
 * line of defence — the diff is rendered verbatim, so a future writer that
 * slips a secret into the payload must not surface it on the audit page.
 */
const REDACTED_KEY = /hash|secret|token|password|plaintext|credential/i

export type AuditDiffRow = {
  key: string
  before: string
  after: string
}

/** Only a plain JSON object has fields to diff; anything else diffs as empty. */
function fields(value: unknown): Map<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return new Map()
  }
  return new Map(Object.entries(value))
}

/** Render one jsonb value as a cell. Absent and null both read as "not set". */
export function formatAuditValue(value: unknown): string {
  if (value === undefined || value === null) return "—"
  if (typeof value === "string") return value === "" ? '""' : value
  return JSON.stringify(value)
}

/**
 * Changed fields only, in first-seen order (before's keys, then after's).
 * A create has no `before` so every field shows as added; a delete has no
 * `after` so every field shows as removed.
 */
export function auditDiffRows(before: unknown, after: unknown): AuditDiffRow[] {
  const beforeFields = fields(before)
  const afterFields = fields(after)
  const keys = new Set([...beforeFields.keys(), ...afterFields.keys()])

  return [...keys]
    .filter((key) => !REDACTED_KEY.test(key))
    .map((key) => ({
      key,
      before: formatAuditValue(beforeFields.get(key)),
      after: formatAuditValue(afterFields.get(key)),
    }))
    .filter((row) => row.before !== row.after)
}
