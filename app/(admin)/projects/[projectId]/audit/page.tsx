import { ScrollText } from "lucide-react"

import { AuditLogTable } from "@/components/audit/audit-log-table"
import { requireProjectAccess } from "@/lib/auth/project-access"
import { AUDIT_LOG_LIMIT, listProjectAuditLogs } from "@/lib/queries/audit-logs"

export default async function AuditPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const { projectId } = await params

  // Re-verified here even though the layout's shell already gates the route:
  // this page reads the trail directly, and a layout is not an authorization
  // boundary a refactor can be trusted to preserve (CLAUDE.md principle 5).
  // A non-owner gets notFound() from inside, never a 403.
  await requireProjectAccess(projectId)

  const entries = await listProjectAuditLogs(projectId)

  return (
    <div>
      <p className="text-muted-foreground mb-4 text-sm">
        Every change to this project, newest first
        {entries.length === AUDIT_LOG_LIMIT
          ? ` — showing the most recent ${AUDIT_LOG_LIMIT}.`
          : "."}
      </p>

      {entries.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <ScrollText className="text-muted-foreground size-8" />
          <div>
            <p className="font-medium">No activity yet</p>
            <p className="text-muted-foreground text-sm">
              Changes to flags, segments and API keys will show up here.
            </p>
          </div>
        </div>
      ) : (
        <AuditLogTable entries={entries} />
      )}
    </div>
  )
}
