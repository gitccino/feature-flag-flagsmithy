---
name: Projects Vertical Slice
overview: "Build the Projects vertical slice: project list + create (atomically spawning 3 environments), per-project routing/layout/authorization, plus the audit_logs foundation and a transaction-capable DB client."
todos:
  - id: audit-table
    content: Add audit_logs table + relations to flag-schema.ts; generate + run migration
    status: pending
  - id: db-pool
    content: Add neon-serverless dbPool to lib/db/index.ts, keep neon-http db
    status: pending
  - id: authz
    content: Create lib/auth/project-access.ts with requireProjectAccess returning {session, project}
    status: pending
  - id: create-action
    content: "app/actions/projects.ts createProject: zod + slug+suffix + interactive txn (project + 3 envs + audit)"
    status: pending
  - id: projects-list
    content: /projects list page + create dialog wired to action; redirect / -> /projects
    status: pending
  - id: project-layout
    content: /projects/[projectId]/layout.tsx with requireProjectAccess + sub-nav; move segments stub under it
    status: pending
isProject: false
---

# Projects Vertical Slice

Root milestone after the schema. Establishes multi-tenancy, transactions, audit, and authorization patterns reused by every later slice (flags, segments, targeting, eval API).

## Decisions (agreed via grill)

- Routing: top-level `/projects` (list + create), per-project pages under `/projects/[projectId]/...` (path param, projectId not slug)
- Transactions: add neon-serverless WebSocket Pool `dbPool` for interactive transactions; keep existing neon-http `db` for reads/simple writes
- Audit: build `audit_logs` now; write entry inside the same create transaction
- Slug: auto-slugify from name + short random suffix on collision; keep global-unique column
- Authorization: `requireProjectAccess(projectId)` -> `{ session, project }`, called in pages AND actions (CLAUDE.md principle 5)
- Nav: two-level. `/projects` list, then `/projects/[projectId]/layout.tsx` with sub-nav (Flags, Segments, Audit, Settings); move the existing segments stub under it

## 1. audit_logs table

Add to [lib/db/flag-schema.ts](lib/db/flag-schema.ts): id uuid; `actorId` -> user.id (restrict); `projectId` -> project.id (cascade); `environmentId` uuid nullable; `entityType` text; `entityId` uuid; `action` text; `before` jsonb nullable; `after` jsonb nullable; `metadata` jsonb (ip/userAgent); createdAt. Index on projectId, actorId. Add relations. Then `bunx drizzle-kit generate` + `migrate`.

## 2. DB client

[lib/db/index.ts](lib/db/index.ts): keep `db` (neon-http). Add `dbPool` from `drizzle-orm/neon-serverless` with `Pool` + `ws`, sharing the same schema, for transaction-bearing actions.

## 3. Auth helper

New `lib/auth/project-access.ts`: resolve session (mirror `requireSession` in [app/(admin)/layout.tsx](<app/(admin)/layout.tsx>)), load project, redirect/404 if `project.createdBy !== session.user.id`, return `{ session, project }`.

## 4. Server action

New `app/actions/projects.ts` (`"use server"`): `createProject` -> Zod-parse name (add schema to [lib/zod-schema.ts](lib/zod-schema.ts)), require session, slugify + suffix, `dbPool.transaction(async (tx) => { insert project; insert 3 environments (dev/staging/production); insert audit_logs })`, return `{ ok: true, data } | { ok: false, error }`, then `updateTag`/`refresh`. List is a server-component query, not an action.

## 5. Routing / UI

- `/projects` page (server component): list owned projects + a client create dialog calling the action
- `/projects/[projectId]/layout.tsx`: `requireProjectAccess` + per-project sub-nav
- Move `[app/(admin)/segments/page.tsx](app/(admin)/segments/page.tsx)` to `/projects/[projectId]/segments`
- Redirect `/` -> `/projects`; update header nav in [app/(admin)/layout.tsx](<app/(admin)/layout.tsx>)

## Out of scope

Edit/delete project, flags/segments/targeting CRUD, public evaluation API, API keys (later slices).
