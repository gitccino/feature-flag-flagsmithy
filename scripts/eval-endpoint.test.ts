import assert from "node:assert";

// Run: DATABASE_URL='postgresql://u:p@localhost/db' bunx tsx scripts/eval-endpoint.test.ts
// The dummy URL only lets lib/db construct at import time; no connection is made.
import { buildFlagMap, POST } from "@/app/api/v1/flags/route";

async function main() {
// Auth reject: no Authorization header -> 401 (returns before any DB access).
{
  const res = await POST(new Request("http://x/api/v1/flags", { method: "POST" }));
  assert.equal(res.status, 401);
  assert.deepEqual(await res.json(), { error: "invalid api key" });
}

// Auth reject: non-Bearer scheme -> 401.
{
  const res = await POST(
    new Request("http://x/api/v1/flags", {
      method: "POST",
      headers: { authorization: "Basic abc" },
    }),
  );
  assert.equal(res.status, 401);
}

// Map shaping: keyed by flag key, single boolean, rollout % not exposed.
const states = [
  { key: "a", enabled: true, rolloutPercentage: 100 },
  { key: "b", enabled: false, rolloutPercentage: 100 },
  { key: "c", enabled: true, rolloutPercentage: 50 },
];

// Anonymous: all-or-nothing (only fully rolled-out + enabled flags on).
{
  const map = buildFlagMap(states);
  assert.deepEqual(map, {
    a: { enabled: true },
    b: { enabled: false },
    c: { enabled: false },
  });
}

// Deterministic per-identity: same identity => same result across calls.
{
  const first = buildFlagMap(states, "user-1");
  const second = buildFlagMap(states, "user-1");
  assert.deepEqual(first, second);
  assert.equal(first.a.enabled, true);
  assert.equal(first.b.enabled, false);
}

// Empty env -> empty map.
assert.deepEqual(buildFlagMap([]), {});

console.log("eval-endpoint.test.ts OK");
}

main();
