import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { users } from "@/lib/auth-schema";
import type { SegmentRules } from "@/lib/zod-schema";

// request context captured at mutation time (not user-supplied)
export type AuditLogMetadata = {
  ip?: string;
  userAgent?: string;
};

// cascade — parent delete -> children delete
// restrict — parent delete blocked if child exists

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }), // can't delete user if they still own projects
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("projects_created_by_idx").on(table.createdBy),
    unique("projects_created_by_slug_unique").on(table.createdBy, table.slug),
  ],
);

export const environmentKeyEnum = pgEnum("environment_key", [
  "development",
  "staging",
  "production",
]);

export const environments = pgTable(
  "environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }), // Delete project -> deletes all environments related
    key: environmentKeyEnum("key").notNull(),
    name: text("name").notNull(),
  },
  (table) => [
    index("environments_project_id_idx").on(table.projectId),
    unique("environments_project_id_key_unique").on(table.projectId, table.key), // Same project can't have multiple envs with same key
  ],
);

export const flags = pgTable(
  "flags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }), // Delete project -> deletes all flags related
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("flags_project_id_idx").on(table.projectId), // query flags by project id
    unique("flags_project_id_key_unique").on(table.projectId, table.key), // within one project, flag key must be unique
  ],
);

/**
 * flag_environment_states — flag's default state in one environment (3 ENV -> 3 ROWS)
 */
export const flagEnvironmentStates = pgTable(
  "flag_environment_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flagId: uuid("flag_id")
      .notNull()
      .references(() => flags.id, { onDelete: "cascade" }),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    rolloutPercentage: integer("rollout_percentage").default(100).notNull(),
  },
  (table) => [
    index("flag_environment_states_flag_id_idx").on(table.flagId), // query state by flag id
    index("flag_environment_states_environment_id_idx").on(table.environmentId), // query state by env id
    unique("flag_environment_states_flag_id_environment_id_unique").on(
      table.flagId,
      table.environmentId,
    ), // scoped uniqueness — can't have 2 states rows for same flag + same env
  ],
);

export const segments = pgTable(
  "segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    rules: jsonb("rules").$type<SegmentRules>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("segments_project_id_idx").on(table.projectId), // query segments by project id
    unique("segments_project_id_name_unique").on(table.projectId, table.name), // can't have duplicate segment name in the same project
  ],
);

/**
 * flag_targeting_rules — per-environment segment overrides (priority order, first match wins)
 */
export const flagTargetingRules = pgTable(
  "flag_targeting_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    flagEnvironmentStateId: uuid("flag_environment_state_id")
      .notNull()
      .references(() => flagEnvironmentStates.id, { onDelete: "cascade" }),
    segmentId: uuid("segment_id")
      .notNull()
      .references(() => segments.id, { onDelete: "restrict" }),
    // 'restrict' — can't delete segment while rule still points at it
    priority: integer("priority").notNull(),
    servedValue: boolean("served_value").notNull(), // true or false when rule matches
    rolloutPercentage: integer("rollout_percentage"), // optional override; null = use state default
  },
  (table) => [
    index("flag_targeting_rules_flag_environment_state_id_idx").on(
      table.flagEnvironmentStateId,
    ),
    index("flag_targeting_rules_segment_id_idx").on(table.segmentId),
    unique("flag_targeting_rules_state_id_priority_unique").on(
      table.flagEnvironmentStateId,
      table.priority,
    ), // no two rules with the same priority on same env-state
    unique("flag_targeting_rules_state_id_segment_id_unique").on(
      table.flagEnvironmentStateId,
      table.segmentId,
    ), // same segment can't appear twice on same env-state
  ],
);

/**
 * api_keys — per-environment keys authenticating public evaluation requests.
 * Only keyPrefix + keyHash are stored; the plaintext is shown once at creation.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    environmentId: uuid("environment_id")
      .notNull()
      .references(() => environments.id, { onDelete: "cascade" }), // drop keys when env gone
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(), // non-secret display prefix
    keyHash: text("key_hash").notNull(), // sha256 of plaintext
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => [
    unique("api_keys_key_hash_unique").on(table.keyHash), // lookup + dedupe by hash
    index("api_keys_environment_id_idx").on(table.environmentId),
  ],
);

/**
 * audit_logs — immutable trail of admin mutations (actor, scope, before/after diff)
 */
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }), // keep trail even if user lingers
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }), // drop logs when project gone
    environmentId: uuid("environment_id"), // nullable, no FK — survives env deletion
    entityType: text("entity_type").notNull(), // e.g. "flag", "segment", "project"
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(), // e.g. "create", "update", "delete"
    before: jsonb("before"), // null on create
    after: jsonb("after"), // null on delete
    metadata: jsonb("metadata").$type<AuditLogMetadata>(), // ip / userAgent
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_logs_project_id_idx").on(table.projectId), // query trail by project
    index("audit_logs_actor_id_idx").on(table.actorId), // query trail by actor
  ],
);

// ———
// Not about DB. Drizzle ORM metadata only. Tells Drizzle how tables connect so relational queries work
export const projectRelations = relations(projects, ({ one, many }) => ({
  creator: one(users, {
    fields: [projects.createdBy],
    references: [users.id],
  }),
  environments: many(environments),
  flags: many(flags),
  segments: many(segments),
  auditLogs: many(auditLogs),
}));

export const auditLogRelations = relations(auditLogs, ({ one }) => ({
  actor: one(users, {
    fields: [auditLogs.actorId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [auditLogs.projectId],
    references: [projects.id],
  }),
}));

export const environmentRelations = relations(
  environments,
  ({ one, many }) => ({
    project: one(projects, {
      fields: [environments.projectId],
      references: [projects.id],
    }),
    flagEnvironmentStates: many(flagEnvironmentStates),
    apiKeys: many(apiKeys),
  }),
);

export const apiKeyRelations = relations(apiKeys, ({ one }) => ({
  environment: one(environments, {
    fields: [apiKeys.environmentId],
    references: [environments.id],
  }),
}));

export const flagRelations = relations(flags, ({ one, many }) => ({
  project: one(projects, {
    fields: [flags.projectId],
    references: [projects.id],
  }),
  environmentStates: many(flagEnvironmentStates),
}));

export const flagEnvironmentStateRelations = relations(
  flagEnvironmentStates,
  ({ one, many }) => ({
    // FK = flagId
    flag: one(flags, {
      fields: [flagEnvironmentStates.flagId],
      references: [flags.id],
    }),
    // FK = environmentId
    environment: one(environments, {
      fields: [flagEnvironmentStates.environmentId],
      references: [environments.id],
    }),
    targetingRules: many(flagTargetingRules),
  }),
);

export const segmentRelations = relations(segments, ({ one, many }) => ({
  project: one(projects, {
    fields: [segments.projectId],
    references: [projects.id],
  }),
  targetingRules: many(flagTargetingRules),
}));

export const flagTargetingRuleRelations = relations(
  flagTargetingRules,
  ({ one }) => ({
    flagEnvironmentState: one(flagEnvironmentStates, {
      fields: [flagTargetingRules.flagEnvironmentStateId],
      references: [flagEnvironmentStates.id],
    }),
    segment: one(segments, {
      fields: [flagTargetingRules.segmentId],
      references: [segments.id],
    }),
  }),
);
