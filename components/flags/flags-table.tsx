"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import * as React from "react";

import { DeleteFlagDialog } from "@/components/flags/delete-flag-dialog";
import { EditFlagDialog } from "@/components/flags/edit-flag-dialog";
import { FlagEnvCell } from "@/components/flags/flag-env-cell";
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
import type { ProjectFlag } from "@/lib/queries/flags";

const ENV_KEY_ORDER = ["development", "staging", "production"] as const;

type EnvironmentColumn = {
  id: string;
  key: (typeof ENV_KEY_ORDER)[number];
  name: string;
};

type FlagsTableProps = {
  flags: ProjectFlag[];
};

function sortEnvironments(flag: ProjectFlag): EnvironmentColumn[] {
  return [...flag.environmentStates]
    .sort(
      (a, b) =>
        ENV_KEY_ORDER.indexOf(a.environment.key) -
        ENV_KEY_ORDER.indexOf(b.environment.key),
    )
    .map((state) => ({
      id: state.environment.id,
      key: state.environment.key,
      name: state.environment.name,
    }));
}

export function FlagsTable({ flags }: FlagsTableProps) {
  const [editingFlag, setEditingFlag] = React.useState<ProjectFlag | null>(
    null,
  );
  const [deletingFlag, setDeletingFlag] = React.useState<ProjectFlag | null>(
    null,
  );

  const columns =
    flags.length > 0 ? sortEnvironments(flags[0]) : ([] as EnvironmentColumn[]);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">Flag</TableHead>
            {columns.map((env) => (
              <TableHead key={env.id} className="text-center">
                {env.name}
              </TableHead>
            ))}
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {flags.map((flag) => {
            const stateByEnvId = new Map(
              flag.environmentStates.map((state) => [
                state.environmentId,
                state,
              ]),
            );

            return (
              <TableRow key={flag.id}>
                <TableCell>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{flag.name}</p>
                    <p className="text-muted-foreground truncate font-mono text-xs">
                      {flag.key}
                    </p>
                  </div>
                </TableCell>
                {columns.map((env) => {
                  const state = stateByEnvId.get(env.id);
                  if (!state) {
                    return (
                      <TableCell key={env.id} className="text-center">
                        —
                      </TableCell>
                    );
                  }

                  return (
                    <TableCell key={env.id} className="text-center">
                      <FlagEnvCell
                        key={`${state.id}-${state.enabled}-${state.rolloutPercentage}`}
                        state={{
                          id: state.id,
                          enabled: state.enabled,
                          rolloutPercentage: state.rolloutPercentage,
                        }}
                      />
                    </TableCell>
                  );
                })}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Flag actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingFlag(flag)}>
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setDeletingFlag(flag)}
                      >
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {editingFlag && (
        <EditFlagDialog
          flag={editingFlag}
          open={editingFlag !== null}
          onOpenChange={(open) => {
            if (!open) setEditingFlag(null);
          }}
        />
      )}

      {deletingFlag && (
        <DeleteFlagDialog
          flag={deletingFlag}
          open={deletingFlag !== null}
          onOpenChange={(open) => {
            if (!open) setDeletingFlag(null);
          }}
        />
      )}
    </>
  );
}
