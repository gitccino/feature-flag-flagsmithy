import { desc, eq } from "drizzle-orm";
import { cacheTag } from "next/cache";

import { cacheTags } from "@/lib/cache-tags";
import { db } from "@/lib/db";
import { apiKeys, environments } from "@/lib/db/schema";

/**
 * A project's environments, each with its API keys (newest first).
 *
 * `keyHash` is deliberately absent from the column selection — the admin UI
 * only ever needs the non-secret display prefix, and the plaintext is
 * unrecoverable by design.
 *
 * Cached for the settings page only. The evaluation endpoint's own key lookup
 * must stay uncached; see the comment at that lookup in
 * `app/api/v1/flags/route.ts`.
 */
export async function listProjectApiKeys(projectId: string) {
  "use cache";
  cacheTag(cacheTags.apiKeys(projectId));

  return db.query.environments.findMany({
    where: eq(environments.projectId, projectId),
    // pgEnum sorts by declaration order: development, staging, production
    orderBy: environments.key,
    with: {
      apiKeys: {
        columns: {
          id: true,
          name: true,
          keyPrefix: true,
          createdAt: true,
          revokedAt: true,
        },
        orderBy: desc(apiKeys.createdAt),
      },
    },
  });
}

export type ProjectEnvironmentKeys = Awaited<
  ReturnType<typeof listProjectApiKeys>
>[number];

export type ProjectApiKey = ProjectEnvironmentKeys["apiKeys"][number];
