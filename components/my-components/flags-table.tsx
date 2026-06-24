"use client";

import { ProjectFlag } from "@/lib/queries/flags";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { EditFlagDialog } from "@/components/my-components/edit-flag-dialog";
import { DeleteFlagDialog } from "./delete-flag-dialog";
import { FlagEnvCell } from "./flag-env-cell";

type FlagsTableProps = {
  flags: ProjectFlag[];
};

const ENV_KEY_ORDER = ["development", "staging", "production"] as const;

type EnvironmentColumn = {
  id: string;
  key: (typeof ENV_KEY_ORDER)[number];
  name: string;
};

function sortEnvironments(flag: ProjectFlag) {
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
  const [editingFlag, setEditingFlag] = useState<ProjectFlag | null>(null);
  const [deletingFlag, setDeletingFlag] = useState<ProjectFlag | null>(null);

  const columns =
    flags.length > 0 ? sortEnvironments(flags[0]) : ([] as EnvironmentColumn[]);

  return (
    <>
      {/* Main table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-48">Flag</TableHead>
            {columns.map((env) => (
              <TableHead key={env.id}>{env.name}</TableHead>
            ))}
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
                        -
                      </TableCell>
                    );
                  }
                  return (
                    <TableCell key={env.id}>
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
                    <DropdownMenuContent>
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

      {/* EditFlagDialog — conditionally rendered */}
      {editingFlag && (
        <EditFlagDialog
          flag={editingFlag}
          open={editingFlag !== null}
          onOpenChange={(open) => {
            if (!open) setEditingFlag(null);
          }}
        />
      )}

      {/* DeleteFlagDialog — conditionally rendered */}
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
