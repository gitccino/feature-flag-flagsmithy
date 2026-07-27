"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { revokeApiKey } from "@/app/actions/api-keys";
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

type RevokeApiKeyDialogProps = {
  apiKey: { id: string; name: string; environmentName: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RevokeApiKeyDialog({
  apiKey,
  open,
  onOpenChange,
}: RevokeApiKeyDialogProps) {
  const router = useRouter();
  const [isRevoking, setIsRevoking] = React.useState(false);

  async function handleRevoke() {
    setIsRevoking(true);
    const result = await revokeApiKey({ apiKeyId: apiKey.id });
    setIsRevoking(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    onOpenChange(false);
    router.refresh();
    toast.success("API key revoked");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke API key</DialogTitle>
          <DialogDescription>
            <strong>{apiKey.name}</strong> stops working immediately — the next
            evaluation request using it fails. Anything still calling{" "}
            {apiKey.environmentName} with this key breaks. The key is kept in the
            audit trail, not deleted, and cannot be un-revoked.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isRevoking}
            onClick={handleRevoke}
          >
            {isRevoking ? "Revoking..." : "Revoke key"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
