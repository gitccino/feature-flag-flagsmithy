import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/lib/auth";
import { buildSignInPath } from "@/lib/auth/callback-url";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

const projectIdSchema = z.uuid();

/**
 * Gate per-project pages and actions on the resolved session AND ownership.
 * Re-verify in every caller (page + action) — never lean on proxy matchers
 * alone (CLAUDE.md principle 5).
 */
export async function requireProjectAccess(projectId: string) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) {
    const pathname = headersList.get("x-pathname") ?? "/";
    redirect(buildSignInPath(pathname));
  }

  // malformed id -> 404, avoids a Postgres uuid cast error on lookup
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) {
    notFound();
  }

  const project = await db.query.projects.findFirst({
    where: eq(projects.id, parsed.data),
  });

  // missing or not owned both resolve to 404 — don't leak project existence
  if (!project || project.createdBy !== session.user.id) {
    notFound();
  }

  return { session, project };
}
