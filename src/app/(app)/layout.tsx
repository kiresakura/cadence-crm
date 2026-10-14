import { AppShell } from "@/components/app-shell/app-shell";
import { requirePageContext } from "@/server/next/request";
import { capabilitiesFor } from "@/server/permissions";
import { listUserWorkspaces } from "@/server/services/workspaces";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ctx, workspace } = await requirePageContext();
  const workspaces = await listUserWorkspaces(user.id);
  return (
    <AppShell
      user={{ name: user.name, email: user.email }}
      role={ctx.role}
      capabilities={capabilitiesFor(ctx.role)}
      workspace={{ id: workspace.id, name: workspace.name }}
      workspaces={workspaces}
    >
      {children}
    </AppShell>
  );
}
