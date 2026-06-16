"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FolderPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";

import { createProject } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createProjectSchema, type CreateProjectInput } from "@/lib/zod-schema";

export function CreateProjectDialog() {
  const router = useRouter();
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    const result = await createProject(values);

    // client validation is UX; the action re-validates and is the source of truth
    if (!result.ok) {
      const nameError = result.fieldErrors?.name?.[0];
      if (nameError) {
        setError("name", { message: nameError });
      } else {
        setError("root", { message: result.error });
      }
      return;
    }

    reset();
    setOpen(false);
    router.refresh(); // re-render the server component list with the new project
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <FolderPlus />
          New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create project</DialogTitle>
          <DialogDescription>
            We&apos;ll set up development, staging, and production environments
            automatically.
          </DialogDescription>
        </DialogHeader>

        <form id={formId} onSubmit={onSubmit}>
          <FieldGroup>
            <Controller
              name="name"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${formId}-name`}>Name</FieldLabel>
                  <Input
                    {...field}
                    id={`${formId}-name`}
                    autoComplete="off"
                    placeholder="My App"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            {errors.root && <FieldError errors={[errors.root]} />}
          </FieldGroup>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
