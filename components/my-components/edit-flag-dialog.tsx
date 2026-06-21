import { UpdateFlagInput, updateFlagSchema } from "@/lib/zod-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { updateFlag } from "@/app/actions/flags";
import { toast } from "sonner";

type EditFlagDialogProps = {
  flag: {
    id: string;
    key: string;
    name: string;
    description: string | null;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function EditFlagDialog({
  flag,
  open,
  onOpenChange,
}: EditFlagDialogProps) {
  const router = useRouter();
  const formId = React.useId();

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<UpdateFlagInput>({
    resolver: zodResolver(updateFlagSchema),
    defaultValues: {
      flagId: flag.id,
      name: flag.name,
      description: flag.description ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    // update flag
    const result = await updateFlag(values);

    // check the result
    if (!result.ok) {
      const nameError = result.fieldErrors?.name?.[0];
      if (nameError) {
        setError("name", { message: nameError });
      } else {
        toast.error(result.error);
      }
      return;
    }
    // clost the dialog
    onOpenChange(false);

    // refresh
    router.refresh();

    // toast feedback
    toast.success("Flag updated");
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit flag</DialogTitle>
          <DialogDescription>
            Key <span className="font-mono">{flag.key} cannot be changed.</span>
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
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${formId}-description`}>
                    Desciption
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id={`${formId}-description`}
                    rows={3}
                    placeholder="Optional"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
