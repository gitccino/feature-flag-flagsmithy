import assert from "node:assert/strict";

// A Redis outage must never black out flag evaluation: both limiters allow the
// request when Redis is absent. lib/redis builds its client at import time from
// the env, and bun autoloads .env.local — so the env vars must be cleared
// *before* the module is imported, hence the dynamic import below. A static
// import would pick up real credentials and the fail-open branch would never
// run, leaving these assertions vacuous.
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

async function main() {
  const { redis } = await import("@/lib/redis");
  assert.equal(
    redis,
    null,
    "test setup: Redis must be absent to reach fail-open",
  );

  const { checkIpRateLimit, checkRateLimit } = await import("@/lib/ratelimit");

  for (const [name, check] of [
    ["per-key", checkRateLimit],
    ["per-IP", checkIpRateLimit],
  ] as const) {
    const r = await check("any-identifier");
    assert.equal(r.allowed, true, `${name}, no Redis must fail open (allowed)`);
    assert.equal(r.retryAfter, 0, `${name} fail-open retryAfter is 0`);
  }

  console.log("ratelimit fail-open ok");
}

main();
