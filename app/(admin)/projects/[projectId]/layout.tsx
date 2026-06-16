import { ProjectNav } from "@/components/projects/project-nav";
import { requireProjectAccess } from "@/lib/auth/project-access";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  // re-verify session + ownership server-side; redirects or 404s on failure
  const { project } = await requireProjectAccess(projectId);

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-col gap-3 border-b pb-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <span className="text-muted-foreground font-mono text-xs">
            {project.slug}
          </span>
        </div>
        <ProjectNav projectId={projectId} />
      </div>
      {children}
    </div>
  );
}
