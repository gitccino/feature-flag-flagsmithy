import { Redis } from "@upstash/redis";

// Single Upstash client. Null when env vars are absent (local/dev without Redis)
// so callers can fall back to Postgres instead of throwing.
// ponytail: env-driven singleton; swap to a pool only if multi-region needs it.
function makeClient(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export const redis = makeClient();

const CONFIG_TTL_SECONDS = 300;

const envConfigKey = (environmentId: string) => `flags:env:${environmentId}`;

export type EnvFlagState = {
  key: string;
  enabled: boolean;
  rolloutPercentage: number;
};

// Cached env config is just the flag-state rows the evaluation endpoint needs.
// All three helpers swallow Redis errors and degrade to "no cache" so the hot
// path never 500s on a Redis outage.

export async function getEnvConfig(
  environmentId: string,
): Promise<EnvFlagState[] | null> {
  if (!redis) return null;
  try {
    return await redis.get<EnvFlagState[]>(envConfigKey(environmentId));
  } catch (err) {
    console.error("getEnvConfig failed", err);
    return null;
  }
}

export async function setEnvConfig(
  environmentId: string,
  states: EnvFlagState[],
): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(envConfigKey(environmentId), states, {
      ex: CONFIG_TTL_SECONDS,
    });
  } catch (err) {
    console.error("setEnvConfig failed", err);
  }
}

export async function delEnvConfig(environmentId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.del(envConfigKey(environmentId));
  } catch (err) {
    console.error("delEnvConfig failed", err);
  }
}
