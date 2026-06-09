import { z } from "zod";

export const signInSchema = z.object({
  email: z.email("Please provide a valid email address.").min(1).trim(),
  password: z
    .string()
    .min(1, "Password is required.")
    .min(8, "Password must be at least 8 characters long."),
});

export type SignInInput = z.infer<typeof signInSchema>;
