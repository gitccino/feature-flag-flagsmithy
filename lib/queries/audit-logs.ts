import { desc, eq } from "drizzle-orm"
import { cacheTag } from "next/cache"

import { cacheTags } from "@/lib/cache-tags"
import { db } from "@/lib/db"
import { auditLogs } from "@/lib/db/schema"

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

  return db.query.auditLogs.findMany({
    where: eq(auditLogs.projectId, projectId),
    columns: {
      id: true,
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
      // actor rows are never deleted while logs exist (FK is `restrict`), so
      // this join always resolves
      actor: { columns: { name: true, email: true } },
    },
  })
}

export type ProjectAuditLog = Awaited<
  ReturnType<typeof listProjectAuditLogs>
>[number]
