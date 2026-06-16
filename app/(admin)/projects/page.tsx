import { FolderPlus } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CreateProjectDialog } from "@/components/projects/create-project-dialog";
import { auth } from "@/lib/auth";
import { buildSignInPath } from "@/lib/auth/callback-url";
import { listOwnedProjects } from "@/lib/queries/projects";

export default async function ProjectsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(buildSignInPath("/projects"));
  }

  const projects = await listOwnedProjects(session.user.id);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Each project gets its own flags, segments, and environments.
          </p>
        </div>
        <CreateProjectDialog />
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <FolderPlus className="text-muted-foreground size-8" />
          <div>
            <p className="font-medium">No projects yet</p>
            <p className="text-muted-foreground text-sm">
              Create your first project to start managing feature flags.
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 block rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
              >
                <p className="truncate font-medium">{project.name}</p>
                <p className="text-muted-foreground truncate font-mono text-xs">
                  {project.slug}
                </p>
                <p className="text-muted-foreground mt-3 text-xs">
                  Created {project.createdAt.toLocaleDateString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
