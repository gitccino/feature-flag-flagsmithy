# Evaluation API — Vertical Slice

## 1. Context & Motivation

PR #4 shipped the flags slice: per-environment `enabled` + `rolloutPercentage`,
stored via the flag × environment matrix. That data is currently **inert** —
`rolloutPercentage` is persisted but nothing consumes it. The product is, today,
an admin CRUD surface with no read path.

This slice builds the **public flag evaluation API**: the endpoint an external
SDK/client calls to learn which features are live for a given user. It is the
first slice that turns stored config into product value, and it is unblocked —
flags, environments, and per-env states all exist.

We deliberately jump ahead of the `segments → targeting rules` slices in the
original dependency order. Rationale: a global-rollout evaluator delivers real
end-to-end value now, it forces the riskiest unsolved decision (deterministic
bucketing) early, and segment targeting later plugs into the *same* evaluator
rather than blocking it.

**Outcome:** an external client sends `POST /api/v1/flags` with an environment
API key and an identity, and receives the resolved on/off state of every flag in
that environment — bucketed by rollout percentage, served from a Redis-cached
config, and rate-limited per key.

## 2. Scope

### In scope
- New `api_keys` table (environment-scoped, hashed storage, soft-revoke).
- Minimal key issuance: a single `createApiKey` server action returning the
  plaintext key once; audited.
- Upstash Redis + `@upstash/ratelimit` integration (one client, shared by cache
  and limiter).
- `POST /api/v1/flags` route handler: authenticate → rate limit → validate →
  read cached config → bucket per identity → respond.
- Deterministic bucketing (FNV-1a, per-flag salt, 10 000-bucket granularity).
- Redis cache of per-environment evaluated config + explicit invalidation wired
  into the existing flag server actions.

### Out of scope
- API-key **management UI** (list / rotate / revoke buttons) — later API-keys slice.
- **Segment targeting** evaluation — schema exists (`segments`,
  `flagTargetingRules`) but the evaluator ignores it this slice. It will extend
  the same bucketing path later.
- Single-flag convenience endpoint (`GET /api/v1/flags/:key`) — bulk only for now.
- Streaming / SSE / webhook flag updates. Clients poll.

## 3. Key Decisions (resolved via grilling)

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| 1 | Endpoint shape | **Bulk**, `POST`, identity in body, **server-side bucketing** | Mirrors real SDK bootstrap (one payload); one Redis read; bucketing logic lives in one place; segments plug into the same path later. |
| 2 | Cache granularity | Cache the per-env **config**, bucket **per request** in memory | Per-identity results aren't cacheable; per-env config is. One GET + a cheap in-memory hash gives both speed and per-user correctness. |
| 3 | API key scope | **Per environment** | The environment is the security boundary; the endpoint derives the env *from the key*, so the client cannot spoof it. |
| 4 | Key storage | **Hash only** (sha256), unique-indexed; plaintext shown once | Never store secrets at rest. Lookup is a constant-time unique-index hit on `keyHash`. |
| 5 | Key format | `fsk_<env>_<32-byte-random>`; store display `keyPrefix` + `keyHash` | Prefix aids human/log identification; the random tail is the secret. |
| 6 | Revocation | **Soft** (`revokedAt` timestamp), never hard-delete | Preserve audit trail; never recycle a key. |
| 7 | Bucketing | `fnv1a(\`${flagKey}:${identity}\`) % 10000`; `enabled = state.enabled && bucket < rolloutPercentage * 100` | Deterministic, stable under rollout increase, decorrelated across flags via per-flag salt. |
| 8 | Hash function | **Inline FNV-1a** (no dependency) | Distribution is ample at 10k granularity; upgrade to xxhash only if measured skew. |
| 9 | Anonymous requests | `identity` **optional**; no identity → `enabled = state.enabled && rolloutPercentage === 100` | Supports global server-side flags; conservative (partial rollout → off) for unidentified traffic; never random (would break determinism). |
| 10 | Redis cache value | Per-env **blob**: `flags:env:<envId>` → `[{ key, enabled, rolloutPercentage }]` | Bulk endpoint needs all flags anyway; one GET, one deserialize. |
| 11 | Cache TTL | `EX 300` (5 min) | Self-healing backstop if an invalidation is ever missed. |
| 12 | Cache invalidation | **Explicit `DEL`** on mutation, scoped to affected env(s); TTL as backstop | Admin changes must take effect immediately, not after TTL. |
| 13 | Rate-limit key | **Per API key** (= per env) | Clients share IPs behind NAT; the key is the true tenant. |
| 14 | Rate-limit algorithm | **Sliding window** (~100 / 10s, tunable) | No burst-at-boundary problem. |
| 15 | Limiter failure mode | Over-limit → **429 + Retry-After**; limiter **infra error → fail open** | Read-only hot path; a Redis blip must not black out every client's flags. Rate limiting protects infra, it is not a security control. |
| 16 | Response shape | Map keyed by flag key; single resolved `enabled` boolean | O(1) client lookup; rollout % not leaked. |
| 17 | Error semantics | Generic 401; 400 on Zod fail; 200 (`{flags:{}}`) on empty env; 5xx only on true fault | Generic 401 avoids leaking unknown-vs-revoked; Redis-down degrades to Postgres, never 500. |
| 18 | Versioning | Path `/api/v1/flags` | Cheap future-proofing of the public contract. |

## 4. Architecture

```
client ──POST /api/v1/flags──▶ route handler
  Authorization: Bearer fsk_prod_…
  body: { identity? }
                                   │
                  ┌────────────────┼────────────────┐
                  ▼                ▼                ▼
            1. authenticate   2. rate limit    3. validate body (Zod)
            sha256(key) →     ratelimit        { identity?: string }
            api_keys lookup   .limit(keyHash)
            → environmentId
                  │
                  ▼
            4. read config: GET flags:env:<envId>
               hit → use blob
               miss → query Postgres, SET EX 300
               redis down → query Postgres, skip cache
                  │
                  ▼
            5. bucket each flag in memory (FNV-1a)
                  │
                  ▼
            6. 200 { flags: { "<key>": { enabled } } }
```

Admin write path (existing flag actions) gains a Redis-busting side effect:

```
setFlagEnvironmentState ─▶ DEL flags:env:<thatEnvId>
createFlag / deleteFlag ─▶ DEL flags:env:<each of the 3 envIds>
updateFlag (name/desc)  ─▶ (no Redis bust — not in cached config)
```

## 5. Implementation

### 5.1 Schema — `lib/db/flag-schema.ts`
Add an `apiKeys` table and its relation:

- `id` uuid pk
- `environmentId` uuid → `environments.id` **on delete cascade**
- `name` text (human label, e.g. "Production SDK")
- `keyPrefix` text — display only, e.g. `fsk_prod_a1b2…` (first ~12 chars)
- `keyHash` text — **unique index** (sha256 of the full key; the lookup column)
- `lastUsedAt` timestamp nullable
- `createdAt` timestamp default now
- `revokedAt` timestamp nullable (soft-revoke)
- Indexes: unique on `keyHash`; index on `environmentId`.
- Relation: `apiKeys` ↔ `environments` (one env has many keys).

Generate + run the Drizzle migration. Export inferred types.

### 5.2 Validation — `lib/zod-schema.ts`
- `createApiKeySchema`: `{ environmentId: uuid, name: z.string().trim().min(1).max(60) }`.
- `evaluateFlagsSchema`: `{ identity: z.string().min(1).max(200).optional() }`.
- Export `z.infer` types for both.

### 5.3 Hashing & bucketing — `lib/evaluation/bucketing.ts` (new)
- `fnv1a(input: string): number` — inline, deterministic, unsigned 32-bit.
  - `// ponytail: FNV-1a, swap to xxhash if distribution skews`
- `bucketFor(flagKey: string, identity: string): number` → `fnv1a(\`${flagKey}:${identity}\`) % 10000`.
- `resolveEnabled(state, identity?)`:
  - identity present → `state.enabled && bucketFor(...) < state.rolloutPercentage * 100`
  - identity absent → `state.enabled && state.rolloutPercentage === 100`
- **Self-check** (`demo()` / `test_*`): assert that over N=10 000 identities the
  in-bucket rate for `rolloutPercentage=50` lands within ±2% of 0.5, and that
  raising 10→20 never removes a previously in-bucket identity (monotonicity).

### 5.4 API-key crypto — `lib/api-keys.ts` (new)
- `generateApiKey(envKey): { plaintext, keyPrefix, keyHash }` — `fsk_<envKey>_<crypto.randomBytes(32).toString("base64url")>`.
- `hashApiKey(plaintext): string` — sha256 hex.
- `parseBearer(header): string | null`.

### 5.5 Redis — `lib/redis.ts` (new)
- One `@upstash/redis` client from `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
- One `Ratelimit` (sliding window, 100/10s) sharing that client.
- `getEnvConfig(envId)` / `setEnvConfig(envId, config)` / `delEnvConfig(envId)` —
  key shape `flags:env:<envId>`, `EX 300`. All wrapped so a Redis error throws a
  typed signal the caller can treat as "cache unavailable", **not** a 500.
- `bun add @upstash/redis @upstash/ratelimit`.

### 5.6 Cache invalidation — wire into `app/actions/flags.ts`
Add an `invalidateEnvCache` step next to the existing `updateTag(cacheTags.flags(projectId))` calls:
- `setFlagEnvironmentState` → `delEnvConfig(thatEnvironmentId)`.
- `createFlag` / `deleteFlag` → look up the project's 3 env ids, `delEnvConfig` each.
- `updateFlag` → **no change** (name/description aren't in the cached config).

### 5.7 Key issuance — `app/actions/api-keys.ts` (new)
- `createApiKey(input)` — `"use server"`, typed `{ ok: true, data } | { ok: false, error, fieldErrors? }`.
  1. Zod-validate (`createApiKeySchema`).
  2. Resolve session (`auth.api.getSession`), look up the environment's `projectId`,
     re-check ownership via `requireProjectAccess` (`lib/auth/project-access.ts`).
  3. `generateApiKey` → insert `{ environmentId, name, keyPrefix, keyHash }`.
  4. Audit log (`entityType:"api_key"`, `action:"create"`, `environmentId` set,
     `after:{ name, keyPrefix }` — **never** the plaintext or hash), with
     `ip`/`userAgent` from `headers()`.
  5. Return `{ ok: true, data: { plaintext, keyPrefix } }` — **plaintext shown once**.
- Reuse the `isUniqueViolation` (`23505`) pattern from `projects.ts` for the
  `keyHash` unique index (astronomically unlikely, but handled).

### 5.8 Route handler — `app/api/v1/flags/route.ts` (new)
`export async function POST(request: Request)`:
1. `parseBearer` → missing/malformed → **401** `{error:"invalid api key"}`.
2. `hashApiKey` → look up `api_keys` by `keyHash`. Not found **or** `revokedAt != null`
   → **401** (same generic message — do not distinguish). Resolve `environmentId`.
   Best-effort `lastUsedAt = now()` (fire-and-forget; never blocks the response).
3. `ratelimit.limit(keyHash)`:
   - `success === false` → **429** with `Retry-After` header.
   - limiter **throws** (infra) → log, **fall through** (fail open).
4. Parse JSON body with `evaluateFlagsSchema`. Bad JSON / shape → **400**.
5. `getEnvConfig(envId)`:
   - hit → use blob.
   - miss → query Postgres (flags + states for env), `setEnvConfig`.
   - Redis unavailable (get **or** set throws) → query Postgres, skip cache, **do not 500**.
6. Bucket each flag via `resolveEnabled(state, identity)`.
7. **200** `{ flags: { "<key>": { enabled } } }`. Empty env → `{flags:{}}`.
8. Unhandled fault → **500** `{error:"internal error"}` (only true server faults reach here).

Validate the body with Zod before use; never trust client input (CLAUDE.md §4).

## 6. Files Touched

| File | Change |
|------|--------|
| `lib/db/flag-schema.ts` | + `apiKeys` table + relation |
| `lib/zod-schema.ts` | + `createApiKeySchema`, `evaluateFlagsSchema` |
| `lib/evaluation/bucketing.ts` | **new** — FNV-1a + resolveEnabled + self-check |
| `lib/api-keys.ts` | **new** — generate / hash / parseBearer |
| `lib/redis.ts` | **new** — Upstash client, ratelimit, env-config cache helpers |
| `app/actions/api-keys.ts` | **new** — `createApiKey` action |
| `app/actions/flags.ts` | + Redis invalidation in existing actions |
| `app/api/v1/flags/route.ts` | **new** — the evaluation endpoint |
| `.env` / `.env.example` | + `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` |
| `package.json` | + `@upstash/redis`, `@upstash/ratelimit` |
| Drizzle migration | **new** — `api_keys` |

## 7. Security Considerations
- **Re-verify authorization inside the action**, not just routing — `createApiKey`
  resolves session + `requireProjectAccess` server-side (CLAUDE.md §5).
- Plaintext key returned **once**, never persisted, never logged, never audited.
- Generic 401 for missing / unknown / revoked — no enumeration oracle.
- Rate limiter fails **open** only on infra error; a genuine over-limit is enforced.
- The endpoint derives `environmentId` from the key — a client cannot read another
  environment by changing a parameter.
- All input (header, body) validated before use.

## 8. Verification

### Automated
- `bun run lint` and `tsc` clean — no `any`, no unchecked casts.
- `lib/evaluation/bucketing.ts` self-check passes (distribution ±2% at 50%,
  monotonic under rollout increase).

### Manual
1. Mint a key: trigger `createApiKey` for a project's production env → plaintext
   returned once; row in `api_keys` has only `keyPrefix` + `keyHash`.
2. `curl -XPOST /api/v1/flags -H "Authorization: Bearer fsk_prod_…" -d '{"identity":"user-1"}'`
   → `200 { flags: { … : { enabled } } }`.
3. **Determinism:** same identity, repeated calls → identical result. Different
   identities at 50% rollout → roughly half on.
4. **Stability:** raise a flag's rollout 10→20 in admin → previously-on identities
   stay on.
5. **Immediate invalidation:** toggle a flag in admin → the *next* eval reflects
   it (DEL fired), without waiting for the 5-min TTL.
6. **Anonymous:** omit `identity` → flags at <100% read `false`; flags at 100% +
   enabled read `true`.
7. **Auth:** missing key, garbage key, revoked key → all `401 invalid api key`.
8. **Rate limit:** exceed the window → `429` + `Retry-After`.
9. **Degradation:** with Redis credentials removed, the endpoint still serves from
   Postgres (no 500).
10. Audit log row written for the `createApiKey` mutation (`entityType:"api_key"`,
    `environmentId` set, no secret in the diff).

## 9. Follow-on Slices (unblocked by this work)
- **Segment targeting evaluation** — extend `resolveEnabled` to walk
  `flagTargetingRules` (first-match-by-priority) before falling back to the
  default rollout; segment schema already exists.
- **API-key management UI** — list / rotate / revoke, `lastUsedAt` surfacing.
- **Audit-log read UI** — surface the trail this and prior slices write.
