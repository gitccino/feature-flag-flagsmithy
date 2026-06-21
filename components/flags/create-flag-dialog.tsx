"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Flag } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

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
import { createFlagSchema, type CreateFlagInput } from "@/lib/zod-schema";

type CreateFlagDialogProps = {
  projectId: string;
};

export function CreateFlagDialog({ projectId }: CreateFlagDialogProps) {
  const router = useRouter();
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [keyTouched, setKeyTouched] = React.useState(false);

  const {
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateFlagInput>({
    resolver: zodResolver(createFlagSchema),
    defaultValues: { projectId, name: "", key: "", description: "" },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      reset({ projectId, name: "", key: "", description: "" });
      setKeyTouched(false);
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const result = await createFlag(values);

    if (!result.ok) {
      const keyError = result.fieldErrors?.key?.[0];
      const nameError = result.fieldErrors?.name?.[0];
      if (keyError) {
        setError("key", { message: keyError });
      } else if (nameError) {
        setError("name", { message: nameError });
      } else {
        // toast.error(result.error);
        setError("root", { message: result.error });
      }
      return;
    }

    reset({ projectId, name: "", key: "", description: "" });
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
          New flag
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create flag</DialogTitle>
          <DialogDescription>
            The key is your code contract — it locks after creation.
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
                    className="font-mono"
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

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create flag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
