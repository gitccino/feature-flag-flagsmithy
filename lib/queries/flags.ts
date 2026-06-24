import { desc, eq } from "drizzle-orm";
import { cacheTag } from "next/cache";

import { cacheTags } from "@/lib/cache-tags";
import { db } from "@/lib/db";
import { flags } from "@/lib/db/schema";

/** All flags for a project with per-environment state, newest first. */
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
