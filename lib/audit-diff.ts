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
 *
 * For `api_key` entries the filter is an allowlist, because that is the one
 * entity whose payload sits next to real secret material and a denylist there
 * fails open — an unforeseen field name renders. Every other entity uses the
 * denylist: their payloads are ordinary config, and an allowlist would
 * silently swallow fields as the schema grows.
 */
const API_KEY_VISIBLE_FIELDS = new Set(["name", "keyPrefix", "revokedAt"])
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

/**
 * The name an entry's payload carries for the thing it touched, if any.
 *
 * Used for entities the query can't resolve by id: an API key's row is never
 * deleted but its name lives only in the payload, and a project's own name is
 * the thing being changed. Reads `after` first so a rename shows the new name,
 * falling back to `before` for a delete, which has no `after` at all.
 */
export function auditPayloadName(
  before: unknown,
  after: unknown,
): string | null {
  for (const source of [after, before]) {
    const name = fields(source).get("name")
    if (typeof name === "string" && name !== "") return name
  }
  return null
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
 *
 * `entityType` selects the redaction strategy; an unrecognised type gets the
 * denylist, so a new writer is never accidentally exempt from filtering.
 */
export function auditDiffRows(
  before: unknown,
  after: unknown,
  entityType?: string,
): AuditDiffRow[] {
  const beforeFields = fields(before)
  const afterFields = fields(after)
  const keys = new Set([...beforeFields.keys(), ...afterFields.keys()])
  const visible =
    entityType === "api_key"
      ? (key: string) => API_KEY_VISIBLE_FIELDS.has(key)
      : (key: string) => !REDACTED_KEY.test(key)

  return [...keys]
    .filter(visible)
    .map((key) => ({
      key,
      before: formatAuditValue(beforeFields.get(key)),
      after: formatAuditValue(afterFields.get(key)),
    }))
    .filter((row) => row.before !== row.after)
}
