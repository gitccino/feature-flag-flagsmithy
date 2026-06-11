import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { buildSignInPath } from "@/lib/auth/callback-url";
import { auth } from "@/lib/auth";
import ProfileMenu from "@/components/navbar/profile-menu";

async function requireSession() {
  const headersList = await headers();
  const session = await auth.api.getSession({
    headers: headersList,
  });

  if (!session) {
    const pathname = headersList.get("x-pathname") ?? "/";
    redirect(buildSignInPath(pathname));
  }
  return session;
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return (
    <div className="mx-auto max-w-6xl">
      <header className="sticky top-0 z-10 flex w-full items-center border-b-0 px-2 py-2">
        <div className="flex flex-1 items-center">
          <div>
            <Button variant="link" asChild>
              <Link href="/">Dashboard</Link>
            </Button>
            <Button variant="link" asChild>
              <Link href="/segments">Segments</Link>
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
