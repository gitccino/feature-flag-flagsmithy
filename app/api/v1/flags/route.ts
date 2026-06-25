import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { hashApiKey, parseBearer } from "@/lib/api-keys";
import { db } from "@/lib/db";
import { apiKeys, flagEnvironmentStates, flags } from "@/lib/db/schema";
import { resolveEnabled } from "@/lib/evaluation/bucketing";

const bodySchema = z.object({ identity: z.string().optional() });

type FlagStateRow = { key: string; enabled: boolean; rolloutPercentage: number };

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

export async function POST(request: Request) {
  const token = parseBearer(request.headers.get("authorization"));
  if (!token) return INVALID_KEY;

  const [key] = await db
    .select({
      id: apiKeys.id,
      environmentId: apiKeys.environmentId,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(token)))
    .limit(1);

  if (!key || key.revokedAt) return INVALID_KEY;

  // Body is optional; tolerate an empty/no body but reject malformed JSON shapes.
  let raw: unknown = {};
  try {
    const text = await request.text();
    if (text) raw = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }
  const identity = parsed.data.identity;

  const states = await db
    .select({
      key: flags.key,
      enabled: flagEnvironmentStates.enabled,
      rolloutPercentage: flagEnvironmentStates.rolloutPercentage,
    })
    .from(flagEnvironmentStates)
    .innerJoin(flags, eq(flagEnvironmentStates.flagId, flags.id))
    .where(eq(flagEnvironmentStates.environmentId, key.environmentId));

  return NextResponse.json({ flags: buildFlagMap(states, identity) });
}
