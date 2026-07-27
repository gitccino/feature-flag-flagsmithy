import { KeyRound } from "lucide-react";

import { ApiKeysTable } from "@/components/api-keys/api-keys-table";
import { CreateApiKeyDialog } from "@/components/api-keys/create-api-key-dialog";
import { listProjectApiKeys } from "@/lib/queries/api-keys";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const environments = await listProjectApiKeys(projectId);
  // flatten to one newest-first list — the environment is a column, not a section
  const keys = environments
    .flatMap((environment) =>
      environment.apiKeys.map((key) => ({
        ...key,
        environmentId: environment.id,
        environmentName: environment.name,
      })),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          Environment-scoped keys for the evaluation API. The full key is shown
          once, at creation.
        </p>
        <CreateApiKeyDialog
          environments={environments.map((environment) => ({
            id: environment.id,
            name: environment.name,
          }))}
        />
      </div>

      {keys.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <KeyRound className="text-muted-foreground size-8" />
          <div>
            <p className="font-medium">No API keys yet</p>
            <p className="text-muted-foreground text-sm">
              Create a key to start evaluating flags from your application.
            </p>
          </div>
        </div>
      ) : (
        <ApiKeysTable keys={keys} />
      )}
    </div>
  );
}
