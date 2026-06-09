"use client";

import { LogOut, Settings } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import type { UserSession } from "@/lib/auth";
import Link from "next/link";
import { signOut } from "@/lib/auth-client";
import { useRouter } from "next/navigation";

type ProfileMenuProps = {
  user: UserSession;
};

export default function ProfileMenu({ user }: ProfileMenuProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/sign-in");
    router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="none"
          size="sm"
          className="group flex h-fit min-w-0 items-center px-2 py-2"
        >
          <div className="flex max-w-30 flex-col items-end justify-center -space-y-0.5">
            <span className="truncate text-right text-xs">{user.name}</span>
            <span className="text-muted-foreground w-full truncate text-right text-xs">
              {user.email}
            </span>
          </div>
          <div className="group-hover:bg-flag-card-background flex size-4 items-center justify-center rounded-md border p-4 uppercase transition-colors">
            {user.name.slice(0, 1)}
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" className="mr-2">
        <DropdownMenuGroup>
          <DropdownMenuItem className="px-3 py-1.5" asChild>
            <Link href="/settings" className="text-muted-foreground">
              <Settings /> Settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleSignOut}
            className="text-muted-foreground px-3 py-1.5"
          >
            <LogOut />
            Log out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
