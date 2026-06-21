# Flags Vertical Slice

## Context

PR #3 shipped the projects slice (create project + auto-seed 3 environments + audit + cache invalidation). The app is built as vertical slices in dependency order: **auth → projects → flags → segments → targeting rules → evaluation API → audit UI → API keys**.

Flags is the natural next slice: everything downstream (segments, targeting, the public evaluation API) needs flags to exist, and it has **zero code blockers** — the DB schema (`flags`, `flagEnvironmentStates`), the 3 seeded environments, the audit pattern, and the project→detail nav are all already in place. The flag pages are currently empty stubs.

**Outcome:** a project owner can create, rename, describe, and delete feature flags, and toggle each flag's `enabled` state + `rolloutPercentage` per environment from a flag × environment matrix overview. Every mutation is Zod-validated, authorized server-side, audited, and cache-invalidated.

## Decisions (resolved via grilling)

1. **Scope:** flag CRUD **+** per-environment `enabled` toggle + `rolloutPercentage`. Targeting rules (segments) are explicitly **out** — separate later slice.
2. **Flag key:** code contract, not a cosmetic slug. The create dialog **auto-suggests** a slugified key from the name (reuse `slugify()`), user **can override** it at create, key **locks after creation**. Name/description stay editable.
3. **UI:** a **matrix overview** on the flags list page — flags as rows, the 3 environments as columns. Each cell shows the `enabled` toggle + a `rolloutPercentage` badge (e.g. `100%`). Clicking a cell opens a **popover** with the rollout input/slider. No separate detail page in this slice.
4. **Toggle save:** flipping the `enabled` switch saves immediately (per-cell server action). The rollout popover has an explicit **Apply** button.
5. **Delete:** hard delete (schema cascades to `flagEnvironmentStates`), behind a typed/confirm dialog.

## Implementation

### 1. Validation — `lib/zod-schema.ts`
Add, following the existing `createProjectSchema` style:
- `flagKeySchema`: `z.string().trim().min(1).max(60).regex(/^[a-z0-9][a-z0-9_.-]*$/, "...")` — lowercase, alphanumeric + `_ . -`.
- `createFlagSchema`: `{ projectId: uuid, name: 1–60, key: flagKeySchema, description: optional max 280 }`.
- `updateFlagSchema`: `{ flagId: uuid, name, description }` (no `key` — immutable).
- `setFlagEnvironmentStateSchema`: `{ flagEnvironmentStateId: uuid, enabled: boolean, rolloutPercentage: z.number().int().min(0).max(100) }`.
- `deleteFlagSchema`: `{ flagId: uuid }`.
- Export `z.infer` types for each.

### 2. Cache tags — `lib/cache-tags.ts`
Add `flags: (projectId: string) => \`flags:project:${projectId}\`` to the `cacheTags` object (flags are project-scoped, not user-scoped).

### 3. Reads — `lib/queries/flags.ts` (new)
- `listProjectFlags(projectId)`: flags for a project (newest first) **with** their `environmentStates` and each state's `environment` (use Drizzle relational `db.query.flags.findMany({ with: { environmentStates: { with: { environment: true } } } })`). Tag the read with `cacheTags.flags(projectId)` via `cacheTag`. Export an `OwnedFlag`-style inferred type. Use `db` (not `dbPool`) — read path, mirrors `lib/queries/projects.ts`.

### 4. Server Actions — `app/actions/flags.ts` (new)
Mirror `app/actions/projects.ts` exactly: `"use server"`, typed `{ ok: true, data } | { ok: false, error, fieldErrors? }` results, re-validate with Zod, re-resolve session via `auth.api.getSession`, **re-check project ownership** with `requireProjectAccess` (`lib/auth/project-access.ts`), capture `ip`/`userAgent` from `headers()`.

- **`createFlag`**: in a `dbPool.transaction` — insert flag (catch `23505` unique violation on `(projectId, key)` → return field error on `key`, reusing the `isUniqueViolation` helper pattern from `projects.ts`), fetch the project's 3 environments, insert one `flagEnvironmentStates` row per environment (defaults: `enabled=false`, `rolloutPercentage=100`), write an audit log (`entityType:"flag"`, `action:"create"`, `after:{name,key}`). Then `updateTag(cacheTags.flags(projectId))`.
- **`updateFlag`**: update name/description, audit with before/after diff (`entityType:"flag"`, `action:"update"`), `updateTag`.
- **`deleteFlag`**: delete flag (cascade removes states), audit (`action:"delete"`, `before:{...}`), `updateTag`.
- **`setFlagEnvironmentState`**: update `enabled` + `rolloutPercentage` for one state row; audit with `entityType:"flag_environment_state"`, `environmentId` set, before/after `{enabled, rolloutPercentage}`; `updateTag(cacheTags.flags(projectId))`. (Look up the flag's `projectId` for the tag + ownership check.)

Import schema tables from the `@/lib/db/schema` barrel (as `projects.ts` does), not `flag-schema` directly.

### 5. UI
- **`app/(admin)/projects/[projectId]/page.tsx`** (replace stub): server component. Resolve session + `requireProjectAccess`, call `listProjectFlags`, render the matrix table (flags × 3 env columns) + a `CreateFlagDialog` trigger. Empty state when no flags.
- **`components/flags/create-flag-dialog.tsx`** (new): client component modeled on `create-project-dialog.tsx` (RHF + `zodResolver` + `Controller` + `Field`/`FieldError`). Two fields — name and key. As the user types the name, prefill the key with `slugify(name)` **until** the user manually edits the key (then stop syncing). Submit → `createFlag` → `router.refresh()`.
- **`components/flags/flag-env-cell.tsx`** (new): client component for one matrix cell — a shadcn `Switch` (immediate `setFlagEnvironmentState` on change, optimistic) + a `rolloutPercentage` badge that opens a `Popover` with a number input/slider and an **Apply** button (calls `setFlagEnvironmentState`, then `router.refresh()`). Grey/disable the rollout control when `enabled` is false.
- **`components/flags/delete-flag-dialog.tsx`** (new): confirm dialog → `deleteFlag` → `router.refresh()`.
- Surface action errors via **Sonner** toasts.

Check `components/ui/` for `Switch`, `Popover`, `Slider`, `Table`, `Badge`; add any missing via the shadcn CLI.

## Out of scope
Targeting rules / segment attachment, the public evaluation API + Redis caching, API keys, the audit-log read UI. Rollout % is **stored only** here — no evaluation/bucketing logic in this slice.

## Verification
- `bun run lint` and `tsc` clean (no `any`, no unchecked casts).
- `bun run dev`, sign in, open a project:
  - Create a flag → suggested key matches slugified name; overriding the key sticks; duplicate key shows a field error; new flag appears with 3 env cells defaulting to off / 100%.
  - Toggle a cell → persists across refresh; check the row in `flag_environment_states`.
  - Edit rollout via popover → badge updates, persists; rollout disabled when toggle off.
  - Rename/describe via update; delete a flag → confirm dialog, flag + its state rows gone (cascade).
- Confirm an `audit_logs` row is written for each create/update/delete/toggle (correct `entityType`, `environmentId` on state changes, before/after diffs).
- Confirm a second user cannot read or mutate the project's flags (ownership enforced in actions + page, not just proxy).
