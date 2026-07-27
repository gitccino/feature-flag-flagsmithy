import { desc, eq } from "drizzle-orm"
import { cacheTag } from "next/cache"

import { cacheTags } from "@/lib/cache-tags"
import { db } from "@/lib/db"
import { auditLogs, environments, flags } from "@/lib/db/schema"

/**
 * ponytail: hard cap instead of pagination. The table is append-only and a
 * project accumulates one row per admin mutation, so the newest 100 covers
 * every project that exists today. Swap in keyset pagination on `createdAt`
 * (the `audit_logs_project_id_idx` already supports it) when a real project
 * outgrows the cap and someone asks to see past it.
 */
export const AUDIT_LOG_LIMIT = 100

/**
 * A project's audit trail, newest first, capped at AUDIT_LOG_LIMIT.
 *
 * `metadata` (ip / userAgent) is deliberately absent from the column
 * selection — it is request forensics, not a change record, and the page
 * does not render it.
 *
 * Cached under the project-scoped tag; every writer that inserts an audit
 * row calls `updateTag(cacheTags.auditLogs(projectId))`. The table is
 * append-only, so a stale read can only ever be missing new rows.
 */
export async function listProjectAuditLogs(projectId: string) {
  "use cache"
  cacheTag(cacheTags.auditLogs(projectId))

  // Three reads, not a join: `audit_logs.entity_id` points at a different
  // table per `entity_type` and `environment_id` carries no FK (it has to
  // outlive the environment), so neither can be joined in SQL. Both extra
  // reads are project-scoped and tiny — 3 environment rows, and one flag row
  // per flag.
  const [entries, projectEnvironments, projectFlags] = await Promise.all([
    db.query.auditLogs.findMany({
      where: eq(auditLogs.projectId, projectId),
      columns: {
        id: true,
        environmentId: true,
        entityType: true,
        entityId: true,
        action: true,
        before: true,
        after: true,
        createdAt: true,
      },
      orderBy: desc(auditLogs.createdAt),
      limit: AUDIT_LOG_LIMIT,
      with: {
        // actor rows are never deleted while logs exist (the FK is `restrict`),
        // so this join always resolves
        actor: { columns: { name: true, email: true } },
      },
    }),
    db.query.environments.findMany({
      where: eq(environments.projectId, projectId),
      columns: { id: true, name: true },
    }),
    db.query.flags.findMany({
      where: eq(flags.projectId, projectId),
      columns: { id: true, key: true },
      with: { environmentStates: { columns: { id: true } } },
    }),
  ])

  const environmentNames = new Map(
    projectEnvironments.map((environment) => [
      environment.id,
      environment.name,
    ]),
  )

  // Two ids can name the same flag: a "flag" entry's entityId IS the flag id,
  // while a "flag_environment_state" entry's entityId is the state row's id.
  // Both go in one map so the lookup below stays a single get.
  const flagKeys = new Map<string, string>()
  for (const flag of projectFlags) {
    flagKeys.set(flag.id, flag.key)
    for (const state of flag.environmentStates) {
      flagKeys.set(state.id, flag.key)
    }
  }

  return entries.map((entry) => ({
    ...entry,
    // Deleted flags resolve to null: the row is gone, so there is no key left
    // to look up. The delete entry's own `before` diff still carries it.
    targetKey: flagKeys.get(entry.entityId) ?? null,
    environmentName: entry.environmentId
      ? (environmentNames.get(entry.environmentId) ?? null)
      : null,
  }))
}

export type ProjectAuditLog = Awaited<
  ReturnType<typeof listProjectAuditLogs>
>[number]
