import { Suspense } from "react";

import { ProjectShell } from "@/components/projects/project-shell";
import { Skeleton } from "@/components/ui/skeleton";

function ProjectLayoutSkeleton() {
  return (
    <div className="space-y-4 p-6">
      <div className="space-y-2 border-b pb-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-8 w-72" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  return (
    <Suspense fallback={<ProjectLayoutSkeleton />}>
      <ProjectShell params={params}>{children}</ProjectShell>
    </Suspense>
  );
}
