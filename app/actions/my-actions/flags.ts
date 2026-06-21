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
import {
  CreateFlagInput,
  createFlagSchema,
  DeleteFlagInput,
  deleteFlagSchema,
  SetFlagEnvironmentStateInput,
  setFlagEnvironmentStateSchema,
  UpdateFlagInput,
  updateFlagSchema,
} from "@/lib/zod-schema";
import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import z from "zod";

type ActionSuccess<T> = { ok: true; data: T };
type ActionError = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

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
      error: "Invalid flag details",
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
    // insert new flag -> get all envs -> insert state -> insert auditLogs
    const data = await dbPool.transaction(async (tx) => {
      const [flag] = await tx
        .insert(flags)
        .values({
          projectId,
          name,
          key,
          description,
        })
        .returning();

      const projectEnvironments = await db.query.environments.findMany({
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

      return { id: flag.id, key: flag.key };
    });

    updateTag(cacheTags.flags(projectId));
    return { ok: true, data };
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

export type updateFlagResult = ActionSuccess<{ id: string }> | ActionError;

export async function updateFlag(
  input: UpdateFlagInput,
): Promise<updateFlagResult> {
  // parsing
  const parsed = updateFlagSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid flag details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  // resolve actor
  const actor = await resolveActor();
  if (!actor.ok) return actor;

  // check existing flag
  const { flagId, name, description } = parsed.data;
  const existing = await db.query.flags.findFirst({
    where: eq(flags.id, flagId),
  });
  if (!existing) {
    return { ok: false, error: "Flag not found." };
  }

  // verify project ownership
  const project = await requireOwnedProject(
    existing.projectId,
    actor.session.user.id,
  );
  if (!project) {
    return { ok: false, error: "Project not found." };
  }

  // transaction
  const data = await dbPool.transaction(async (tx) => {
    const [updated] = await tx
      .update(flags)
      .set({
        name,
        description: description || null,
      })
      .where(eq(flags.id, flagId))
      .returning({ id: flags.id });

    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      projectId: project.id,
      entityType: "flag",
      entityId: flagId,
      action: "update",
      before: { name: existing.name, description: existing.description },
      after: { name, description: description || null },
      metadata: { ip: actor.ip, userAgent: actor.userAgent },
    });

    return { id: updated.id };
  });

  // invalidate cache
  updateTag(cacheTags.flags(existing.projectId));
  return { ok: true, data };
}

export type deleteFlagResult = ActionSuccess<{ id: string }> | ActionError;

export async function deleteFlag(
  input: DeleteFlagInput,
): Promise<deleteFlagResult> {
  // Zod validation (parsing)
  const parsed = deleteFlagSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalide flag id.",
    };
  }

  // Resolve actor
  const actor = await resolveActor();
  if (!actor.ok) return actor;

  // Check existing
  const { flagId } = parsed.data;
  const existing = await db.query.flags.findFirst({
    where: eq(flags.id, flagId),
  });
  if (!existing) {
    return { ok: false, error: "Flag not found." };
  }

  // verify project ownership
  const project = await requireOwnedProject(
    existing.projectId,
    actor.session.user.id,
  );
  if (!project) {
    return { ok: false, error: "Project not found." };
  }

  // transaction
  await dbPool.transaction(async (tx) => {
    // delete
    await tx.delete(flags).where(eq(flags.id, flagId));

    // insert auditLogs
    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      projectId: existing.projectId,
      entityId: flagId,
      entityType: "flag",
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
  return { ok: true, data: { id: flagId } };
}

export type setFlagEnvironmentStateResult =
  | ActionSuccess<{ id: string }>
  | ActionError;

export async function setFlagEnvironmentStates(
  input: SetFlagEnvironmentStateInput,
) {
  // Zod parsing
  const parsed = setFlagEnvironmentStateSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid flag environment state.",
    };
  }

  // resolve actor
  const actor = await resolveActor();
  if (!actor.ok) return actor;
  // check existing
  const { flagEnvironmentStateId, enabled, rolloutPercentage } = parsed.data;
  const existing = await db.query.flagEnvironmentStates.findFirst({
    where: eq(flagEnvironmentStates.id, flagEnvironmentStateId),
    with: { flag: true },
  });
  if (!existing)
    return {
      ok: false,
      error: "Flag environment state not found.",
    };

  // verify ownership
  const project = await requireOwnedProject(
    existing.flag.projectId,
    actor.session?.user.id,
  );
  if (!project)
    return {
      ok: false,
      error: "Project not found.",
    };

  // transaction
  const data = await dbPool.transaction(async (tx) => {
    // update state
    await tx
      .update(flagEnvironmentStates)
      .set({ enabled, rolloutPercentage })
      .where(eq(flagEnvironmentStates.id, flagEnvironmentStateId));

    // record auditLogs
    await tx.insert(auditLogs).values({
      actorId: actor.session.user.id,
      projectId: existing.flag.projectId,
      environmentId: existing.environmentId,
      entityId: flagEnvironmentStateId,
      entityType: "flag_environment_state",
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

  // invalidation
  updateTag(cacheTags.flags(existing.flag.projectId));
  return { ok: true, data };
}
