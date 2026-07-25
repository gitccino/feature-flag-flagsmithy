import assert from "node:assert/strict";

// Run: DATABASE_URL='postgresql://u:p@localhost/db' bunx tsx scripts/eval-endpoint.test.ts
// The dummy URL only lets lib/db construct at import time; no connection is made.
import { buildFlagMap, parseBody, POST } from "@/app/api/v1/flags/route";

async function main() {
  // Auth reject: no Authorization header -> 401 (returns before any DB access).
  {
    const res = await POST(
      new Request("http://x/api/v1/flags", { method: "POST" }),
    );
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

  // Body validation. parseBody is the same seam POST uses, so these cover the
  // endpoint's 400 paths without needing a live DB for the key lookup that
  // precedes them.
  const req = (body?: string) =>
    new Request("http://x/api/v1/flags", { method: "POST", body });

  // No body and an empty body are both allowed -> anonymous evaluation.
  for (const body of [undefined, ""]) {
    const result = await parseBody(req(body));
    assert.equal(result.ok, true, `body ${JSON.stringify(body)} should parse`);
    assert.equal(result.ok && result.identity, undefined);
  }

  // A valid identity comes back through.
  {
    const result = await parseBody(req(JSON.stringify({ identity: "u-1" })));
    assert.equal(result.ok && result.identity, "u-1");
  }

  // Rejections: each must be a 400, never a 500 or a silent accept.
  const badBodies: [string, string][] = [
    [
      "identity over the 200-char cap",
      JSON.stringify({ identity: "x".repeat(201) }),
    ],
    ["empty-string identity", JSON.stringify({ identity: "" })],
    ["malformed JSON", "{not json"],
    ["wrong-typed identity (number)", JSON.stringify({ identity: 123 })],
  ];

  for (const [label, body] of badBodies) {
    const result = await parseBody(req(body));
    assert.equal(result.ok, false, `${label} must be rejected`);
    if (result.ok) continue;
    assert.equal(result.response.status, 400, `${label} must be 400`);
    assert.deepEqual(await result.response.json(), { error: "invalid body" });
  }

  // A 200-char identity sits exactly on the cap and is still accepted.
  {
    const result = await parseBody(
      req(JSON.stringify({ identity: "x".repeat(200) })),
    );
    assert.equal(result.ok, true, "200 chars is on the cap, not over it");
  }

  // Regression: the 401 body must be readable on every rejection, not just the
  // first in the process. A shared module-level Response can only be read once.
  {
    const unauthorized = () => POST(req());
    assert.deepEqual(await (await unauthorized()).json(), {
      error: "invalid api key",
    });
    assert.deepEqual(await (await unauthorized()).json(), {
      error: "invalid api key",
    });
  }

  console.log("eval-endpoint.test.ts OK");
}

main();
