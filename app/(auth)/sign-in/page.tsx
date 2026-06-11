"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sanitizeCallbackURL, withCallbackURL } from "@/lib/auth/callback-url";
import { type SignInInput, signInSchema } from "@/lib/zod-schema";
import { signIn } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
// import { useState } from 'react';

export default function SignInPage() {
  const searchParams = useSearchParams(); // searchParams.get("callbackURL") -> /segments
  const redirectTo = sanitizeCallbackURL(
    searchParams.get("callbackURL") ?? "/",
  );

  const {
    // register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }, // isValid
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "hello@flagsmithy.com", password: "password" },
  });

  const onSubmit = handleSubmit(async (data) => {
    // setAuthError(null)

    const { error } = await signIn.email({
      email: data.email,
      password: data.password,
      callbackURL: redirectTo,
    });
    if (error) {
      setError("root", { message: `*${error.message}` });
    }
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Don&apos;t have an account?{" "}
          <Link
            href={withCallbackURL("/sign-up", redirectTo)}
            className="text-primary ml-2 underline underline-offset-4"
          >
            Create one
          </Link>
        </p>
      </div>

      <form id="sign-in" onSubmit={onSubmit}>
        <FieldGroup>
          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sign-in-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="sign-in-email"
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  placeholder="hello@flagsmithy.com"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="password"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sign-in-password">Password</FieldLabel>
                <Input
                  {...field}
                  id="sign-in-password"
                  type="password"
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  placeholder="Your password"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>

        <div className="mt-4 space-y-2">
          <Button
            type="submit"
            form="sign-in"
            className="w-full"
            size="xl"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in" : "Sign in"}
          </Button>
          {errors.root && <FieldError errors={[errors.root]} />}
        </div>

        {/* <>
          <Label htmlFor="email"></Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            required
            placeholder="hello@flagsmithy.com"
            defaultValue="admin@flagsmithy.com"
          />
        </>

        <>
          <Label htmlFor="password"></Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="off"
            required
            placeholder="Your password"
            defaultValue="password"
          />
        </> */}
      </form>
    </div>
  );
}
