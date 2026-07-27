/**
 * Central cache-tag vocabulary so reads (cacheTag) and writes (updateTag) can't
 * drift apart. The projects list is per-owner, so the tag is keyed by user id.
 */
export const cacheTags = {
  projects: (userId: string) => `projects:user:${userId}`,
  flags: (projectId: string) => `flags:project:${projectId}`,
  apiKeys: (projectId: string) => `api-keys:project:${projectId}`,
} as const;
