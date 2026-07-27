# Learning path — #13 audit log read UI

Read the code in this order. Each stage builds on the last, and each ends with
a question you should be able to answer from the code before moving on. If you
can't, that's the signal to re-read rather than continue.

The whole change is ~320 lines across 9 files. Four of those files are one-line
edits. The real content is three files.

---

## Stage 0 — the shape of the thing (5 min, no code)

Before any file, hold this in your head:

**Data already existed.** Every mutation in this app writes a row to
`audit_logs` inside the same transaction as the change itself. That's been true
since the first schema commit. Nothing in this PR writes audit data. This is a
pure read feature: query the rows, render them.

That's why the issue calls it "the cheapest slice available". Knowing a feature
is read-only tells you what you *don't* have to think about — no server actions,
no client state, no optimistic updates, no rollback.

**Question:** if the data has existed all along, why does the PR still touch
five files that write data? (Answer comes in Stage 4. Notice the tension now.)

---

## Stage 1 — the schema you're reading from

**File:** `lib/db/flag-schema.ts`, the `auditLogs` table (near the bottom).

Read only that table definition and its `auditLogRelations` block below it.

Six columns carry the meaning:

| Column | What it is | The subtlety |
|---|---|---|
| `actorId` | who | FK to `user` with `onDelete: "restrict"` |
| `projectId` | which project | FK with `onDelete: "cascade"` |
| `environmentId` | which env | **nullable, and no FK at all** |
| `entityType` + `entityId` | what was touched | plain `text` + `uuid`, no FK |
| `before` / `after` | the diff | untyped `jsonb` |

Three of these are load-bearing for everything that follows:

**`restrict` vs `cascade`.** Delete a project → its audit rows vanish (cascade).
Delete a user → the database *refuses* while their audit rows exist (restrict).
The trail outlives the project's contents but not the project, and it never
outlives its actor. That's a deliberate retention policy expressed as foreign
keys instead of application code — the database enforces it even against a
buggy future migration script.

**`environmentId` has no FK.** Look at the comment: `// nullable, no FK —
survives env deletion`. If it had an FK with `cascade`, deleting an environment
would erase the history of every change ever made in it. With `restrict`, you
could never delete an environment at all. No FK means the column is a *record of
what was true at the time*, not a live pointer. It may point at nothing.

**`before`/`after` are `jsonb` with no `$type<>`.** Compare to `segments.rules`
just above, which is `jsonb("rules").$type<SegmentRules>()`. The audit columns
deliberately have no type parameter, because each writer stores a different
shape — a flag create stores `{name, key}`, a state update stores
`{enabled, rolloutPercentage}`. TypeScript will hand you `unknown`.

**Question:** `entityId` is a `uuid` with no foreign key. Which table does it
point at? (Trick question — work out why it's a trick.)

---

## Stage 2 — reading untyped data safely

**File:** `lib/audit-diff.ts` (55 lines). This is the densest file in the PR and
the one worth the most of your time.

### 2a. Why `unknown` and not `any`

```ts
export function auditDiffRows(before: unknown, after: unknown, ...)
```

`any` disables the type checker — you can call `.foo.bar()` on it and TypeScript
stays silent until it explodes at runtime. `unknown` is the opposite: it accepts
any value coming *in*, but you cannot do anything with it until you've narrowed
it. The compiler forces the check to exist. This is CLAUDE.md principle 3
("prefer `unknown` + a parse over loose casts") in one signature.

### 2b. The narrowing

```ts
function fields(value: unknown): Map<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return new Map()
  }
  return new Map(Object.entries(value))
}
```

Three rejections, and each is a real case:

- `typeof value !== "object"` — a writer stored a bare string or number.
- `value === null` — **this is the common case, not an edge case.** A create has
  no `before`; a delete has no `after`. `typeof null === "object"` in JavaScript
  (a famous 1995 bug that can never be fixed), so without this line `null` slips
  past the first check.
- `Array.isArray(value)` — arrays are objects too. `Object.entries(["a"])` gives
  you `[["0", "a"]]`, so an array would render as fields named `0`, `1`, `2`.

Everything else becomes a `Map`, and a `Map` of nothing is a perfectly good
answer. **The function never throws.** That matters more than it looks: this
runs inside a Server Component during render, and a throw there takes down the
whole page for one malformed historical row.

### 2c. The set union

```ts
const keys = new Set([...beforeFields.keys(), ...afterFields.keys()])
```

Why both sides? A field can appear in `before` and not `after` (removed) or
`after` and not `before` (added). Iterating just one side misses half the
changes. `Set` de-duplicates while preserving first-insertion order, so
`before`'s field order wins and the diff reads in a stable order.

### 2d. Absent vs null — the deliberate conflation

```ts
if (value === undefined || value === null) return "—"
```

`beforeFields.get("name")` returns `undefined` when the key is absent, but the
stored value could genuinely *be* `null` (a flag's `description` is nullable).
This renders both as `—`. That's a real loss of information, taken knowingly:
"the field wasn't there" and "the field was empty" are different facts, but for
a human scanning a change log they mean the same thing.

Then note the odd one:

```ts
if (typeof value === "string") return value === "" ? '""' : value
```

An empty string would render as *nothing at all* — a blank cell that looks like
a rendering bug. `""` shows the reader that the value is present and empty.

And why `JSON.stringify` for the rest? Because `String(false)` is `"false"` but
`String({})` is the useless `"[object Object]"`, and `String(null)` is `"null"`
which we already handled. One call covers booleans, numbers, and objects
honestly.

### 2e. Two redaction strategies, and why not one

This is the part the code review changed, and the reasoning is the lesson.

```ts
const API_KEY_VISIBLE_FIELDS = new Set(["name", "keyPrefix", "revokedAt"])
const REDACTED_KEY = /hash|secret|token|password|plaintext|credential/i
```

A **denylist** blocks known-bad names and allows everything else. It **fails
open**: a field nobody anticipated gets rendered. The first version of this file
used a denylist everywhere. The reviewer pointed out that a payload field named
`apiKey` matches none of those patterns — and would print a secret on screen.

An **allowlist** permits known-good names and blocks everything else. It **fails
closed**: an unanticipated field silently disappears.

Neither is universally correct, which is why the code uses both:

```ts
const visible =
  entityType === "api_key"
    ? (key: string) => API_KEY_VISIBLE_FIELDS.has(key)
    : (key: string) => !REDACTED_KEY.test(key)
```

- `api_key` gets the allowlist. It's the one entity whose payload sits next to
  real secret material, and the cost of failing open (leak a key) vastly exceeds
  the cost of failing closed (a field doesn't show up).
- Everything else gets the denylist. Their payloads are ordinary config. An
  allowlist there would mean every new flag field silently vanishes from the
  audit page until someone remembers to update a list — a slow, quiet rot.

Note the fallback direction: `entityType === "api_key" ? allowlist : denylist`.
An unrecognised entity type gets *filtering*, not *no filtering*. If it were
written as a lookup table with no default, a new writer would be exempt from
redaction entirely. Defaults should fail toward safety.

One more thing: this is a **second** line of defence. Go read
`app/actions/api-keys.ts:109` — the writer already stores only `{name, keyPrefix}`
and never the plaintext. So why filter at all? Because the writer is one commit
away from changing, and the render path is the last place a secret can escape.
Defence in depth means the security property doesn't depend on a distant file
staying correct.

**Question:** why does the flag-create payload `{name: "Checkout", key: "checkout"}`
render its `key` field, when `key` sounds exactly like something you'd redact?
(There's a test for this. Find it.)

---

## Stage 3 — the query

**File:** `lib/queries/audit-logs.ts` (95 lines).

### 3a. `"use cache"` and the tag

```ts
export async function listProjectAuditLogs(projectId: string) {
  "use cache"
  cacheTag(cacheTags.auditLogs(projectId))
```

The directive marks the whole function cacheable. `cacheTag` labels the cached
result so a writer can later expire exactly this entry by name. The tag string
comes from `lib/cache-tags.ts` rather than being typed inline — that file's
comment says why: *"so reads (cacheTag) and writes (updateTag) can't drift
apart"*. A typo in one of two hand-written strings is a cache that never
invalidates and a bug you find weeks later. One function, called from both
sides, makes the mismatch impossible.

Compare this to `lib/queries/flags.ts` — the same three-line opening. Learn the
pattern once and you've learnt every read in this codebase.

### 3b. The cap

```ts
export const AUDIT_LOG_LIMIT = 100
```

Exported, not inlined, because the *page* needs it too — it renders "showing the
most recent 100" only when `entries.length === AUDIT_LOG_LIMIT`. One constant,
two consumers, no chance of the message disagreeing with the query.

The `ponytail:` comment above it names the ceiling and the upgrade path: keyset
pagination on `createdAt`, and the index that already supports it. This is what
the issue meant by "mark the cap as a deliberate shortcut with the condition for
revisiting it". A shortcut with its exit condition written down is a decision;
one without is technical debt nobody knows they have.

### 3c. Why three queries instead of one join

This is the most interesting decision in the file. Read the comment above the
`Promise.all`, then work through why:

- To show *which flag* an entry touched, you'd join `entityId` to `flags.id`.
  But `entityId` points at a **different table depending on `entityType`** — the
  `flags` table, or `flag_environment_states`, or `api_keys`, or `projects`.
  SQL has no "join to whichever table this text column names". (That's the
  answer to Stage 1's trick question. This shape has a name: a *polymorphic
  association*.)
- To show *which environment*, you'd join `environmentId` to `environments.id`.
  But that column has no FK precisely so it can outlive the environment — see
  Stage 1. A join would silently drop rows for deleted environments (inner) or
  need careful outer-join handling.

So: fetch the entries, fetch the project's environments, fetch the project's
flags, and build lookup maps in JavaScript. All three run concurrently inside
`Promise.all` — one round trip's latency, not three.

Is this expensive? Bounded, and small: a project has exactly 3 environments, and
one row per flag. The comment says so, because "this is fine" is only useful to
a future reader if the *reason* is attached.

### 3d. Two ids, one map

```ts
const flagKeys = new Map<string, string>()
for (const flag of projectFlags) {
  flagKeys.set(flag.id, flag.key)
  for (const state of flag.environmentStates) {
    flagKeys.set(state.id, flag.key)
  }
}
```

A `"flag"` entry's `entityId` is the flag's own id. A
`"flag_environment_state"` entry's `entityId` is the *state row's* id — a
different uuid entirely, pointing at a different table. Both should display the
same flag key. Putting both id types in one map means the lookup at the bottom
is a single `.get()` with no branching on `entityType`.

Then:

```ts
targetKey: flagKeys.get(entry.entityId) ?? null,
```

`??` (nullish coalescing) not `||` — though here they'd behave the same, since
`.get()` returns `undefined` for a miss. The habit matters elsewhere: `||` would
also replace an empty string or `0`, which is a classic silent bug.

A miss means the flag was **deleted**. That's not an error — the row is gone,
so there's no key left to look up. The comment notes the delete entry's own
`before` diff still carries the key, so the information isn't actually lost from
the page.

### 3e. The derived type

```ts
export type ProjectAuditLog = Awaited<ReturnType<typeof listProjectAuditLogs>>[number]
```

Read it inside-out: `typeof fn` → the function's type; `ReturnType<...>` → what
it returns (a `Promise`); `Awaited<...>` → unwrap the promise (an array);
`[number]` → the type of one element.

Nobody hand-wrote this type. Change a column in the query and the type changes,
and every consumer that no longer type-checks lights up. Hand-writing it would
mean a type that *claims* to describe the query while quietly drifting from it.
Same pattern as `ProjectFlag` and `ProjectApiKey` — it's the house style.

**Question:** if you added `metadata: true` to the column selection, which
other file would you need to change for it to appear on the page? Which files
would need *no* change? (This tells you how well the seams are drawn.)

---

## Stage 4 — the cache invalidation you were promised you wouldn't need

**Files:** the one-line additions in `app/actions/flags.ts` (×4),
`api-keys.ts` (×2), `projects.ts` (×1).

Back to Stage 0's question. The issue said *"the table is append-only so there
is no cache invalidation to reason about"*. That's true for **correctness** — a
stale cache can only ever be *missing* new rows, never showing wrong ones.
Nothing is ever updated or deleted.

But it's false for **user experience**. Toggle a flag, click Audit, and see
nothing. Your change is in Postgres; the cached read is from before it. This is
the *read-your-writes* property, and you notice its absence immediately.

So each writer gains one line next to its existing `updateTag`:

```ts
updateTag(cacheTags.flags(existing.projectId))
updateTag(cacheTags.auditLogs(existing.projectId))
```

Seven call sites, because seven actions insert an audit row. Worth noticing:
this is the kind of change Fowler calls **Shotgun Surgery** — one logical
concern spread across many files, so adding an eighth writer means remembering
an eighth `updateTag`. The reviewer's own smell baseline flags it. It's accepted
here because CLAUDE.md principle 8 asks for *precise* invalidation, and the
alternative (wrapping every audit insert in a helper that also invalidates)
would be a bigger, more speculative refactor than the feature warrants.

Note it's `updateTag`, not `revalidateTag`. In Next.js 16 `updateTag` expires
the tag *and* gives the current request a fresh read — read-your-writes in one
call. `revalidateTag` requires a profile argument and is for the
somebody-else-changed-it case.

**Question:** the `createProject` call uses `cacheTags.auditLogs(data.id)`,
while every other site uses a `projectId` variable. Why is `data.id` correct
there? (Look at what's being created.)

---

## Stage 5 — the page and its authorization

**File:** `app/(admin)/projects/[projectId]/audit/page.tsx`.

### 5a. Async params

```ts
params: Promise<{ projectId: string }>
const { projectId } = await params
```

In Next.js 16 route `params`, `searchParams`, `cookies()` and `headers()` are
all async. This is the breaking change CLAUDE.md leads with. It exists so a page
can start rendering before these resolve.

### 5b. The authorization that looks redundant

```ts
await requireProjectAccess(projectId)
```

The layout's `ProjectShell` already calls this. So why again?

Because **a layout is not an authorization boundary you can rely on.** It's a
rendering convenience. Someone refactors the shell, or the page gets moved out
of that route group, and the check silently disappears with no test failing.
CLAUDE.md principle 5 is explicit: re-verify inside anything that reads or
writes protected data. The cost is one already-cached DB lookup. The cost of
being wrong is a data leak.

Now read `lib/auth/project-access.ts` and notice the three exits:

- no session → `redirect` to sign-in with a callback URL
- malformed uuid → `notFound()`, *before* touching the DB (a non-uuid string in
  a `uuid` column throws a Postgres cast error — this turns a 500 into a 404)
- missing **or** not owned → `notFound()`, the same for both

That last one is the interesting one, and it's an explicit acceptance criterion:
*"a non-owner gets a 404, not a 403"*. A 403 says "this exists, but not for
you" — which confirms the id is real to someone probing for valid project ids.
A 404 says nothing. Same reasoning appears in `revokeApiKey`, where the
"not found" and "not yours" branches return an identical message with a comment
explaining why.

### 5c. Conditional truncation notice

```tsx
{entries.length === AUDIT_LOG_LIMIT
  ? ` — showing the most recent ${AUDIT_LOG_LIMIT}.`
  : "."}
```

Only when the result exactly fills the cap is there possibly more. A project
with 40 entries shouldn't be told anything is hidden.

(This has a one-off imprecision: a project with *exactly* 100 entries and no
more will still see the notice. Accepted — the alternative is fetching 101 rows
to check. Worth recognising the pattern: `LIMIT n+1` is the standard trick when
that precision matters.)

---

## Stage 6 — the table

**File:** `components/audit/audit-log-table.tsx`.

### 6a. It is not a client component

No `"use client"` at the top. Compare `components/api-keys/api-keys-table.tsx`,
which *does* have it — because it holds `React.useState` for its revoke dialog.
This table has no state, no handlers, no hooks. It renders on the server and
ships **zero JavaScript** to the browser. CLAUDE.md principle 1: default to
server, add the boundary only where interactivity forces it.

### 6b. The pinned date formatter

```ts
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium", timeStyle: "short", timeZone: "UTC",
})
```

Both the locale and the timezone are pinned, and the comment says why: an
unpinned formatter uses the *server's* timezone during SSR and the *browser's*
during hydration. Either side of midnight those produce different strings, React
sees a mismatch, and you get a hydration error. Copied deliberately from the
API keys table so the two pages agree.

The `<time dateTime={...}>` wrapper carries the exact ISO instant for screen
readers and machines, while the visible text stays human-readable.

### 6c. Lookup maps with fallbacks

```ts
{ENTITY_LABELS[entry.entityType] ?? entry.entityType}
<Badge variant={ACTION_VARIANTS[entry.action] ?? "outline"}>
```

`entityType` and `action` are free-form `text` columns — the database enforces
nothing. So the maps are *display hints*, and the raw value is the fallback. Add
a new entity type tomorrow and it shows up as its own raw string rather than as
a blank cell. Failing visible beats failing silent.

### 6d. `<dl>`, and the arrow

The diff renders as a description list — `<dt>` for the field name, `<dd>` for
the change. That's the semantically correct element for key/value pairs, so a
screen reader announces the relationship rather than reading a wall of text.

```tsx
<span aria-hidden>→</span>
```

The arrow is decoration. Without `aria-hidden` a screen reader announces
"rightwards arrow" between every old and new value. The `line-through` on the
old value carries the same meaning visually.

### 6e. The Target column

Three branches: flag key if there is one, environment name if there is one, `—`
if neither. Both can legitimately be absent — only flag-related entries have a
key to resolve, only environment-scoped entries have an environment. A project
rename has neither, and that's correct, not a bug.

**Question:** why is `AuditDiff` a separate component rather than inline JSX in
the row? (Hint: it's not about reuse — it's used once.)

---

## Stage 7 — the test

**File:** `scripts/audit-diff.test.ts`.

Bare `assert` calls, no framework, ending in `console.log("... OK")`. That's not
minimalism for its own sake — go look at `scripts/bucketing.test.ts` and
`scripts/api-keys.test.ts`. Same shape. **Matching the house style mattered more
than using a nicer runner.** (The first draft of this used `node:test` and lived
in `lib/`; it was moved to match.)

What's tested is exactly the logic that could silently be wrong: the three diff
shapes (create/update/delete), both redaction strategies, the unknown-entity
fallback, and non-object jsonb. What isn't tested: the query (needs a live DB)
and the table (needs a renderer). Those are covered by `bun run build` type-
checking and by using it.

Run it: `bunx tsx scripts/audit-diff.test.ts`

**Exercise:** delete the `Array.isArray(value)` check in `lib/audit-diff.ts` and
re-run. Which assertion fails, and does the failure message tell you what broke?

---

## Stage 8 — verify it end to end

```bash
bun run dev
```

1. Create a project → open Audit. One `project / create` entry.
2. Toggle a flag in production → refresh. A `Flag state / update` entry showing
   `enabled: false → true`, with the flag key and `Production` in Target.
   **That row is the whole point of the feature** — it's the "who turned this
   flag on in production yesterday" question from the issue.
3. Create an API key → refresh. Name and prefix only. No plaintext anywhere.

Then confirm the security property directly: open DevTools, view source on the
audit page, and search for the plaintext key you were shown at creation. It
isn't in the HTML — it was never stored, so it cannot be.

---

## What was left undone, and why that's on purpose

The issue's last criterion asks you to verify with "a flag toggle, a project
rename and an API key creation". **There is no project-rename action in this
codebase** — `app/actions/projects.ts` exports only `createProject`. Two of the
three are verifiable; project *creation* appears on the page.

Adding a rename action would have meant a new server action, a new form, new
validation, and a new dialog — a second feature smuggled into a read-only slice.
It's called out in the PR description instead. Recognising that a spec asks for
something that doesn't exist yet, and saying so rather than quietly building it,
is a skill worth more than the code.

---

## The five ideas worth keeping

1. **`unknown` at every boundary where the shape isn't guaranteed.** The
   compiler then forces the narrowing to exist. `any` deletes the question.
2. **Choose fail-open vs fail-closed per context, not globally.** Denylist where
   missing data is the worse outcome; allowlist where leaking is. Make the
   default branch the safe one.
3. **Foreign keys are policy.** `cascade` / `restrict` / no-FK-at-all each encode
   a retention decision the database will enforce long after everyone who made
   it has left.
4. **Shortcuts need their exit condition written down.** `AUDIT_LOG_LIMIT` with
   its upgrade path is a decision; a bare `100` is debt.
5. **Never trust an outer layer for authorization.** Layouts, proxies and
   middleware are conveniences. Re-check where the data is actually touched.
