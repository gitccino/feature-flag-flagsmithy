import { Flag } from "lucide-react";

import { CreateFlagDialog } from "@/components/flags/create-flag-dialog";
import { FlagsTable } from "@/components/flags/flags-table";
import { listProjectFlags } from "@/lib/queries/flags";

// Testing purpose
// import { FlagsTable as TestFlagsTable } from "@/components/my-components/flags-table";

export default async function ProjectFlagsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const flags = await listProjectFlags(projectId);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Toggle flags per environment. Rollout % stored only — no evaluation
          yet.
        </p>
        <CreateFlagDialog projectId={projectId} />
      </div>

      {flags.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <Flag className="text-muted-foreground size-8" />
          <div>
            <p className="font-medium">No flags yet</p>
            <p className="text-muted-foreground text-sm">
              Create your first flag to start configuring per-environment
              states.
            </p>
          </div>
        </div>
      ) : (
        <FlagsTable flags={flags} />
      )}
    </div>
  );
}
