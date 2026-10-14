import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createContact, parseContactFilters } from "@/server/services/contacts";
import { createDeal, parseDealFilters } from "@/server/services/deals";
import { exportContactsCsv, exportDealsCsv } from "@/server/services/exports";
import { importContacts, previewContactImport, sanitizeMapping } from "@/server/services/imports";
import { createTag } from "@/server/services/tags";

import { createTestWorkspace, stageByName, type TestWorkspace } from "./helpers";

const CSV = [
  "First name,Last name,Email,Phone,Company,Lifecycle stage,Tags",
  "Ada,Quill,ada@quill.example,+1 555 010 1000,Quill Co,customer,VIP; Unknown",
  "Ben,Ortiz,existing@example.com,,,lead,",
  "Cara,Diaz,cara@diaz.example,,Quill Co,prospect,",
  "Cara,Again,CARA@diaz.example,,,,",
  ",Nameless,nameless@example.com,,,,",
  "Dan,Bad,dan@bad.example,,,ALIEN,",
  "Eve,Nomail,,,New Corp,,vip",
].join("\n");

describe("CSV import", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
    await createTag(ws.admin, { name: "VIP" });
    await createContact(ws.member, {
      firstName: "Old",
      lastName: "Timer",
      email: "existing@example.com",
    });
  });

  it("previews the outcome without writing", async () => {
    const preview = await previewContactImport(ws.member, CSV);
    expect(preview.mapping).toMatchObject({
      "First name": "firstName",
      Company: "companyName",
      Tags: "tags",
    });
    expect(preview.summary).toEqual({ total: 7, ready: 3, duplicates: 2, errors: 2 });
    expect(preview.rows.map((row) => [row.rowNumber, row.status])).toEqual([
      [2, "ready"],
      [3, "duplicate"],
      [4, "ready"],
      [5, "duplicate"],
      [6, "error"],
      [7, "error"],
      [8, "ready"],
    ]);
    expect(preview.unknownTags).toEqual(["Unknown"]);
    expect(await db.contact.count({ where: { workspaceId: ws.workspaceId } })).toBe(1);
  });

  it("imports valid rows, skips duplicates and reports errors by row", async () => {
    const result = await importContacts(ws.member, CSV);
    expect(result.created).toBe(3);
    const errors = result.rows.filter((row) => row.status === "error");
    expect(errors.map((row) => row.rowNumber)).toEqual([6, 7]);

    const ada = await db.contact.findFirstOrThrow({
      where: { workspaceId: ws.workspaceId, email: "ada@quill.example" },
      include: { company: true, tags: { include: { tag: true } } },
    });
    expect(ada).toMatchObject({
      lifecycleStage: "CUSTOMER",
      phoneNormalized: "15550101000",
      ownerId: ws.member.userId,
    });
    expect(ada.company?.name).toBe("Quill Co");
    expect(ada.tags.map((link) => link.tag.name)).toEqual(["VIP"]);
    expect(await db.company.count({ where: { workspaceId: ws.workspaceId } })).toBe(2);

    // Re-importing the same file creates nothing new: every email now exists.
    const again = await importContacts(ws.member, CSV);
    expect(again.created).toBe(1); // only the row without an email
  });

  it("honours an explicit column mapping and full-name columns", async () => {
    const text = "Name,Work email\nGrace Brook,grace@brook.example\n";
    await expect(
      previewContactImport(ws.member, text, { Name: null, "Work email": "email" }),
    ).rejects.toThrow(/first and last name/);
    const result = await importContacts(ws.member, text, {
      Name: "fullName",
      "Work email": "email",
    });
    expect(result.created).toBe(1);
    expect(
      await db.contact.findFirst({ where: { workspaceId: ws.workspaceId, lastName: "Brook" } }),
    ).toMatchObject({ firstName: "Grace", source: "CSV import" });
    expect(sanitizeMapping(["A", "B"], { A: "email", B: "email", C: "phone" })).toEqual({
      A: "email",
      B: null,
    });
  });

  it("is limited to members who can write", async () => {
    await expect(previewContactImport(ws.viewer, CSV)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(importContacts(ws.viewer, CSV)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(importContacts(ws.member, "")).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("CSV export", () => {
  let ws: TestWorkspace;

  beforeAll(async () => {
    ws = await createTestWorkspace();
    await createContact(ws.member, {
      firstName: "Ann",
      lastName: "Lead",
      lifecycleStage: "LEAD",
      phone: "=1+2",
    });
    await createContact(ws.member, {
      firstName: "Cal",
      lastName: "Customer",
      lifecycleStage: "CUSTOMER",
    });
    await createDeal(ws.member, {
      title: "Open deal",
      amount: "100",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, "Proposal").id,
    });
    await createDeal(ws.member, {
      title: "Won deal",
      amount: "250.5",
      pipelineId: ws.pipelineId,
      stageId: stageByName(ws, "Won").id,
    });
  });

  it("exports contacts using the current filters", async () => {
    const csv = await exportContactsCsv(ws.viewer, parseContactFilters({ lifecycle: "CUSTOMER" }));
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(
      "First name,Last name,Email,Phone,Job title,Company,Lifecycle stage,Source,Owner,Tags,Created at",
    );
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^Cal,Customer,/);
    const all = await exportContactsCsv(ws.viewer, parseContactFilters({}));
    expect(all).toContain("'=1+2");
  });

  it("exports deals using the current filters", async () => {
    const csv = await exportDealsCsv(ws.viewer, parseDealFilters({ status: "won" }));
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatch(/^Won deal,250\.5,USD,Sales,Won,won,/);
  });
});
