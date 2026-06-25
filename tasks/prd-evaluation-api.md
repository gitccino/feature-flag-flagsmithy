# PRD — Evaluation API

**Project:** Flagsmithy
**Branch:** `ralph/evaluation-api`
**Source:** `plan/evaluation-api-slice.md`

Public flag evaluation API: an external client POSTs an environment API key + an optional identity and receives the resolved on/off state of every flag in that environment — bucketed by rollout percentage, served from a Redis-cached config, rate-limited per key.

Stories are ordered by dependency (schema → backend → cache/limiter). No UI in this slice, so no browser-verification criteria.

---

## US-001 — `api_keys` table + migration

**Priority:** 1
**As a** developer, **I want** an `api_keys` table **so that** evaluation requests can be authenticated per environment.

**Acceptance criteria**
- [ ] `apiKeys` table in `lib/db/flag-schema.ts`: `id`, `environmentId` (FK → environments, on delete cascade), `name`, `keyPrefix`, `keyHash`, `lastUsedAt` (nullable), `createdAt`, `revokedAt` (nullable)
- [ ] Unique index on `keyHash`; index on `environmentId`; `apiKeys`↔`environments` relation defined
- [ ] Drizzle migration generated and runs successfully
- [ ] Typecheck passes

---

## US-002 — API-key crypto + `createApiKey` action

**Priority:** 2
**As a** project owner, **I want** to mint an environment API key **so that** a client can authenticate to the evaluation API.

**Acceptance criteria**
- [ ] `lib/api-keys.ts`: `generateApiKey` (`fsk_<env>_<32-byte base64url>` → `{plaintext, keyPrefix, keyHash}`), `hashApiKey` (sha256), `parseBearer`
- [ ] `createApiKey` server action: Zod-validates input, resolves session, re-checks project ownership via `requireProjectAccess`
- [ ] Stores only `keyPrefix` + `keyHash`; returns plaintext exactly once
- [ ] Writes audit log (`entityType:"api_key"`, `action:"create"`, `environmentId` set, no secret in diff)
- [ ] Tests pass (generate→hash→parse round-trip)
- [ ] Typecheck passes

---

## US-003 — Deterministic bucketing module

**Priority:** 3
**As a** developer, **I want** deterministic rollout bucketing **so that** `rolloutPercentage` resolves to a stable per-identity boolean.

**Acceptance criteria**
- [ ] `lib/evaluation/bucketing.ts`: inline FNV-1a, `bucketFor(flagKey, identity)` = `fnv1a(\`${flagKey}:${identity}\`) % 10000`
- [ ] `resolveEnabled(state, identity?)`: identity → `state.enabled && bucket < rolloutPercentage*100`; no identity → `state.enabled && rolloutPercentage === 100`
- [ ] Tests pass: distribution within ±2% of target at 50% rollout; monotonic (raising rollout never drops an in-bucket identity)
- [ ] Typecheck passes

---

## US-004 — `POST /api/v1/flags` endpoint

**Priority:** 4
**As an** external client, **I want** to POST a key + identity **so that** I receive the resolved state of every flag in the environment.

**Acceptance criteria**
- [ ] `app/api/v1/flags/route.ts` POST: `parseBearer` → `hashApiKey` → lookup `api_keys`; missing/unknown/revoked → `401 {error:"invalid api key"}` (generic)
- [ ] Resolves `environmentId` from the key; Zod-parses body `{ identity?: string }`, bad → `400`
- [ ] Reads flags + states for the env from Postgres, buckets each via `resolveEnabled`
- [ ] Returns `200 { flags: { "<key>": { enabled } } }` (map-keyed, single boolean, rollout % not exposed); empty env → `{flags:{}}`
- [ ] Tests pass (auth reject, deterministic result, anonymous all-or-nothing)
- [ ] Typecheck passes

---

## US-005 — Redis config cache + invalidation

**Priority:** 5
**As a** client, **I want** evaluation served from cache **so that** the hot path stays fast, while admin changes still take effect immediately.

**Acceptance criteria**
- [ ] `bun add @upstash/redis @upstash/ratelimit`; `lib/redis.ts` with one Upstash client; env vars `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN`
- [ ] `getEnvConfig`/`setEnvConfig`/`delEnvConfig` for key `flags:env:<envId>`, `EX 300`
- [ ] Endpoint reads cache first; miss populates from Postgres; Redis unavailable falls back to Postgres without 500
- [ ] Invalidation wired into existing flag actions: `setFlagEnvironmentState` DELs the one env; `createFlag`/`deleteFlag` DEL all 3 project envs; `updateFlag` does not bust
- [ ] Typecheck passes

---

## US-006 — Per-key rate limiting

**Priority:** 6
**As a** platform operator, **I want** the evaluation API rate-limited per key **so that** one tenant cannot exhaust capacity.

**Acceptance criteria**
- [ ] `@upstash/ratelimit` sliding window (~100/10s) keyed on `keyHash`, sharing the `lib/redis.ts` client
- [ ] Over limit → `429` + `Retry-After` header
- [ ] Limiter infrastructure error → fail open (allow + log); a genuine over-limit is still enforced
- [ ] Typecheck passes
