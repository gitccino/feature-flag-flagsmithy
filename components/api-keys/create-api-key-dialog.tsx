"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";

import { createApiKey } from "@/app/actions/api-keys";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createApiKeySchema, type CreateApiKeyInput } from "@/lib/zod-schema";

type CreateApiKeyDialogProps = {
  environments: { id: string; name: string }[];
};

export function CreateApiKeyDialog({
  environments,
}: CreateApiKeyDialogProps) {
  const router = useRouter();
  const formId = React.useId();
  const [open, setOpen] = React.useState(false);
  // Set once, on success. While non-null the dialog shows the reveal step —
  // this is the only moment the plaintext exists anywhere outside the client.
  const [plaintext, setPlaintext] = React.useState<string | null>(null);

  const defaultValues: CreateApiKeyInput = {
    environmentId: environments[0]?.id ?? "",
    name: "",
  };

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateApiKeyInput>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues,
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      // Drop the plaintext from memory as soon as the dialog closes. Reopening
      // starts a fresh create — there is no way back to a key already shown.
      setPlaintext(null);
      reset(defaultValues);
      router.refresh();
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    const result = await createApiKey(values);

    if (!result.ok) {
      const nameError = result.fieldErrors?.name?.[0];
      const environmentError = result.fieldErrors?.environmentId?.[0];
      if (nameError) {
        setError("name", { message: nameError });
      } else if (environmentError) {
        setError("environmentId", { message: environmentError });
      } else {
        setError("root", { message: result.error });
      }
      return;
    }

    setPlaintext(result.data.plaintext);
    toast.success("API key created");
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button disabled={environments.length === 0}>
          <KeyRound />
          New API key
        </Button>
      </DialogTrigger>
      <DialogContent>
        {plaintext ? (
          <RevealedKey plaintext={plaintext} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create API key</DialogTitle>
              <DialogDescription>
                The key is scoped to one environment and evaluates only that
                environment&apos;s flags.
              </DialogDescription>
            </DialogHeader>

            <form id={formId} onSubmit={onSubmit}>
              <FieldGroup>
                <Controller
                  name="environmentId"
                  control={control}
                  render={({ field, fieldState }) => (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={`${formId}-environment`}>
                        Environment
                      </FieldLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger
                          id={`${formId}-environment`}
                          aria-invalid={fieldState.invalid}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select an environment" />
                        </SelectTrigger>
                        <SelectContent>
                          {environments.map((environment) => (
                            <SelectItem
                              key={environment.id}
                              value={environment.id}
                            >
                              {environment.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {fieldState.invalid && (
                        <FieldError errors={[fieldState.error]} />
                      )}
                    </Field>
                  )}
                />
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
                        placeholder="Web app"
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
                {isSubmitting ? "Creating..." : "Create key"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RevealedKey({ plaintext }: { plaintext: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      // ponytail: no timer cleanup — the dialog unmounts on close and a stale
      // setState on an unmounted component is a no-op in React 19.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and by some permission
      // policies. The key is selectable in the field below either way.
      toast.error("Could not copy. Select the key and copy it manually.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Copy your API key</DialogTitle>
        <DialogDescription className="text-destructive flex items-start gap-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            This is the only time this key is shown. Only a hash is stored — it
            cannot be retrieved again. If you lose it, create a new key and
            revoke this one.
          </span>
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center gap-2">
        <Input
          value={plaintext}
          readOnly
          // select-on-focus so a blocked clipboard still leaves a usable path
          onFocus={(event) => event.target.select()}
          aria-label="API key"
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={copy}
          aria-label="Copy API key"
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">I&apos;ve saved it</Button>
        </DialogClose>
      </DialogFooter>
    </>
  );
}
