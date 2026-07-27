"use client";

import { MoreHorizontal, Ban } from "lucide-react";
import * as React from "react";

import { RevokeApiKeyDialog } from "@/components/api-keys/revoke-api-key-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: Date;
  revokedAt: Date | null;
  environmentId: string;
  environmentName: string;
};

// Locale and timezone are both pinned: an unpinned formatter renders the
// server's day and the client's day differently either side of midnight, which
// hydrates as a mismatch.
const dateFormat = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeZone: "UTC",
});

export function ApiKeysTable({ keys }: { keys: ApiKeyRow[] }) {
  const [revokingKey, setRevokingKey] = React.useState<ApiKeyRow | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40">Name</TableHead>
            <TableHead>Key</TableHead>
            <TableHead>Environment</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys.map((key) => (
            <TableRow key={key.id}>
              <TableCell className="font-medium">{key.name}</TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">
                {/* non-secret display prefix — the rest of the key is unrecoverable */}
                {key.keyPrefix}…
              </TableCell>
              <TableCell>{key.environmentName}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {dateFormat.format(key.createdAt)}
              </TableCell>
              <TableCell>
                {key.revokedAt ? (
                  <Badge variant="destructive">
                    Revoked {dateFormat.format(key.revokedAt)}
                  </Badge>
                ) : (
                  <Badge variant="secondary">Active</Badge>
                )}
              </TableCell>
              <TableCell>
                {key.revokedAt ? null : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">API key actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setRevokingKey(key)}
                      >
                        <Ban />
                        Revoke
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {revokingKey && (
        <RevokeApiKeyDialog
          apiKey={revokingKey}
          open={revokingKey !== null}
          onOpenChange={(open) => {
            if (!open) setRevokingKey(null);
          }}
        />
      )}
    </>
  );
}
