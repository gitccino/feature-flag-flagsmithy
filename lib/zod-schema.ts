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
