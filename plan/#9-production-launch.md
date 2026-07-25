---
name: Production Launch + Segment Targeting
overview: "Launch-first roadmap. Ship the usable product (API-key UI, audit UI, migrations, signup limit) to a live URL, then land segment targeting against the deployed system. 7 phases, deploy at phase 5."
todos:
  - id: p1-housekeeping
    content: Delete my-components/, my-actions/, mint-key.ts, commented import; commit plan renames
    status: pending
  - id: p2-migrations
    content: Add db:generate + db:migrate, verify drizzle journal against live DB, retire db:push
    status: pending
  - id: p3-keys-ui
    content: Settings page — API key create/list/revoke + revokeApiKey action (audited)
    status: pending
  - id: p3-audit-ui
    content: Audit page — cached read query + table (actor, entity, action, diff)
    status: pending
  - id: p4-launch-prep
    content: IP rate limit on signup, README truthing + integration snippet
    status: pending
  - id: p5-deploy
    content: Deploy to Vercel, env vars, smoke test eval API in prod
    status: pending
  - id: p6a-segments-crud
    content: Drop regex operator, add traits to eval schema, segments CRUD + UI (audited)
    status: pending
  - id: p6b-rules-crud
    content: Flag detail page + targeting-rules CRUD (audited), 3-env cache invalidation
    status: pending
  - id: p6c-evaluator
    content: resolveEnabled walks rules, cache blob v2, 4-table join on miss, evaluator tests
    status: pending
  - id: p7-dockerfile
    content: Dockerfile + output standalone, makes README self-hostable claim true
    status: pending
isProject: true
---

# Production Launch + Segment Targeting

## 1. Where we are

Merged and working: schema (#2), projects (#3), flags (#4), evaluation API (#8).
`tsc` and `lint` are clean.

The read path works end to end: `POST /api/v1/flags` with a bearer key returns
each flag's resolved on/off state, bucketed deterministically by rollout
percentage, served from a Redis-cached per-environment config, rate-limited per
key and per IP.

Three things block calling this "in production":

1. **No key issuance UI.** `createApiKey` exists and is audited but has zero
   callers. The only way to get a key is `scripts/mint-key.ts`, which bypasses
   auth and audit. So the evaluation API is unreachable by a real user.
2. **`db:push` only.** No migrate script. Push diffs the schema against the live
   DB and *drops columns* to match. Against real user data that is unrecoverable
   loss.
3. **README lies.** It promises `GET/POST /api/flags/:key` (real path is bulk
   `POST /api/v1/flags`), an audit trail "queryable from the settings page"
   (stub div), segment management (doesn't exist), and "self-hostable" (no
   Dockerfile).

Multi-tenancy is **already done** — `requireProjectAccess` gates every page and
action on `createdBy === session.user.id`, `listOwnedProjects` is owner-scoped,
and a non-owned project resolves to 404 rather than 403 so existence doesn't
leak. No new code needed for tenant isolation.

## 2. Goal and non-goals

**Goal:** a live URL as soon as possible, running a genuinely multi-tenant flag
service, with segment targeting landing shortly after.

**Explicitly out of scope:** billing, teams/members/roles, invites, email
sending, password reset, published SDK, streaming/webhook flag updates,
multivariate flags.

## 3. Locked decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| 1 | Production level | Portfolio + real tenancy | Isolation is already built; the (c)-tier tail (teams, SLA, billing) is months of work nobody asked for |
| 2 | Segments in v1 | Yes | The differentiating feature; percentage rollout alone reads as one modulo |
| 3 | Traits source | Client sends `{ identity?, traits? }` per request | Stateless. No identity table, no ingest endpoint, hot path stays read-only |
| 4 | Cache shape | One self-contained blob per env, segment defs inlined into rules; key bumped to `flags:env:v2:<id>` | Denormalize at write time. One GET, zero joins at eval, evaluator stays a pure function |
| 5 | Precedence | kill switch > first-match-by-priority > `servedValue:false` hard-stops > rollout override on true-serving only > salt stays `flagKey:identity` | See §5.1 |
| 6 | Conditions | missing trait → false (incl. `neq`); type mismatch → false, no coercion; **`regex` dropped** | See §5.2 |
| 7 | Rule authoring | New page `/projects/:id/flags/:key`, one section per environment | 3 envs × an ordered compound-row list does not fit a table cell or popover |
| 8 | Value typing | Inferred from operator; `eq/neq` compare as string if either side is string; `gt/gte/lt/lte` strictly numeric | Operator already implies type — no fourth control, no contradictory combinations |
| 9 | Signup | Open, no verification, IP rate-limited | Verification's job is proving reachability; we send no email. The real fear is volume, and we already own the limiter |
| 10 | Deploy | Vercel now, Dockerfile after | Stack was chosen for it (serverless driver, REST Redis). Dockerfile is ~15 lines and independent |
| 11 | Migrations | `db:generate` + `db:migrate`, retire `db:push` | Push is a prototyping tool. One careless edit drops a user's segments |
| 12 | SDK | None; README snippet | Wrapping one POST hides no complexity. SDKs earn their place with caching/polling/retry — all scoped out |
| 13 | Audit UI | Ships | Cheapest slice on the board, and the writes already exist |
| 14 | API keys | Create + list + revoke | Revoke is incident response on a credential, not a nice-to-have |
| 15 | Tests | Evaluator only, extend `scripts/` asserts, no framework | Pure function over a plain object = cheapest to test, most expensive to get wrong |
| 16 | Order | Launch-first | Live in ~1 session vs ~2 weeks; also exercises the cache version bump against real in-flight entries |

## 4. Accepted costs

- No password reset and no way to contact a user (consequence of #9). Revisit
  when someone uses this seriously.
- The portfolio URL shows a flag tool without segments for ~2 weeks
  (consequence of #16).
- "Self-hostable" in the README stays false until phase 7.

---

# Phase 1 — Housekeeping

**What ships:** nothing user-visible. Dead code gone, working tree clean.

## The work

- Delete `components/my-components/` (5 files) and `app/actions/my-actions/`
  (2 files). They are duplicates of `components/flags/` and `app/actions/`,
  referenced nowhere except one commented-out import.
- Delete the commented import at `app/(admin)/projects/[projectId]/page.tsx:8`.
- Delete `scripts/mint-key.ts`.
- Commit the unstaged plan-file renames (`#N-` prefix) and the `.vscode/`
  deletions.

## Explanation

Three duplicate-file pairs exist because the flags slice was written twice —
once as a learning pass. Only `components/flags/` and `app/actions/` are wired
into routes. The other copies compile, so `tsc` never complains, and they drift
silently every time you edit the real one. Next person to touch this codebase
(including you in a month) reads both and can't tell which is live.

`mint-key.ts` is more serious. It writes an API key straight to the DB with no
session check and no audit row. That was fine as a dev shortcut. In a repo
you're about to make public, it's a script that documents how to bypass your own
authorization — and phase 3 replaces it with a real UI anyway.

**Definition of done:** `git status` clean, `tsc` and `lint` still pass.

---

# Phase 2 — Migrations

**What ships:** a safe schema-change workflow.

## The work

- Add `"db:generate": "drizzle-kit generate"` and
  `"db:migrate": "drizzle-kit migrate"` to `package.json`.
- Run `db:migrate` against the current DB. Confirm `drizzle/meta/_journal.json`
  matches what's actually applied.
- If it has drifted (likely — the DB was built with `push`, which doesn't record
  journal entries), baseline it: mark existing migrations as applied without
  re-running them.
- Remove `db:push`.

## Explanation

Two ways Drizzle changes a database.

**`push`** compares your TypeScript schema to the live DB and mutates the DB
until they match. No file, no record, no review. Rename a column in the schema
and push sees "column `old_name` exists in DB but not in schema" — so it drops
it. Your data goes with it. That's exactly what the phase-8 checklist line
"applies `api_keys`, drops `last_used_at`" was describing, and it was fine
*then* because the only data was yours.

**`generate` + `migrate`** writes the change as a numbered SQL file you read
before it runs, commits it to git, and records in a journal table which files
have already been applied. Same schema change, but now: reviewable, replayable,
and it never invents a `DROP COLUMN` you didn't ask for.

The awkward part is the transition. The DB was built by `push`, so those 5 SQL
files in `drizzle/` were generated but possibly never *applied as migrations* —
the journal may not know they ran. Running `migrate` blindly could try to
re-create tables that already exist. So: check the journal state first, and if
it's out of sync, tell Drizzle "these are already applied, start counting from
here." That's baselining. One-time cost.

**Definition of done:** `db:migrate` runs clean, journal in sync, `db:push` gone
from `package.json`.

---

# Phase 3 — API Keys + Audit UI (PR #9)

**What ships:** the product becomes usable. A user can mint a key, revoke it,
and see the history of every change.

## The work

**API keys** — `/projects/:id/settings`, currently a stub div:

- Query: list keys for the project's environments (name, prefix, env, created,
  revoked).
- Create dialog: pick environment + name → calls existing `createApiKey` →
  shows plaintext **once** with a copy button and a "you won't see this again"
  warning.
- Revoke: confirm dialog → new `revokeApiKey` action → sets `revokedAt`, writes
  an audit row.
- Add a comment on the `keyHash` lookup in `app/api/v1/flags/route.ts` — it must
  stay an uncached DB read.

**Audit log** — `/projects/:id/audit`, currently a stub div:

- Cached query, `LIMIT 100`, newest first, joined to the actor for a name.
- Table: time, actor, entity type + id, action, before/after diff.
- `ponytail:` comment noting the missing pagination and when to add it.

## Explanation

### Why the key UI is the unblocker

Everything in slice #8 works and nobody can use it. The endpoint authenticates
by hashing the bearer token and looking up `keyHash` — but there is no screen
that produces a token. `createApiKey` sits there fully written and audited with
zero callers.

The one subtlety is **plaintext shown once**. The DB stores only
`keyPrefix` (non-secret, for display: `fsk_prod_a1b2…`) and `keyHash` (sha256).
The full key is never written down. So the create dialog is the single moment in
the key's life where it's visible — miss the copy and the key is unrecoverable,
and you mint a new one. That's not a limitation, it's the point: a stolen
database dump contains no usable keys.

### Why revoke matters and why it's instant

Without revoke, "I pasted my production key into a screenshot" has no remedy
inside the product. You'd open a SQL client. That's not a product.

Revoke is *soft* — set `revokedAt`, never delete the row. Two reasons: the audit
trail keeps pointing at a real key, and a key id is never recycled.

The nice property: the route handler already does

```
if (!key || key.revokedAt) return INVALID_KEY;
```

against a **fresh DB read on every request**. So revocation takes effect on the
very next call. No cache to invalidate. This is worth a code comment, because
that per-request lookup looks like an obvious thing to cache in Redis — and
doing so would silently make revocation take up to 5 minutes. On a leaked
credential, five minutes is the whole incident.

**Rotation** needs no code: create new, revoke old. Two clicks.

### Why the audit UI is nearly free

Every mutation since #2 already writes an `audit_logs` row — actor, project,
environment, entity, action, before/after JSON diff, ip/userAgent. That data has
been accumulating and is invisible.

The read side has no hard parts. Append-only means no cache invalidation to
think about. No mutations means no server actions, no client state, no
optimistic updates. It's a `SELECT`, a join for the actor's name, and a table.

`LIMIT 100` with no pagination is deliberate. Add pagination when a project
actually has more history than that and someone asks — marked with a
`ponytail:` comment so it's a tracked shortcut, not a forgotten one.

One forward-looking note: phases 6a and 6b add segment and rule mutations. Those
must write audit rows too (CLAUDE.md principle 7). Not extra scope — just a
reminder that "who changed production targeting, and when" is the question this
page will actually be used for.

**Definition of done:** mint a key from the UI, call the eval API with it,
revoke it, next call 401s. Audit page shows all of those events.

---

# Phase 4 — Launch prep

**What ships:** signup can't be flooded; README stops lying.

## The work

- Apply `checkIpRateLimit` (already in `lib/ratelimit.ts`) to the signup path,
  ~3 attempts/hour/IP.
- README fixes: correct the endpoint to `POST /api/v1/flags`, drop the segments
  claim until phase 6, drop or qualify "self-hostable" until phase 7.
- README integration section: the `curl`, the `fetch` snippet, the response
  shape, one line on polling cadence.

## Explanation

### Signup limiting

Signup is currently open with no email verification. On a public URL that's a
bot magnet — and any account that gets created can author segments and mint
keys.

The reflex fix is email verification. But verification's actual job is proving
an address is *reachable*, and we send no email at all. It would only add
friction for the exact visitor we want (a recruiter trying the demo) while
costing an email provider integration.

What we actually fear is **volume**. Volume is what a rate limiter stops. We
already have `@upstash/ratelimit` deployed and a `checkIpRateLimit` helper
written for the eval API. Reusing it on signup is ~10 lines against machinery
that's already running.

Same failure mode as the eval API: if Redis is down, **fail open**. A Redis blip
must not make signup impossible. Rate limiting protects infrastructure; it is
not a security control.

### README

The README is the portfolio artifact. It currently documents an endpoint path
that doesn't exist, a settings page that's a stub, and self-hosting with no
Dockerfile. A reviewer who tries the curl and gets a 404 stops reading.

No SDK ships (decision #12), so the README *is* the integration story. The API
is one POST with a bearer header — a copy-pasteable snippet demonstrates that
more credibly than a 30-line wrapper would.

**Definition of done:** every claim in the README is true against `main`.

---

# Phase 5 — Deploy

**What ships:** a live URL.

## The work

- Vercel project from the repo.
- Env vars: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL` (the
  real domain), `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.
- Run `db:migrate` against the production DB.
- Smoke test: sign up, create project, create flag, mint key, curl the eval API,
  toggle the flag, curl again and confirm the change.

## Explanation

Vercel needs no config for Next 16 — they ship the framework. The stack was
already chosen for a serverless host: Neon's driver talks HTTP (no connection
pool to size), Upstash is REST (no TCP socket). Nothing here needs a VPC.

Two things to actually verify rather than assume:

**`NEXT_PUBLIC_APP_URL` must be the real domain.** `lib/auth.ts` falls back to
`http://localhost:3700`. Wrong value = broken auth callbacks in production, and
the failure looks like "login just doesn't work."

**`cacheComponents: true`.** The `"use cache"` blocks in `lib/queries/` behave
differently in a production build than in dev. Confirm the flags list still
reflects a mutation immediately — `updateTag` is what makes that work, and it's
the thing most likely to behave differently once deployed.

The smoke test is deliberately end-to-end rather than a checklist of pages. The
sequence "toggle in admin → curl reflects it" exercises the Postgres write, the
`delEnvConfig` invalidation, the Redis miss, the rebuild, and the response — one
curl covers the whole spine.

**Definition of done:** the smoke sequence passes against the live URL.

---

# Phase 6 — Segment Targeting (PR #10)

**What ships:** the differentiating feature. Rules like "beta testers get it,
EU users don't, everyone else 10%."

Three sub-slices, in order. Each is independently reviewable.

## 6a — Zod + segments CRUD

**The work**

- Remove `regex` from `segmentConditionOperatorSchema`.
- Add `traits` to `evaluateFlagsSchema`: `Record<string, string|number|boolean>`,
  cap ≤30 keys and ≤200 chars per string value.
- Segments CRUD actions (create/update/delete), audited, owner-checked via
  `requireProjectAccess`.
- Segments page (currently a stub): list + create/edit dialog with the condition
  builder.

**Explanation**

The schema for segments already exists — `segments` table with a jsonb `rules`
column typed via `$type<SegmentRules>()`, and `segmentRulesSchema` shaped as
`{ match: "all"|"any", conditions: [...] }`. Flat, no nesting. So this sub-slice
is UI plus actions, not schema design.

**Why `regex` gets dropped.** The pattern would come from a segment (authored by
any signed-up user) and run inside your request handler, per condition, per
request. `(a+)+$` against a 200-character trait hangs the event loop — that's
ReDoS. There is no safe way to run untrusted regex in-process in Node: no
timeout, no sandbox, `RegExp` blocks. One bad pattern stalls *every* tenant's
evaluations, not just the author's. `contains` covers essentially every real use
case. No segments exist yet, so nothing breaks — it's a one-line enum edit.

**Why traits come from the client.** A segment says `plan = pro`; the evaluator
needs this user's `plan`. Two ways to learn it: store profiles server-side and
look them up, or have the caller send them. We send them (decision #3). The
caller already has the user object in hand — that's what every real SDK does.
Storing profiles would mean adding a write path to a read-only cached endpoint,
plus a table, plus an ingest API, plus a staleness policy.

The caps matter: traits travel on every request and get iterated per condition.
Uncapped, a client can send a 10MB object and make you scan it.

**The condition builder and value typing.** The form gives you text inputs,
which produce strings. But `age gt 18` must persist as the *number* 18 — because
matching is strict with no coercion (decision #6), so `"18"` would never match a
numeric trait.

So the type is **inferred from the operator**:

```
gt / gte / lt / lte  → parse as number, reject non-numeric at save time
in                   → split on comma; all numeric → number[], else string[]
contains             → string
eq / neq             → "true"/"false" → boolean, all digits → number, else string
```

No fourth "type" dropdown. The operator already implies the type — that's why
`gt` exists separately from `eq` — and a dropdown would let a user pick
"number" for a country code and silently break their own rule.

One deliberate exception: `eq`/`neq` **compare as strings if either side is a
string**. A zip code `"01234"` and the number `1234` are genuinely ambiguous at
authoring time, so the ambiguity is resolved at match time where both sides are
visible. `gt/gte/lt/lte` stay strictly numeric — no exception there, because
that's exactly where string comparison produces `"9" > "18" === true`.

## 6b — Flag detail page + rules CRUD

**The work**

- New route `/projects/:id/flags/:key`; flags table row links to it.
- Query: flag + its 3 env states + each state's rules + each rule's segment.
- Per environment: the existing switch + rollout, then an ordered rule list —
  segment picker, serve on/off, optional rollout override, reorder, delete.
- Rules CRUD actions, audited.
- Invalidation: a rule change DELs that one env's blob. A **segment** change DELs
  **all three** env blobs for the project.

**Explanation**

**Why a new page.** Rules attach to a flag *and* an environment — so every flag
has three independent rule lists. Each rule row is a compound control: segment
dropdown, serve toggle, optional rollout, reorder, delete. That's a page's worth
of UI × 3. It does not fit in a 256px popover (and a dropdown inside a popover
fights Radix's click-outside handling), and a sheet gives you no URL to link
from an audit-log row later.

The existing table and `FlagEnvCell` stay untouched — quick toggles from the list
view still work. This adds a page; it doesn't replace one.

**Why segment edits invalidate three cache keys.** Segments are *project*-scoped.
The cache is *environment*-scoped. And per decision #4 the segment's conditions
are **inlined** into each cached rule. So editing one segment can change the
resolved config of all three environments — every blob that inlined it must go.

Three `DEL`s and a lazy rebuild on next request. Segment edits are rare admin
actions; evaluations are the hot path. Denormalizing at write time and paying a
small invalidation cost is the whole trade.

**Priority is already constrained.** The DB has a unique index on
`(flagEnvironmentStateId, priority)` — two rules can't share a priority. So
reordering must renumber within a transaction, not swap two values one at a
time (that would transiently collide and throw).

## 6c — Evaluator + cache v2

**The work**

- Extend `resolveEnabled` to walk rules; add segment matching.
- Cache key `flags:env:<id>` → `flags:env:v2:<id>`.
- Blob shape gains rules with inlined conditions.
- Cache-miss DB read becomes a 4-table join (states → flags → rules → segments).
- `scripts/evaluation.test.ts` per §5.3; close the 5 known checklist gaps.

**Explanation**

Today `resolveEnabled(state, identity)` is: not enabled → false; else bucket vs
rollout. It becomes:

```
1. state.enabled === false        → false     (kill switch; rules never consulted)
2. walk rules by priority ASC:
     first rule whose segment matches traits:
       servedValue === false      → false     (hard stop, no bucketing)
       servedValue === true       → bucket against (rule.rolloutPercentage ?? state.rolloutPercentage)
3. no rule matched               → bucket against state.rolloutPercentage
```

**Why the cache key must be versioned.** Old-shape blobs (no `rules` field) live
in Redis for up to 5 minutes after you deploy. Without a key bump, the new
evaluator reads `rules: undefined` on them and silently skips all targeting for
those 5 minutes — no error, no log, wrong flags. Bumping to `v2` means the new
code can only ever read blobs the new code wrote. Old keys expire on their own.

**Why the join gets bigger.** On a cache miss the endpoint currently joins
`flag_environment_states → flags`. It now also needs the rules for each state
and the segment definition each rule points at — 4 tables. Slower, but it only
runs on a miss, and the result is cached for 5 minutes. This is the cost of the
one-GET hot path.

**Anonymous requests.** Traits may be present without an identity, so segment
matching still runs. Only the bucketing step degrades: no identity means
`rollout === 100` or off. Same conservative rule as today — never random,
because random breaks determinism.

---

# Phase 7 — Dockerfile

**What ships:** the "self-hostable" claim becomes true.

## The work

- `output: "standalone"` in `next.config.ts`.
- Multi-stage Dockerfile (deps → build → runtime on a slim base).
- README self-host section: build, run, required env vars.

## Explanation

`output: "standalone"` makes Next emit a self-contained server bundle with only
the `node_modules` actually reached at runtime — a much smaller image than
copying the whole dependency tree.

This is independent of everything above and touches no application code, which
is exactly why it comes last. Nothing in phases 1–6 depends on it.

Note there is no lock-in either direction: `cacheComponents` / `"use cache"` is
Next's own caching layer. On Vercel it's backed by their infrastructure; in a
container it's in-memory/filesystem and resets on redeploy. Redis stays the hot
path for flag evaluation either way, so the behaviour that matters is identical.

---

# 5. Reference

## 5.1 Evaluator precedence — the four rules

**1. Kill switch beats targeting.** `enabled: false` means off for everyone,
including a matched segment with `servedValue: true`.

*Why:* at 3am with checkout erroring, you flip the switch and expect *off*. If a
targeting rule could override it, some users still hit broken code and you're
now debugging rules during an incident. The switch must mean one thing.

**2. `servedValue: false` is a hard exclude.** First match wins, even when the
match says no. The walk stops; later rules never run.

```
priority 1: eu-users     → false
priority 2: beta-testers → true
```

A user who is both EU and beta gets `false`. That's what a priority list means —
if a false result kept the walk going, you could no longer read the list
top-down and predict the answer.

**3. Rollout override applies to `servedValue: true` only.** Rollout means "what
fraction of matched users get it." A deny rule gives them nothing, so a fraction
of nothing is meaningless. A false-serving rule ignores rollout entirely.

**4. Bucketing salt stays `flagKey:identity`.** The bucket comes from hashing
`"new-checkout:user-42"` — never from which rule matched.

```
user-42 → bucket 3200
10% → 3200 < 1000? no  → off
20% → 3200 < 2000? no  → off
```

The bucket never moves. Raise rollout and only new users turn on; nobody flips
off. That's the monotonic property `scripts/bucketing.test.ts` already checks,
and it must survive rules being added.

Salting per-rule (`ruleId:identity`) would rehash everyone the moment any rule
is added — users lose a feature they had, others gain one, and nobody deployed a
change to *them*. The flag just flaps. No error, no log, angry users.

## 5.2 Condition matching semantics

**Missing trait → false, for every operator including `neq`.**
If `neq` returned true on a missing trait, `plan != "free"` would match users
with no plan at all — so a deny rule silently catches anonymous traffic.

**Type mismatch → false, no coercion.**
`age gt 18` against `age: "twenty"` is false. `gt/gte/lt/lte` require a numeric
trait; `contains` requires a string; `in` requires the array's element type.
JS coercion (`"" == 0`, `"5" > 10` being false via string compare) is the classic
source of silently-wrong flags.

**`regex` removed from the operator enum.** ReDoS — see 6a.

**Exception, narrow:** `eq`/`neq` compare as strings when either side is a
string. Everything else stays strict.

## 5.3 Required evaluator tests

These are the cases that fail *silently* rather than loudly:

- kill switch beats a matched `servedValue: true` rule
- first-match-wins, including `servedValue: false` stopping the walk
- missing trait → false for every operator, `neq` included
- type mismatch → false, no coercion
- monotonic stability *with a rule matched* (5.1 #4 extended)
- `regex` rejected by the Zod enum
- rollout override used when present, state default when null

Plus the 5 gaps already listed in `plan/test/#8-evaluation-api-checklist.md`:
`checkIpRateLimit` fail-open, identity length cap → 400, empty identity → 400,
malformed JSON → 400, wrong-type identity → 400.

No test framework. Plain `bun scripts/*.test.ts` with asserts, matching the
existing four. The evaluator is a pure function over a plain object — the
cheapest thing in the codebase to test and the most expensive to get wrong.

UI is form-fill; manual clicking finds those bugs fine.
