import assert from "node:assert";

// No UPSTASH env vars here -> redis is null -> limiter null -> fail open.
import { checkRateLimit } from "@/lib/ratelimit";

async function main() {
  const r = await checkRateLimit("any-key-hash");
  assert.equal(r.allowed, true, "no-Redis must fail open (allowed)");
  assert.equal(r.retryAfter, 0, "fail-open retryAfter is 0");
  console.log("ratelimit fail-open ok");
}

main();
