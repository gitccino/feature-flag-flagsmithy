import { db } from "@/lib/db";
import { desc, eq } from "drizzle-orm";
import { flags } from "@/lib/db/schema";
import { cacheTag } from "next/cache";
import { cacheTags } from "../cache-tags";

/** All flags for a project with per-env state, newest first. */
export async function listProjectFlags(projectId: string) {
  "use cache";
  cacheTag(cacheTags.flags(projectId));

  return db.query.flags.findMany({
    where: eq(flags.projectId, projectId),
    orderBy: desc(flags.createdAt),
    with: {
      environmentStates: {
        with: {
          environment: true,
        },
      },
    },
  });
}

export type ProjectFlag = Awaited<ReturnType<typeof listProjectFlags>>[number];
