"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { deleteFlag } from "@/app/actions/flags";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type DeleteFlagDialogProps = {
  flag: { id: string; key: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DeleteFlagDialog({
  flag,
  open,
  onOpenChange,
}: DeleteFlagDialogProps) {
  const router = useRouter();
  const [confirmKey, setConfirmKey] = React.useState("");
  const [isDeleting, setIsDeleting] = React.useState(false);

  const confirmed = confirmKey === flag.key;

  async function handleDelete() {
    if (!confirmed) return;

    setIsDeleting(true);
    const result = await deleteFlag({ flagId: flag.id });
    setIsDeleting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    onOpenChange(false);
    router.refresh();
    toast.success("Flag deleted");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setConfirmKey("");
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete flag</DialogTitle>
          <DialogDescription>
            This permanently removes <strong>{flag.name}</strong> and all
            per-environment states. Type{" "}
            <span className="font-mono">{flag.key}</span> to confirm.
          </DialogDescription>
        </DialogHeader>

        <Input
          value={confirmKey}
          onChange={(event) => setConfirmKey(event.target.value)}
          placeholder={flag.key}
          className="font-mono"
          autoComplete="off"
        />

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!confirmed || isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? "Deleting..." : "Delete flag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
