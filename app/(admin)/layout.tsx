import { Suspense } from "react";

import { AdminShell } from "@/components/admin/admin-shell";
import { Skeleton } from "@/components/ui/skeleton";

function AdminLayoutSkeleton() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <Skeleton className="mb-6 h-10 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<AdminLayoutSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}
