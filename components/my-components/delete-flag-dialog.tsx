"use client";

import { ProjectFlag } from "@/lib/queries/flags";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { useState } from "react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { useRouter } from "next/navigation";
import { deleteFlag } from "@/app/actions/flags";
import { toast } from "sonner";

type DeleteFlagDialogProps = {
  flag: ProjectFlag;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DeleteFlagDialog({
  flag,
  open,
  onOpenChange,
}: DeleteFlagDialogProps) {
  const router = useRouter();
  const [confirmKey, setConfirmKey] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const confirmed = confirmKey === flag.key;

  async function handleDelete() {
    if (!confirmed) return;

    setIsDeleting(true);
    // deleting
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete flag</DialogTitle>
          <DialogDescription>
            This permanently removes <strong>{flag.name}</strong> and all
            per-env states. Type <span className="font-mono">{flag.key}</span>{" "}
            to confirm
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
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
