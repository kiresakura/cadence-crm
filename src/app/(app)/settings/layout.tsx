import { ShieldAlert } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/page";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";

import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { ctx } = await requirePageContext();
  if (!can(ctx.role, "settings:manage")) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="Settings are limited to admins"
        description="Ask a workspace owner or admin if you need something changed."
      />
    );
  }
  return (
    <>
      <PageHeader title="Settings" description="Configure how your workspace works." />
      <div className="grid gap-6 lg:grid-cols-[12rem_1fr]">
        <SettingsNav />
        <div className="min-w-0">{children}</div>
      </div>
    </>
  );
}
