"use client";

import { createFlag } from "@/app/actions/flags";
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
import { slugify } from "@/lib/slug";
import { CreateFlagInput, createFlagSchema } from "@/lib/zod-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

type CreateFlagDialogProps = {
  projectId: string;
};

export function CreateFlagDialog({ projectId }: CreateFlagDialogProps) {
  const router = useRouter();
  const formId = React.useId();
  const [open, setOpen] = useState(false);
  const [keyTouched, setKeyTouched] = useState(false); // Tracks whether user manually edited Key
  const DEFAULT_FORM_VALUES = { projectId, name: "", key: "", description: "" };
  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateFlagInput>({
    resolver: zodResolver(createFlagSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset(DEFAULT_FORM_VALUES);
      setKeyTouched(false);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    // createFlag
    const result = await createFlag(values);

    // router refresh
    if (!result.ok) {
      const keyError = result.fieldErrors?.key?.[0];
      const nameError = result.fieldErrors?.name?.[0];
      if (keyError) {
        setError("key", { message: keyError });
      } else if (nameError) {
        setError("name", { message: nameError });
      } else {
        toast.error(result.error);
      }
      return;
    }

    // toast
    reset(DEFAULT_FORM_VALUES);
    setKeyTouched(false);
    setOpen(false);
    router.refresh();
    toast.success("Flag created");
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Flag />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Flag</DialogTitle>
          <DialogDescription>The key is your code ....</DialogDescription>
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
                    placeholder="Dark mode"
                    aria-invalid={fieldState.invalid}
                    onChange={(event) => {
                      field.onChange(event);
                      if (!keyTouched) {
                        setValue("key", slugify(event.target.value), {
                          shouldValidate: event.target.value.length > 0,
                        });
                      }
                    }}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
            <Controller
              name="key"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${formId}-key`}>Key</FieldLabel>
                  <Input
                    {...field}
                    id={`${formId}-key`}
                    autoComplete="off"
                    placeholder="dark-mode"
                    aria-invalid={fieldState.invalid}
                    onChange={(event) => {
                      setKeyTouched(true);
                      field.onChange(event);
                    }}
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
      </DialogContent>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline" type="button">
            Cancel
          </Button>
          <Button type="submit">{isSubmitting ? "Creating" : "Create"}</Button>
        </DialogClose>
      </DialogFooter>
    </Dialog>
  );
}
