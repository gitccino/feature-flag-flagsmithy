"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { generateApiKey } from "@/lib/api-keys";
import { auth } from "@/lib/auth";
import { cacheTags } from "@/lib/cache-tags";
import { db, dbPool } from "@/lib/db";
import { apiKeys, auditLogs, environments, projects } from "@/lib/db/schema";
import {
  createApiKeySchema,
  revokeApiKeySchema,
  type CreateApiKeyInput,
  type RevokeApiKeyInput,
} from "@/lib/zod-schema";

type ActionError = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

type ActionSuccess<T> = { ok: true; data: T };

async function resolveActor() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) {
    return { ok: false as const, error: "You must be signed in." };
  }
  return {
    ok: true as const,
    session,
    ip: headersList.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: headersList.get("user-agent") ?? undefined,
  };
}

/**
 * Resolve an environment's owning project and re-check ownership.
 * Both key actions are scoped by environment, so this is the single
 * authorization seam — proxy is optimistic only (CLAUDE.md principle 5).
 * Returns null for both "missing" and "not owned" so existence never leaks.
 */
async function requireOwnedEnvironment(environmentId: string, userId: string) {
  const environment = await db.query.environments.findFirst({
    where: eq(environments.id, environmentId),
  });
  if (!environment) return null;

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, environment.projectId),
  });
  if (!project || project.createdBy !== userId) return null;

  return environment;
}

export type CreateApiKeyResult =
  // plaintext is returned exactly once — never stored, never retrievable again
  | ActionSuccess<{ id: string; keyPrefix: string; plaintext: string }>
  | ActionError;

export async function createApiKey(
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const parsed = createApiKeySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid API key details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const actor = await resolveActor();
  if (!actor.ok) return actor;

  const { environmentId, name } = parsed.data;

  const environment = await requireOwnedEnvironment(
    environmentId,
    actor.session.user.id,
  );
  if (!environment) {
    return { ok: false, error: "Environment not found." };
  }

  const { plaintext, keyPrefix, keyHash } = generateApiKey(environment.key);

  let data: { id: string };
  try {
    data = await dbPool.transaction(async (tx) => {
      const [key] = await tx
        .insert(apiKeys)
        .values({ environmentId, name, keyPrefix, keyHash })
        .returning({ id: apiKeys.id });

      await tx.insert(auditLogs).values({
        actorId: actor.session.user.id,
        projectId: environment.projectId,
        environmentId,
        entityType: "api_key",
        entityId: key.id,
        action: "create",
        after: { name, keyPrefix }, // no secret in the diff
        metadata: { ip: actor.ip, userAgent: actor.userAgent },
      });

      return { id: key.id };
    });
  } catch (err) {
    // Never let this reject across the client boundary (principle 6). The
    // plaintext dies with the rolled-back txn, so there is nothing to leak.
    console.error("createApiKey failed", err);
    return { ok: false, error: "Could not create API key. Please try again." };
  }

  updateTag(cacheTags.apiKeys(environment.projectId));

  return { ok: true, data: { id: data.id, keyPrefix, plaintext } };
}

export type RevokeApiKeyResult = ActionSuccess<{ id: string }> | ActionError;

/**
 * Soft revoke: stamp revokedAt, never delete the row. The audit trail keeps
 * pointing at a real key and an id is never recycled. Takes effect on the very
 * next evaluation request because that lookup reads Postgres uncached.
 */
export async function revokeApiKey(
  input: RevokeApiKeyInput,
): Promise<RevokeApiKeyResult> {
  const parsed = revokeApiKeySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid API key.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const actor = await resolveActor();
  if (!actor.ok) return actor;

  const { apiKeyId } = parsed.data;

  const existing = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.id, apiKeyId),
    columns: {
      id: true,
      name: true,
      keyPrefix: true,
      environmentId: true,
      revokedAt: true,
    },
  });
  if (!existing) {
    return { ok: false, error: "API key not found." };
  }

  const environment = await requireOwnedEnvironment(
    existing.environmentId,
    actor.session.user.id,
  );
  if (!environment) {
    return { ok: false, error: "API key not found." };
  }

  if (existing.revokedAt) {
    return { ok: false, error: "This key is already revoked." };
  }

  const revokedAt = new Date();

  try {
    await dbPool.transaction(async (tx) => {
      await tx
        .update(apiKeys)
        .set({ revokedAt })
        .where(eq(apiKeys.id, apiKeyId));

      await tx.insert(auditLogs).values({
        actorId: actor.session.user.id,
        projectId: environment.projectId,
        environmentId: existing.environmentId,
        entityType: "api_key",
        entityId: apiKeyId,
        action: "revoke",
        // prefix + name only — no secret material in the diff
        before: { name: existing.name, keyPrefix: existing.keyPrefix },
        after: {
          name: existing.name,
          keyPrefix: existing.keyPrefix,
          revokedAt: revokedAt.toISOString(),
        },
        metadata: { ip: actor.ip, userAgent: actor.userAgent },
      });
    });
  } catch (err) {
    // Never reject across the client boundary (principle 6). The txn rolled
    // back, so the key is still live and the caller must be told to retry —
    // silently reporting success on a failed revoke is the dangerous outcome.
    console.error("revokeApiKey failed", err);
    return { ok: false, error: "Could not revoke the key. Please try again." };
  }

  updateTag(cacheTags.apiKeys(environment.projectId));

  return { ok: true, data: { id: apiKeyId } };
}
