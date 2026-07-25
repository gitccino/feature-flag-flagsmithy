# Evaluation API — Pre-Merge Test Checklist

Source plan: [`../evaluation-api-slice.md`](../evaluation-api-slice.md) (§8 Verification).
Run before closing PR #8 and merging `feat/evaluation-api` → `main`.

Legend: `[x]` automated & passing · `[ +]` automated gap to add · `[man]` manual (needs live infra).

---

## Automated

Run all:

```bash
bun scripts/bucketing.test.ts \
  && bun scripts/api-keys.test.ts \
  && bun scripts/ratelimit.test.ts \
  && DATABASE_URL='postgresql://u:p@localhost/db' bun scripts/eval-endpoint.test.ts
```

> `eval-endpoint.test.ts` needs the dummy `DATABASE_URL` so `lib/db` constructs at import — no connection is made.

### Bucketing — `bucketing.test.ts`

- [x] Distribution: 50% rollout splits ~half (±2%, 10k sample)
- [x] Monotonic: raising rollout never drops an already-in-bucket identity
- [x] Determinism: same `(flagKey, identity)` → same bucket
- [x] Disabled flag always off
- [x] Anonymous all-or-nothing (100% on; 99% / 0% off)

### Key crypto — `api-keys.test.ts`

- [x] generate → hash → parse round-trip; format `fsk_<env>_…`
- [x] hash stable, deterministic, `!=` plaintext
- [x] `parseBearer` edge cases (null, case-insensitive scheme, empty token, no scheme)
- [x] two generated keys differ

### Rate limit — `ratelimit.test.ts`

- [x] per-key, no Redis → fail open (allowed, retryAfter 0)
- [x] per-IP, no Redis → fail open (`checkIpRateLimit`)

> Both assert `redis === null` first. bun autoloads `.env.local`, so with real
> Upstash creds present these passed against a live limiter that simply wasn't
> over its cap — the fail-open branch never ran and the assertions were vacuous.
> The env vars are now cleared before `lib/redis` is imported; keep that ordering.

### Endpoint — `eval-endpoint.test.ts`

- [x] no Authorization header → 401
- [x] non-Bearer scheme → 401
- [x] map shape: keyed by flag key, single `enabled` bool, rollout % not exposed
- [x] anonymous all-or-nothing
- [x] deterministic per-identity across repeated calls
- [x] empty env → `{}`
- [x] identity length cap: `{"identity":"x".repeat(201)}` → 400 (200 chars still accepted)
- [x] empty identity: `{"identity":""}` → 400
- [x] malformed JSON body → 400
- [x] wrong-type identity: `{"identity":123}` → 400
- [x] absent / empty body → anonymous evaluation (not a 400)
- [x] repeated 401s each carry a readable body (no shared module-level `Response`)

> The four 400 paths are exercised through `parseBody`, the seam `POST` uses for
> body validation — the handler reaches them only after a DB key lookup, so
> testing them via `POST` would need live infra. That the route still routes
> through the seam is covered by `[man]` curl below, not by these tests.

---

## Manual

Needs live DB + Redis + a minted key (`bun scripts/mint-key.ts`).

- [man] Mint key → plaintext returned once; row stores only `keyPrefix` + `keyHash`, no plaintext
- [man] `curl -XPOST /api/v1/flags -H "Authorization: Bearer fsk_…" -d '{"identity":"user-1"}'` → 200 map
- [man] Unknown key (valid format, not in DB) → 401
- [man] Revoked key (`revokedAt` set) → 401, same generic message (no oracle)
- [man] Determinism live: same identity repeated → identical; ~50 distinct identities at 50% → roughly half on
- [man] Stability: raise flag 10→20% in admin → previously-on identities stay on
- [man] Immediate invalidation: toggle flag in admin → next eval reflects it (DEL fired, no 5-min TTL wait)
- [man] Per-key 429: exceed 100/10s on one key → 429 + `Retry-After`
- [man] Per-IP 429 (gap #3): spam bad keys past 300/10s from one IP → 429 _before_ the DB lookup
- [man] Redis-down degradation: remove Upstash creds → still serves from Postgres, no 500, no limiting
- [man] Audit: `createApiKey` writes `audit_logs` row (`entityType:"api_key"`, `environmentId` set, no secret in diff)
- [man] Env isolation: a key for env A never returns env B's flags

---

## Pre-merge housekeeping

- [ ] `bunx tsc --noEmit` clean
- [ ] `bun run lint` clean
- [ ] `bun run db:push` against the real DB (drops `last_used_at`, applies `api_keys`)
- [ ] Decide `scripts/mint-key.ts` — dev-only, bypasses auth/audit. Keep or delete before merge.
- [ ] PR #8 description notes the `{"identity":""}` → 400 behavior change
