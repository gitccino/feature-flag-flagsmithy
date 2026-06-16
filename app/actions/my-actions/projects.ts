import z from "zod";
import { CreateProjectInput, createProjectSchema } from "@/lib/zod-schema";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { slugify, slugWithSuffix } from "@/lib/slug";
import { dbPool } from "@/lib/db";
import { auditLogs, environments, projects } from "@/lib/db/schema";
import { updateTag } from "next/cache";
import { cacheTags } from "@/lib/cache-tags";

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

export type CreateProjectResult =
  | {
      ok: true;
      data: { id: string; slug: string };
    }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
    };

const ENVIRONMENT_SEEDS = [
  { key: "development", name: "Development" },
  { key: "staging", name: "Staging" },
  { key: "production", name: "Production" },
] as const;

export async function createProject(input: CreateProjectInput) {
  // re-validate on the server — never trust the client
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid project details",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }

  // always re-verify auth inside the action
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });
  if (!session) {
    return { ok: false, error: "You must be signed in to create a project." };
  }

  const { name } = parsed.data;
  const baseSlug = slugify(name);
  const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim(); // X-Forwarded-For: client, proxy1, proxy2
  const userAgent = headersList.get("user-agent") ?? undefined;

  // persist atomically: project + 3 envs + audit log
  // Retry the whole txn on slug collision — first try the clean slug, then add a random suffix
  // Pre-checkable? pre-check can only tell you "Slot looked free a moment ago"
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

      // expire this owner's projects list
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
}
