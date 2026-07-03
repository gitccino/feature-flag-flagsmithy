import { createHash, randomBytes } from "node:crypto";

/**
 * Environment API keys for the public evaluation API.
 * Format: fsk_<envKey>_<32-byte base64url>. Only keyPrefix + keyHash are
 * persisted (see lib/db/flag-schema.ts); the plaintext is shown once.
 */

export type GeneratedApiKey = {
  plaintext: string;
  keyPrefix: string;
  keyHash: string;
};

/** sha256 hex — the unique lookup column for evaluation auth. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

export function generateApiKey(envKey: string): GeneratedApiKey {
  const token = randomBytes(32).toString("base64url");
  const plaintext = `fsk_${envKey}_${token}`;
  // non-secret display prefix: scheme + env + first 8 chars of the token
  const keyPrefix = `fsk_${envKey}_${token.slice(0, 8)}`;
  return { plaintext, keyPrefix, keyHash: hashApiKey(plaintext) };
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header. */
export function parseBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  return token && token.length > 0 ? token : null;
}
