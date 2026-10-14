import type { Metadata } from "next";

import { DetailList, Section } from "@/components/page";
import { requirePageContext } from "@/server/next/request";
import { can } from "@/server/permissions";

import { RenameWorkspaceForm } from "./rename-form";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspaceSettingsPage() {
  const { ctx, workspace } = await requirePageContext();
  return (
    <div className="grid gap-6">
      <Section title="Workspace">
        <DetailList
          items={[
            { label: "Name", value: workspace.name },
            { label: "Identifier", value: <code className="text-xs">{workspace.slug}</code> },
            { label: "Reporting currency", value: workspace.currency },
          ]}
        />
      </Section>
      {can(ctx.role, "workspace:manage") ? (
        <Section title="Rename workspace">
          <RenameWorkspaceForm name={workspace.name} />
        </Section>
      ) : (
        <p className="text-sm text-muted-foreground">Only owners can rename the workspace.</p>
      )}
    </div>
  );
}
