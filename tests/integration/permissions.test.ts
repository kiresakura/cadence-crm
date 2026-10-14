import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ConflictError, ForbiddenError } from "@/server/errors";
import { listAuditLogs } from "@/server/services/audit-log";
import {
  createContact,
  deleteContact,
  listContacts,
  parseContactFilters,
  updateContact,
} from "@/server/services/contacts";
import { createFieldDefinition } from "@/server/services/custom-fields";
import { createDeal, moveDeal } from "@/server/services/deals";
import { createInvitation } from "@/server/services/invitations";
import { changeMemberRole, removeMember } from "@/server/services/members";
import { createPipeline } from "@/server/services/pipelines";
import { createTag } from "@/server/services/tags";
import { renameWorkspace } from "@/server/services/workspaces";

import {
  createTestWorkspace,
  createUser,
  joinThroughInvitation,
  stageByName,
  uid,
  type TestWorkspace,
} from "./helpers";

describe("server-side role enforcement", () => {
  let ws: TestWorkspace;
  let contactId: string;

  beforeAll(async () => {
    ws = await createTestWorkspace();
    contactId = (await createContact(ws.owner, { firstName: "Role", lastName: "Target" })).id;
  });

  describe("VIEWER", () => {
    it("can read but not write", async () => {
      expect((await listContacts(ws.viewer, parseContactFilters({}))).total).toBeGreaterThan(0);
      await expect(
        createContact(ws.viewer, { firstName: "A", lastName: "B" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        updateContact(ws.viewer, contactId, { firstName: "A", lastName: "B" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(deleteContact(ws.viewer, contactId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        createDeal(ws.viewer, {
          title: "x",
          amount: "1",
          pipelineId: ws.pipelineId,
          stageId: stageByName(ws, "Lead in").id,
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("is rejected before input validation runs", async () => {
      await expect(createContact(ws.viewer, {})).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("MEMBER", () => {
    it("can create, update and delete business records", async () => {
      const contact = await createContact(ws.member, { firstName: "Mem", lastName: "Ber" });
      await updateContact(ws.member, contact.id, { firstName: "Mem", lastName: "Updated" });
      const deal = await createDeal(ws.member, {
        title: "Member deal",
        amount: "100",
        pipelineId: ws.pipelineId,
        stageId: stageByName(ws, "Lead in").id,
      });
      await moveDeal(ws.member, deal.id, { stageId: stageByName(ws, "Qualified").id });
      await deleteContact(ws.member, contact.id);
    });

    it("cannot change settings, members or read the audit log", async () => {
      await expect(createTag(ws.member, { name: "nope" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createPipeline(ws.member, { name: "nope" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      await expect(
        createFieldDefinition(ws.member, { entityType: "CONTACT", label: "Nope", type: "TEXT" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(
        createInvitation(ws.member, { email: `x-${uid()}@example.com`, role: "VIEWER" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listAuditLogs(ws.member, { page: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("ADMIN", () => {
    it("can manage settings, members and read the audit log", async () => {
      await createTag(ws.admin, { name: `admin-${uid()}` });
      await createPipeline(ws.admin, { name: "Admin pipeline" });
      const membership = await joinThroughInvitation(ws.admin, await createUser("Hire"), "MEMBER");
      expect(membership.role).toBe("MEMBER");
      await changeMemberRole(ws.admin, membership.id, { role: "VIEWER" });
      expect((await listAuditLogs(ws.admin, { page: 1 })).total).toBeGreaterThan(0);
      await removeMember(ws.admin, membership.id);
    });

    it("cannot grant or modify the owner role, or rename the workspace", async () => {
      await expect(
        createInvitation(ws.admin, { email: `own-${uid()}@example.com`, role: "OWNER" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      const ownerMembership = await db.membership.findFirstOrThrow({
        where: { workspaceId: ws.workspaceId, role: "OWNER" },
      });
      await expect(
        changeMemberRole(ws.admin, ownerMembership.id, { role: "MEMBER" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(removeMember(ws.admin, ownerMembership.id)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
      const viewerMembership = await db.membership.findFirstOrThrow({
        where: { workspaceId: ws.workspaceId, userId: ws.viewer.userId },
      });
      await expect(
        changeMemberRole(ws.admin, viewerMembership.id, { role: "OWNER" }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(renameWorkspace(ws.admin, { name: "Mine now" })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });

  describe("OWNER", () => {
    it("can rename the workspace and grant ownership", async () => {
      const renamed = await renameWorkspace(ws.owner, { name: "Renamed workspace" });
      expect(renamed.name).toBe("Renamed workspace");
      const adminMembership = await db.membership.findFirstOrThrow({
        where: { workspaceId: ws.workspaceId, userId: ws.admin.userId },
      });
      await changeMemberRole(ws.owner, adminMembership.id, { role: "OWNER" });
      await changeMemberRole(ws.owner, adminMembership.id, { role: "ADMIN" });
    });

    it("cannot demote or remove the last owner", async () => {
      const ownerMembership = await db.membership.findFirstOrThrow({
        where: { workspaceId: ws.workspaceId, role: "OWNER" },
      });
      await expect(
        changeMemberRole(ws.owner, ownerMembership.id, { role: "ADMIN" }),
      ).rejects.toBeInstanceOf(ConflictError);
      await expect(removeMember(ws.owner, ownerMembership.id)).rejects.toBeInstanceOf(
        ConflictError,
      );
    });
  });
});
