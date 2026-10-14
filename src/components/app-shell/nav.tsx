"use client";

import {
  Building2,
  CheckSquare,
  History,
  KanbanSquare,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { Capabilities } from "@/server/permissions";
import { cn } from "@/lib/utils";

const MAIN = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/deals", label: "Deals", icon: KanbanSquare },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
] as const;

export function NavLinks({
  capabilities,
  onNavigate,
}: {
  capabilities: Capabilities;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const admin = [
    ...(capabilities.canManageSettings || capabilities.canManageMembers
      ? [{ href: "/settings", label: "Settings", icon: Settings }]
      : []),
    ...(capabilities.canReadAudit
      ? [{ href: "/audit-log", label: "Audit log", icon: History }]
      : []),
  ];

  const renderLink = (item: { href: string; label: string; icon: typeof Users }) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
          active && "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
        )}
      >
        <Icon className="size-4" />
        {item.label}
      </Link>
    );
  };

  return (
    <nav className="grid gap-1" aria-label="Main">
      {MAIN.map(renderLink)}
      {admin.length > 0 ? (
        <>
          <p className="mt-4 mb-1 px-2.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Admin
          </p>
          {admin.map(renderLink)}
        </>
      ) : null}
    </nav>
  );
}
