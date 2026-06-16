"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const items = [
    { href: base, label: "Flags" },
    { href: `${base}/segments`, label: "Segments" },
    { href: `${base}/audit`, label: "Audit" },
    { href: `${base}/settings`, label: "Settings" },
  ];

  return (
    <nav className="flex gap-1">
      {items.map((item) => {
        // index (Flags) matches exactly; others match their subtree
        const active =
          item.href === base
            ? pathname === base
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm transition-colors",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
