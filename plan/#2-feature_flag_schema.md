---
name: Feature Flag Schema
overview: "Drizzle schema for core domain: projects, environments (fixed 3 per project), flags with per-environment state, reusable segments, and prioritized per-environment targeting rules with percentage rollout."
todos:
  - id: schema-tables
    content: Write domain tables in lib/db/flag-schema.ts (projects, environments, flags, flag_environment_states, segments, flag_targeting_rules) with enums, uniques, FK indexes
    status: pending
  - id: relations
    content: Add Drizzle relations() for all domain tables
    status: pending
  - id: zod-rules
    content: Zod schema for segment rules jsonb + type the column via $type<z.infer>
    status: pending
  - id: export
    content: Re-export from lib/db/schema.ts
    status: pending
  - id: migrate
    content: Generate + run Drizzle migration
    status: pending
isProject: false
---

# Feature Flag Core Schema

## Decisions (agreed)

- Boolean flags only (no multivariate in v1)
- Targeting rules scoped per environment (flag can target different segments in staging vs production)
- Rollout percentage in two places: default on flag-env state + optional override per targeting rule
- Single project owner (`createdBy` → users), members table later
- Segment rules stored as jsonb, Zod-validated at boundary
- uuid `defaultRandom()` ids for domain tables; segment referenced by rules uses `onDelete: restrict`

## Schema layout

New file [lib/db/flag-schema.ts](lib/db/flag-schema.ts) (or split per feature), re-exported from [lib/db/schema.ts](lib/db/schema.ts) alongside the existing `@/lib/auth-schema` export.

### Tables

- `projects`: id uuid, name, slug unique, createdBy → user.id, timestamps
- `environments`: id, projectId (cascade), key pg enum `development|staging|production`, name; unique (projectId, key)
- `flags`: id, projectId (cascade), key slug unique per project, name, description, timestamps
- `flag_environment_states`: id, flagId (cascade), environmentId (cascade), enabled bool default false, rolloutPercentage int default 100; unique (flagId, environmentId)
- `segments`: id, projectId (cascade), name unique per project, description, rules jsonb, timestamps
- `flag_targeting_rules`: id, flagEnvironmentStateId (cascade), segmentId (restrict), priority int, servedValue bool, rolloutPercentage int nullable; unique (stateId, priority) and (stateId, segmentId)

### Supporting pieces

- Drizzle `relations()` for all tables; indexes on every FK column
- Zod schema for segment `rules` jsonb in [lib/zod-schema.ts](lib/zod-schema.ts) (or colocated): `{ match: "all"|"any", conditions: [{ property, operator: eq|neq|contains|in|gt|gte|lt|lte|regex, value }] }`; jsonb column typed via `.$type<SegmentRules>()` inferred from Zod
- Invariants enforced in app layer (transactions, not schema): 3 environments created with project; 3 env states created with flag

### Evaluation semantics (documented, implemented later)

Rules priority asc → first matching segment, bucket check `hash(identifier + flagKey) % 100` vs rule rollout → serve servedValue; no match → state.enabled + default rollout.

## Migration

`bunx drizzle-kit generate` then `bunx drizzle-kit migrate` (per drizzle.config.ts workflow).

## Explicitly out of scope

API keys, audit logs, project members — added with their features.
