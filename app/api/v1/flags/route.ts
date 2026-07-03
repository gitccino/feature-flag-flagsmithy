import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { hashApiKey, parseBearer } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { apiKeys, flagEnvironmentStates, flags } from "@/lib/db/schema";
import { resolveEnabled } from "@/lib/evaluation/bucketing";
import { checkIpRateLimit, checkRateLimit } from "@/lib/ratelimit";
import { getEnvConfig, setEnvConfig } from "@/lib/redis";
import { evaluateFlagsSchema } from "@/lib/zod-schema";

type FlagStateRow = {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
};

// Shape DB rows into the map-keyed response { "<key>": { enabled } }.
// Exported for unit testing (the rest of the handler needs a live DB).
export function buildFlagMap(
  states: FlagStateRow[],
  identity?: string,
): Record<string, { enabled: boolean }> {
  const result: Record<string, { enabled: boolean }> = {};
  for (const state of states) {
    result[state.key] = { enabled: resolveEnabled(state, identity) };
  }
  return result;
}

const INVALID_KEY = NextResponse.json(
  { error: "invalid api key" },
  { status: 401 },
);

function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: "rate limit exceeded" },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(request: Request) {
  // Per-IP guard runs before auth so spammed bad keys can't hammer the DB lookup.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const ipRate = await checkIpRateLimit(ip);
  if (!ipRate.allowed) return tooManyRequests(ipRate.retryAfter);

  const token = parseBearer(request.headers.get("authorization"));
  // Reject requests that do not include a bearer token.
  if (!token) return INVALID_KEY;

  const keyHash = hashApiKey(token);

  const [key] = await db
    .select({
      id: apiKeys.id,
      environmentId: apiKeys.environmentId,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, keyHash))
    .limit(1);

  if (!key || key.revokedAt) return INVALID_KEY;

  const rate = await checkRateLimit(keyHash);
  if (!rate.allowed) return tooManyRequests(rate.retryAfter);

  // Body is optional; tolerate an empty/no body but reject malformed JSON shapes.
  let raw: unknown = {};
  try {
    const text = await request.text();
    if (text) raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const parsed = evaluateFlagsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const identity = parsed.data.identity;

  // Cache hot path: Redis first, miss/outage falls back to Postgres.
  let states = await getEnvConfig(key.environmentId);
  if (!states) {
    states = await db
      .select({
        key: flags.key,
        enabled: flagEnvironmentStates.enabled,
        rolloutPercentage: flagEnvironmentStates.rolloutPercentage,
      })
      .from(flagEnvironmentStates)
      .innerJoin(flags, eq(flagEnvironmentStates.flagId, flags.id))
      .where(eq(flagEnvironmentStates.environmentId, key.environmentId));
    await setEnvConfig(key.environmentId, states);
  }

  return NextResponse.json({ flags: buildFlagMap(states, identity) });
}
