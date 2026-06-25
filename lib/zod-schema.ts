import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Please provide a valid email address.").min(1).trim(),
  password: z
    .string()
    .min(1, "Password is required.")
    .min(8, "Password must be at least 8 characters long."),
});

export const signUpSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(50, "Name must not exceed 100 characters"),
  email: z.email("Please provide a valid email address.").min(1).trim(),
  password: z
    .string()
    .min(1, "Password is required")
    .min(8, "Password must be at least 8 characters long."),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;

export const createProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required.")
    .max(60, "Project name must not exceed 60 characters."),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;

export const flagKeySchema = z
  .string()
  .trim()
  .min(1, "Flag key is required.")
  .max(60, "Flag key must not exceed 60 characters.")
  .regex(
    /^[a-z0-9][a-z0-9_.-]*$/,
    "Key must start with a letter or number and contain only lowercase letters, numbers, underscores, dots, and hyphens.",
  );

export const createFlagSchema = z.object({
  projectId: z.uuid("Invalid project id."),
  name: z
    .string()
    .trim()
    .min(1, "Flag name is required.")
    .max(60, "Flag name must not exceed 60 characters."),
  key: flagKeySchema,
  description: z
    .string()
    .trim()
    .max(280, "Description must not exceed 280 characters.")
    .optional(),
});

export const updateFlagSchema = z.object({
  flagId: z.uuid("Invalid flag id."),
  name: z
    .string()
    .trim()
    .min(1, "Flag name is required.")
    .max(60, "Flag name must not exceed 60 characters."),
  description: z
    .string()
    .trim()
    .max(280, "Description must not exceed 280 characters.")
    .optional(),
});

export const setFlagEnvironmentStateSchema = z.object({
  flagEnvironmentStateId: z.uuid("Invalid flag environment state id."),
  enabled: z.boolean(),
  rolloutPercentage: z
    .number()
    .int("Rollout must be a whole number.")
    .min(0, "Rollout must be at least 0%.")
    .max(100, "Rollout must not exceed 100%."),
});

export const deleteFlagSchema = z.object({
  flagId: z.uuid("Invalid flag id."),
});

export type CreateFlagInput = z.infer<typeof createFlagSchema>;
export type UpdateFlagInput = z.infer<typeof updateFlagSchema>;
export type SetFlagEnvironmentStateInput = z.infer<
  typeof setFlagEnvironmentStateSchema
>;
export type DeleteFlagInput = z.infer<typeof deleteFlagSchema>;

export const segmentConditionOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "regex",
]);

export const segmentConditionSchema = z.object({
  property: z.string().min(1),
  operator: segmentConditionOperatorSchema,
  value: z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.array(z.string()),
    z.array(z.number()),
  ]),
});

export const segmentRulesSchema = z.object({
  match: z.enum(["all", "any"]),
  conditions: z.array(segmentConditionSchema),
});

export type SegmentRules = z.infer<typeof segmentRulesSchema>;

export const createApiKeySchema = z.object({
  environmentId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, "Key name is required.")
    .max(60, "Key name must not exceed 60 characters."),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const evaluateFlagsSchema = z.object({
  identity: z.string().min(1).max(200).optional(),
});
export type EvaluateFlagsInput = z.infer<typeof evaluateFlagsSchema>;
