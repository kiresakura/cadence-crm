"use client";

import { Eye, Menu } from "lucide-react";
import { useState } from "react";

import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Role } from "@/generated/prisma/enums";
import type { Capabilities } from "@/server/permissions";

import { NavLinks } from "./nav";
import { UserMenu } from "./user-menu";
import { WorkspaceSwitcher } from "./workspace-switcher";

interface ShellProps {
  user: { name: string; email: string };
  role: Role;
  capabilities: Capabilities;
  workspace: { id: string; name: string };
  workspaces: Array<{ id: string; name: string; role: Role }>;
  children: React.ReactNode;
}

function SidebarContent(props: Omit<ShellProps, "children"> & { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <WorkspaceSwitcher current={props.workspace} workspaces={props.workspaces} />
      <div className="flex-1 overflow-y-auto">
        <NavLinks capabilities={props.capabilities} onNavigate={props.onNavigate} />
      </div>
      <UserMenu name={props.user.name} email={props.user.email} role={props.role} />
    </div>
  );
}

export function AppShell({ children, ...props }: ShellProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-full flex-1">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-4 border-r bg-sidebar p-4 md:flex">
        <Logo className="px-1" />
        <SidebarContent {...props} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-background/95 px-4 py-2 backdrop-blur md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-4">
              <SheetHeader className="p-0">
                <SheetTitle>
                  <Logo />
                </SheetTitle>
              </SheetHeader>
              <SidebarContent {...props} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <Logo />
        </header>

        {props.role === "VIEWER" ? (
          <div className="flex items-center gap-2 border-b bg-amber-50 px-4 py-2 text-sm text-amber-900 md:px-8 dark:bg-amber-950 dark:text-amber-100">
            <Eye className="size-4" /> You have read-only access to this workspace.
          </div>
        ) : null}

        <main className="w-full max-w-7xl flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
