"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { cacheTags } from "@/lib/cache-tags";
import { db, dbPool } from "@/lib/db";
import {
  auditLogs,
  environments,
  flagEnvironmentStates,
  flags,
  projects,
} from "@/lib/db/schema";
import { delEnvConfig } from "@/lib/redis";
import {
  createFlagSchema,
  deleteFlagSchema,
  setFlagEnvironmentStateSchema,
  updateFlagSchema,
  type CreateFlagInput,
  type DeleteFlagInput,
  type SetFlagEnvironmentStateInput,
  type UpdateFlagInput,
} from "@/lib/zod-schema";

type ActionError = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

type ActionSuccess<T> = { ok: true; data: T };

// Postgres unique_violation — flag key already taken in this project
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (current && typeof current === "object") {
    if ("code" in current && (current as { code?: string }).code === "23505") {
      return true;
    }
    current =
      "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return false;
}

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

async function requireOwnedProject(projectId: string, userId: string) {
  const project = await db.query.projects.findFirst({
    where: eq(projects.id, projectId),
  });
  if (!project || project.createdBy !== userId) {
    return null;
  }
  return project;
}

export type CreateFlagResult =
  | ActionSuccess<{ id: string; key: string }>
  | ActionError;

export async function createFlag(
  input: CreateFlagInput,
): Promise<CreateFlagResult> {
  const parsed = createFlagSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid flag details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const actor = await resolveActor();
  if (!actor.ok) return actor;

  const { projectId, name, key, description } = parsed.data;
  const project = await requireOwnedProject(projectId, actor.session.user.id);
  if (!project) {
    return { ok: false, error: "Project not found." };
  }

  try {
    const data = await dbPool.transaction(async (tx) => {
      const [flag] = await tx
        .insert(flags)
        .values({ projectId, name, key, description: description || null })
        .returning({ id: flags.id, key: flags.key });

      const projectEnvironments = await tx.query.environments.findMany({
        where: eq(environments.projectId, projectId),
      });

      await tx.insert(flagEnvironmentStates).values(
        projectEnvironments.map((env) => ({
          flagId: flag.id,
          environmentId: env.id,
          enabled: false,
          rolloutPercentage: 100,
        })),
      );

      await tx.insert(auditLogs).values({
        actorId: actor.session.user.id,
        projectId,
        entityType: "flag",
        entityId: flag.id,
        action: "create",
        after: { name, key },
        metadata: { ip: actor.ip, userAgent: actor.userAgent },
      });

      return {
        id: flag.id,
        key: flag.key,
        envIds: projectEnvironments.map((env) => env.id),
      };
    });

    updateTag(cacheTags.flags(projectId));
    // New flag adds a state row to every env — bust all of them.
    await Promise.all(data.envIds.map(delEnvConfig));
    return { ok: true, data: { id: data.id, key: data.key } };
  } catch (err) {
    if (isUniqueViolation(err)) {
      return {
        ok: false,
        error: "A flag with this key already exists in this project.",
        fieldErrors: { key: ["A flag with this key already exists."] },
      };
    }
    console.error("createFlag failed", err);
    return { ok: false, error: "Could not create flag. Please try again." };
  }
}

export type UpdateFlagResult = ActionSuccess<{ id: string }> | ActionError;

export async function updateFlag(
  input: UpdateFlagInput,
): Promise<UpdateFlagResult> {
  const parsed = updateFlagSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid flag details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const actor = await resolveActor();
  if (!actor.ok) return actor;

  const { flagId, name, description } = parsed.data;
  const existing = await db.query.flags.findFirst({
    where: eq(flags.id, flagId),
  });
  if (!existing) {
    return { ok: false, error: "Flag not found." };
  }

  const project = await requireOwnedProject(
    existing.projectId,
    actor.session.user.id,
  );
  if (!project) {
    return { ok: false, error: "Project not found." };
  }

  const data = await dbPool.transaction(async (tx) => {
    const [updated] = await tx
      .update(flags)
      .set({ name, description: description || null })
      .where(eq(flags.id, flagId))
      .returning({ id: flags.id });

    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      projectId: existing.projectId,
      entityType: "flag",
      entityId: flagId,
      action: "update",
      before: { name: existing.name, description: existing.description },
      after: { name, description: description || null },
      metadata: { ip: actor.ip, userAgent: actor.userAgent },
    });

    return { id: updated.id };
  });

  updateTag(cacheTags.flags(existing.projectId));
  return { ok: true, data };
}

export type DeleteFlagResult = ActionSuccess<{ id: string }> | ActionError;

export async function deleteFlag(
  input: DeleteFlagInput,
): Promise<DeleteFlagResult> {
  const parsed = deleteFlagSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid flag id.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const actor = await resolveActor();
  if (!actor.ok) return actor;

  const { flagId } = parsed.data;
  const existing = await db.query.flags.findFirst({
    where: eq(flags.id, flagId),
  });
  if (!existing) {
    return { ok: false, error: "Flag not found." };
  }

  const project = await requireOwnedProject(
    existing.projectId,
    actor.session.user.id,
  );
  if (!project) {
    return { ok: false, error: "Project not found." };
  }

  const projectEnvironments = await db.query.environments.findMany({
    where: eq(environments.projectId, existing.projectId),
  });

  await dbPool.transaction(async (tx) => {
    await tx.delete(flags).where(eq(flags.id, flagId));

    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      projectId: existing.projectId,
      entityType: "flag",
      entityId: flagId,
      action: "delete",
      before: {
        name: existing.name,
        key: existing.key,
        description: existing.description,
      },
      metadata: { ip: actor.ip, userAgent: actor.userAgent },
    });
  });

  updateTag(cacheTags.flags(existing.projectId));
  // Deleting a flag removes its state from every env — bust all of them.
  await Promise.all(projectEnvironments.map((env) => delEnvConfig(env.id)));
  return { ok: true, data: { id: flagId } };
}

export type SetFlagEnvironmentStateResult =
  | ActionSuccess<{ id: string }>
  | ActionError;

export async function setFlagEnvironmentState(
  input: SetFlagEnvironmentStateInput,
): Promise<SetFlagEnvironmentStateResult> {
  const parsed = setFlagEnvironmentStateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid flag environment state.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  const actor = await resolveActor();
  if (!actor.ok) return actor;

  const { flagEnvironmentStateId, enabled, rolloutPercentage } = parsed.data;

  const existing = await db.query.flagEnvironmentStates.findFirst({
    where: eq(flagEnvironmentStates.id, flagEnvironmentStateId),
    with: { flag: true },
  });
  if (!existing) {
    return { ok: false, error: "Flag environment state not found." };
  }

  const project = await requireOwnedProject(
    existing.flag.projectId,
    actor.session.user.id,
  );
  if (!project) {
    return { ok: false, error: "Project not found." };
  }

  const data = await dbPool.transaction(async (tx) => {
    await tx
      .update(flagEnvironmentStates)
      .set({ enabled, rolloutPercentage })
      .where(eq(flagEnvironmentStates.id, flagEnvironmentStateId));

    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      projectId: existing.flag.projectId,
      environmentId: existing.environmentId,
      entityType: "flag_environment_state",
      entityId: flagEnvironmentStateId,
      action: "update",
      before: {
        enabled: existing.enabled,
        rolloutPercentage: existing.rolloutPercentage,
      },
      after: { enabled, rolloutPercentage },
      metadata: { ip: actor.ip, userAgent: actor.userAgent },
    });

    return { id: flagEnvironmentStateId };
  });

  updateTag(cacheTags.flags(existing.flag.projectId));
  await delEnvConfig(existing.environmentId);
  return { ok: true, data };
}
