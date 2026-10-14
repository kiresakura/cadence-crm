"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/settings/pipelines", label: "Pipelines" },
  { href: "/settings/tags", label: "Tags" },
  { href: "/settings/fields", label: "Custom fields" },
  { href: "/settings/members", label: "Members" },
  { href: "/settings/workspace", label: "Workspace" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Settings">
      {ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={pathname === item.href ? "page" : undefined}
          className={cn(
            "rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted-foreground hover:bg-muted hover:text-foreground",
            pathname === item.href && "bg-muted font-medium text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
