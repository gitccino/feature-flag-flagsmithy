"use server";

import { z } from "zod";
import { signInSchema, SignInInput } from "@/lib/zod-schema";

export async function authenticateUser(data: SignInInput) {
  // 1. Re-validate on the server for security
  const result = signInSchema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      errors: z.flattenError(result.error).fieldErrors,
    };
  }

  try {
    // 2. Insert your chosen authentication logic here
    // Example: call your provider like Auth.js, Better Auth, or database validation

    return { success: true };
  } catch {
    return {
      success: false,
      message: "Invalid credentials. Please try again.",
    };
  }
}
