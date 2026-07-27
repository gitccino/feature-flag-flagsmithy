import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { auditDiffRows } from "@/lib/audit-diff"
import type { ProjectAuditLog } from "@/lib/queries/audit-logs"

// Locale and timezone are both pinned, matching the API keys table: an
// unpinned formatter renders the server's day and the client's day
// differently either side of midnight, which hydrates as a mismatch.
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
})

// entity_type / action are free-form text columns, so the maps are display
// hints and the raw value is the fallback — a new writer shows up as itself
// rather than as a blank cell.
const ENTITY_LABELS: Record<string, string> = {
  project: "Project",
  flag: "Flag",
  flag_environment_state: "Flag state",
  segment: "Segment",
  api_key: "API key",
}

const ACTION_VARIANTS: Record<string, "secondary" | "outline" | "destructive"> =
  {
    create: "secondary",
    update: "outline",
    delete: "destructive",
    revoke: "destructive",
  }

function AuditDiff({ entry }: { entry: ProjectAuditLog }) {
  const rows = auditDiffRows(entry.before, entry.after, entry.entityType)

  if (rows.length === 0) {
    return <span className="text-muted-foreground text-sm">—</span>
  }

  return (
    <dl className="space-y-0.5 text-xs">
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-baseline gap-1.5">
          <dt className="text-muted-foreground font-mono">{row.key}</dt>
          <dd className="flex items-baseline gap-1.5 font-mono">
            <span className="text-muted-foreground line-through">
              {row.before}
            </span>
            <span aria-hidden>→</span>
            <span className="font-medium">{row.after}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

export function AuditLogTable({ entries }: { entries: ProjectAuditLog[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-44">When</TableHead>
          <TableHead className="w-40">Who</TableHead>
          <TableHead className="w-28">Entity</TableHead>
          <TableHead className="w-48">Target</TableHead>
          <TableHead className="w-24">Action</TableHead>
          <TableHead>Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id} className="align-top">
            <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
              <time dateTime={entry.createdAt.toISOString()}>
                {dateTimeFormat.format(entry.createdAt)}
              </time>
            </TableCell>
            <TableCell className="text-sm font-medium">
              {/* name is notNull in the schema, but fall back rather than
                  render an empty cell for a legacy blank */}
              {entry.actor.name || entry.actor.email}
            </TableCell>
            <TableCell className="text-sm">
              {ENTITY_LABELS[entry.entityType] ?? entry.entityType}
            </TableCell>
            <TableCell className="text-sm">
              {/* Which flag, and in which environment — without these the
                  diff alone can't answer "who turned this flag on in
                  production". Either can be absent: only flag entries have a
                  key to resolve, and only env-scoped entries have an env. */}
              {entry.targetKey ? (
                <span className="font-mono text-xs">{entry.targetKey}</span>
              ) : null}
              {entry.environmentName ? (
                <span className="text-muted-foreground ml-1.5 text-xs">
                  {entry.environmentName}
                </span>
              ) : null}
              {!entry.targetKey && !entry.environmentName ? (
                <span className="text-muted-foreground">—</span>
              ) : null}
            </TableCell>
            <TableCell>
              <Badge variant={ACTION_VARIANTS[entry.action] ?? "outline"}>
                {entry.action}
              </Badge>
            </TableCell>
            <TableCell>
              <AuditDiff entry={entry} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
