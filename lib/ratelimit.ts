import { Ratelimit } from "@upstash/ratelimit";

import { redis } from "@/lib/redis";

// Sliding window ~100 requests / 10s per key. Shares the lib/redis.ts client.
// Null when Redis is absent so the evaluation endpoint fails open (no limiting).
// ponytail: fixed window size; make it env-configurable only if a tenant needs a custom cap.
const limiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(100, "10 s"),
      prefix: "ratelimit:eval",
    })
  : null;

export type RateLimitResult = {
  allowed: boolean;
  // Seconds until the window resets; 0 when allowed or unknown.
  retryAfter: number;
};

// Enforce the per-key limit. Fail open on any infra error so a Redis outage
// never blocks evaluation; a genuine over-limit is still enforced.
export async function checkRateLimit(keyHash: string): Promise<RateLimitResult> {
  if (!limiter) return { allowed: true, retryAfter: 0 };
  try {
    const { success, reset } = await limiter.limit(keyHash);
    if (success) return { allowed: true, retryAfter: 0 };
    const retryAfter = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
    return { allowed: false, retryAfter };
  } catch (err) {
    console.error("checkRateLimit failed, failing open", err);
    return { allowed: true, retryAfter: 0 };
  }
}
