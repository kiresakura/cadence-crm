import type { Metadata } from "next";

import { requirePageContext } from "@/server/next/request";
import { membersSettings } from "@/server/services/members";

import { MemberManager } from "./member-manager";

export const metadata: Metadata = { title: "Members" };

export default async function MembersSettingsPage() {
  const { ctx, user } = await requirePageContext();
  const settings = await membersSettings(ctx);
  if (!settings) return null;
  const { members, invitations } = settings;
  return (
    <MemberManager
      actorRole={ctx.role}
      currentUserId={ctx.userId}
      timeZone={user.timezone}
      invitations={invitations}
      members={members.map((member) => ({
        id: member.id,
        userId: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
      }))}
    />
  );
}
