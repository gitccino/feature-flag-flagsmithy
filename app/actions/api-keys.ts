"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";

import { generateApiKey } from "@/lib/api-keys";
import { auth } from "@/lib/auth";
import { db, dbPool } from "@/lib/db";
import { apiKeys, auditLogs, environments, projects } from "@/lib/db/schema";
import { createApiKeySchema, type CreateApiKeyInput } from "@/lib/zod-schema";

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

  // resolve the owning project from the environment, then re-check ownership
  const environment = await db.query.environments.findFirst({
    where: eq(environments.id, environmentId),
  });
  if (!environment) {
    return { ok: false, error: "Environment not found." };
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, environment.projectId),
  });
  if (!project || project.createdBy !== actor.session.user.id) {
    return { ok: false, error: "Environment not found." };
  }

  const { plaintext, keyPrefix, keyHash } = generateApiKey(environment.key);

  const data = await dbPool.transaction(async (tx) => {
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

  return { ok: true, data: { id: data.id, keyPrefix, plaintext } };
}
