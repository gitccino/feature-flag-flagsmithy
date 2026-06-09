"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { sanitizeCallbackURL, withCallbackURL } from "@/lib/auth/callback-url";
import { type SignUpInput, signUpSchema } from "@/lib/zod-schema";
import { signUp } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export default function SignUpPage() {
  const searchParams = useSearchParams();
  const redirectTo = sanitizeCallbackURL(
    searchParams.get("callbackURL") ?? "/",
  );

  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (data) => {
    const { error } = await signUp.email({
      name: data.name,
      email: data.email,
      password: data.password,
      callbackURL: redirectTo,
    });
    if (error) {
      setError("root", { message: `*${error.message}` });
      return;
    }
    // signUp.email does not return redirect/url like signIn.email — redirect manually
    window.location.assign(redirectTo);
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create an account</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Already have one?{" "}
          <Link
            href={withCallbackURL("/sign-in", redirectTo)}
            className="text-primary ml-2 underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </div>

      <form id="sign-up" onSubmit={onSubmit}>
        <FieldGroup>
          <Controller
            name="name"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sign-up-name">Name</FieldLabel>
                <Input
                  {...field}
                  id="sign-up-name"
                  aria-invalid={fieldState.invalid}
                  autoComplete="off"
                  placeholder="Your name"
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />

          <Controller
            name="email"
            control={control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="sign-up-email">Email</FieldLabel>
                <Input
                  {...field}
                  id="sign-up-email"
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
                <FieldLabel htmlFor="sign-up-password">Password</FieldLabel>
                <Input
                  {...field}
                  id="sign-up-password"
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
            form="sign-up"
            className="w-full"
            size="xl"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating account" : "Create account"}
          </Button>
          {errors.root && <FieldError errors={[errors.root]} />}
        </div>
      </form>
    </div>
  );
}
