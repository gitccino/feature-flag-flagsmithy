import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";

/** All projects owned by a user, newest first. Owner-scoped — never returns another user's projects. */
export async function listOwnedProjects(userId: string) {
  return db.query.projects.findMany({
    where: eq(projects.createdBy, userId),
    orderBy: desc(projects.createdAt),
  });
}

export type OwnedProject = Awaited<
  ReturnType<typeof listOwnedProjects>
>[number];
