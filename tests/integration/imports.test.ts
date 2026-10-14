import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ForbiddenError, ValidationError } from "@/server/errors";
import { createContact, parseContactFilters } from "@/server/services/contacts";
import { createDeal, parseDealFilters } from "@/server/services/deals";
import { exportContactsCsv, exportDealsCsv } from "@/server/services/exports";
import {
  importContacts,
  previewContactImport,
  readImportUpload,
  sanitizeMapping,
} from "@/server/services/imports";
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

describe("importing a Chinese spreadsheet", () => {
  it("accepts a header row with several Chinese column names", async () => {
    const ws = await createTestWorkspace();
    const result = await importContacts(
      ws.member,
      "名字,姓氏,電子郵件\n小明,王,ming@example.com\n",
    );
    expect(result.mapping).toEqual({ 名字: "firstName", 姓氏: "lastName", 電子郵件: "email" });
    expect(result.created).toBe(1);
  });

  it("splits full names family name first and reports spreadsheet row numbers", async () => {
    const ws = await createTestWorkspace();
    const csv = [
      "姓名,電子郵件,公司",
      "王小明,ming@example.com,台北商行",
      "歐陽娜娜,nana@example.com,",
      "",
      "Cher,cher@example.com,",
      "林 志玲,not-an-email,",
      "Ada Lovelace,ada@example.com,",
    ].join("\n");

    const preview = await previewContactImport(ws.member, csv);
    expect(preview.mapping).toEqual({ 姓名: "fullName", 電子郵件: "email", 公司: "companyName" });
    expect(preview.rows.map((row) => [row.rowNumber, row.status])).toEqual([
      [2, "ready"],
      [3, "ready"],
      [5, "error"],
      [6, "error"],
      [7, "ready"],
    ]);
    const cher = preview.rows.find((row) => row.rowNumber === 5);
    expect(cher?.status === "error" && cher.messages.join(" ")).toMatch(/Cher/);

    const result = await importContacts(ws.member, csv);
    expect(result.created).toBe(3);
    const people = await db.contact.findMany({
      where: { workspaceId: ws.workspaceId },
      select: { firstName: true, lastName: true },
      orderBy: { email: "asc" },
    });
    expect(people).toEqual([
      { firstName: "Ada", lastName: "Lovelace" },
      { firstName: "小明", lastName: "王" },
      { firstName: "娜娜", lastName: "歐陽" },
    ]);
  });

  it("explains files with too many rows instead of failing", async () => {
    const ws = await createTestWorkspace();
    const rows = Array.from({ length: 16_000 }, (_, i) => `Person ${i},p${i}@example.com`);
    const csv = `Name,Email\n${rows.join("\n")}`;
    await expect(previewContactImport(ws.member, csv)).rejects.toThrow(/at most 5000 rows/);
  });
});

describe("import uploads", () => {
  function upload(file: Blob | string | null, mapping?: string) {
    const formData = new FormData();
    if (file !== null) formData.set("file", file);
    if (mapping !== undefined) formData.set("mapping", mapping);
    return formData;
  }

  it("reads the file and the column mapping", async () => {
    const file = new File(["First name,Last name\nAda,Lovelace\n"], "people.csv");
    await expect(readImportUpload(upload(file, '{"First name":"firstName"}'))).resolves.toEqual({
      text: "First name,Last name\nAda,Lovelace\n",
      mapping: { "First name": "firstName" },
    });
    await expect(readImportUpload(upload(file))).resolves.toMatchObject({ mapping: undefined });
  });

  it("explains missing, oversized and malformed uploads", async () => {
    await expect(readImportUpload(upload(null))).rejects.toThrow("Choose a CSV file.");
    await expect(readImportUpload(upload("plain text"))).rejects.toThrow("Choose a CSV file.");
    const big = new File(["x".repeat(2 * 1024 * 1024 + 1)], "big.csv");
    await expect(readImportUpload(upload(big))).rejects.toThrow("The file is larger than 2 MB.");
    const file = new File(["a"], "a.csv");
    await expect(readImportUpload(upload(file, "{not json"))).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});
