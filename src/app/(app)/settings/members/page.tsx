import type { Metadata } from "next";

import { requirePageContext } from "@/server/next/request";
import { listMembers } from "@/server/services/members";

import { MemberManager } from "./member-manager";

export const metadata: Metadata = { title: "Members" };

export default async function MembersSettingsPage() {
  const { ctx } = await requirePageContext();
  const members = await listMembers(ctx);
  return (
    <MemberManager
      actorRole={ctx.role}
      currentUserId={ctx.userId}
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
