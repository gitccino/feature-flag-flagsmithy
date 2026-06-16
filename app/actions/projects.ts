"use server";

import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { cacheTags } from "@/lib/cache-tags";
import { dbPool } from "@/lib/db";
import { auditLogs, environments, projects } from "@/lib/db/schema";
import { slugify, slugWithSuffix } from "@/lib/slug";
import { createProjectSchema, type CreateProjectInput } from "@/lib/zod-schema";

export type CreateProjectResult =
  | { ok: true; data: { id: string; slug: string } }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

// every project is born with exactly these 3 environments (plan invariant)
const ENVIRONMENT_SEEDS = [
  { key: "development", name: "Development" },
  { key: "staging", name: "Staging" },
  { key: "production", name: "Production" },
] as const;

const MAX_SLUG_ATTEMPTS = 5;

// Postgres unique_violation — slug already taken
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  );
}

export async function createProject(
  input: CreateProjectInput,
): Promise<CreateProjectResult> {
  // 1. re-validate on the server — never trust the client (CLAUDE.md principle 4)
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid project details.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  // 2. re-verify auth inside the action — proxy is optimistic only (principle 5)
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (!session) {
    return { ok: false, error: "You must be signed in to create a project." };
  }

  const { name } = parsed.data;
  const baseSlug = slugify(name);
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim();
  const userAgent = headersList.get("user-agent") ?? undefined;

  // 3. persist atomically: project + 3 envs + audit log.
  // Retry the whole txn on slug collision — first try the clean slug, then add
  // a random suffix. A failed txn rolls back fully, so each retry is clean.
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const slug = attempt === 0 ? baseSlug : slugWithSuffix(baseSlug);

    try {
      const data = await dbPool.transaction(async (tx) => {
        const [project] = await tx
          .insert(projects)
          .values({ name, slug, createdBy: session.user.id })
          .returning({ id: projects.id, slug: projects.slug });

        await tx.insert(environments).values(
          ENVIRONMENT_SEEDS.map((env) => ({
            projectId: project.id,
            key: env.key,
            name: env.name,
          })),
        );

        await tx.insert(auditLogs).values({
          actorId: session.user.id,
          projectId: project.id,
          entityType: "project",
          entityId: project.id,
          action: "create",
          after: { name, slug: project.slug },
          metadata: { ip, userAgent },
        });

        return { id: project.id, slug: project.slug };
      });

      // 4. read-your-writes: expire this owner's projects list so the next
      // read fetches fresh data (the list query tags itself with the same key)
      updateTag(cacheTags.projects(session.user.id));

      return { ok: true, data };
    } catch (err) {
      // slug raced/collided — regenerate with a suffix and retry
      if (isUniqueViolation(err) && attempt < MAX_SLUG_ATTEMPTS - 1) {
        continue;
      }
      console.error("createProject failed", err);
      return {
        ok: false,
        error: "Could not create project. Please try again.",
      };
    }
  }

  return { ok: false, error: "Could not create project. Please try again." };
}
