import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import ProfileMenu from "@/components/navbar/profile-menu";
import { Button } from "@/components/ui/button";
import { auth } from "@/lib/auth";
import { buildSignInPath } from "@/lib/auth/callback-url";

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });

  if (!session) {
    const pathname = headersList.get("x-pathname") ?? "/";
    redirect(buildSignInPath(pathname));
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="sticky top-0 z-10 flex w-full items-center border-b-0 px-2 py-2">
        <div className="flex flex-1 items-center">
          <div>
            <Button variant="link" asChild>
              <Link href="/projects">Projects</Link>
            </Button>
          </div>
          <div className="ml-auto">
            <ProfileMenu user={session.user} />
          </div>
        </div>
      </header>
      <div className="w-full">{children}</div>
    </div>
  );
}
