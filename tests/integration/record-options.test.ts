import { beforeAll, describe, expect, it } from "vitest";

import { db } from "@/server/db";
import { ForbiddenError } from "@/server/errors";
import {
  OPTION_LIMIT,
  companyOption,
  contactOption,
  searchCompanyOptions,
  searchContactOptions,
} from "@/server/services/record-options";

import { createTestWorkspace, type TestWorkspace } from "./helpers";

const pad = (n: number) => String(n).padStart(4, "0");

describe("record pickers with server-side search", () => {
  let ws: TestWorkspace;
  let other: TestWorkspace;
  let lastContactId: string;
  let lastCompanyId: string;
  let foreignContactId: string;

  beforeAll(async () => {
    ws = await createTestWorkspace();
    other = await createTestWorkspace();
    // 1,500 contacts and 1,200 companies: more than any fixed-size option list would hold.
    await db.contact.createMany({
      data: Array.from({ length: 1500 }, (_, i) => ({
        workspaceId: ws.workspaceId,
        firstName: `Person`,
        lastName: `Filler ${pad(i + 1)}`,
        email: i === 1499 ? "last.person@example.com" : null,
      })),
    });
    await db.company.createMany({
      data: Array.from({ length: 1200 }, (_, i) => ({
        workspaceId: ws.workspaceId,
        name: `Company ${pad(i + 1)}`,
      })),
    });
    lastContactId = (
      await db.contact.findFirstOrThrow({
        where: { workspaceId: ws.workspaceId, lastName: "Filler 1500" },
      })
    ).id;
    lastCompanyId = (
      await db.company.findFirstOrThrow({
        where: { workspaceId: ws.workspaceId, name: "Company 1200" },
      })
    ).id;
    foreignContactId = (
      await db.contact.create({
        data: { workspaceId: other.workspaceId, firstName: "Foreign", lastName: "Filler 1500" },
      })
    ).id;
  });

  it("finds the 1,500th contact by name or email", async () => {
    const byName = await searchContactOptions(ws.viewer, "filler 1500");
    expect(byName).toEqual([
      expect.objectContaining({ id: lastContactId, label: "Person Filler 1500" }),
    ]);
    const byEmail = await searchContactOptions(ws.viewer, "last.person@");
    expect(byEmail.map((option) => option.id)).toEqual([lastContactId]);
  });

  it("returns at most 20 matches from this workspace only", async () => {
    const options = await searchContactOptions(ws.viewer, "filler");
    expect(options).toHaveLength(OPTION_LIMIT);
    expect(OPTION_LIMIT).toBe(20);
    expect(options.map((option) => option.id)).not.toContain(foreignContactId);
    expect(await searchContactOptions(other.viewer, "filler 1500")).toEqual([
      expect.objectContaining({ id: foreignContactId }),
    ]);
  });

  it("always includes the selected record, wherever it sorts", async () => {
    const options = await searchContactOptions(ws.viewer, "", lastContactId);
    expect(options.map((option) => option.id)).toContain(lastContactId);
    expect(options.length).toBeLessThanOrEqual(OPTION_LIMIT + 1);

    const unrelated = await searchContactOptions(ws.viewer, "filler 0001", lastContactId);
    expect(unrelated.map((option) => option.id)).toContain(lastContactId);

    const companies = await searchCompanyOptions(ws.viewer, "", lastCompanyId);
    expect(companies.map((option) => option.id)).toContain(lastCompanyId);
    expect(companies.length).toBeLessThanOrEqual(OPTION_LIMIT + 1);
  });

  it("never leaks a selected id from another workspace", async () => {
    const options = await searchContactOptions(ws.viewer, "", foreignContactId);
    expect(options.map((option) => option.id)).not.toContain(foreignContactId);
    expect(await contactOption(ws.viewer, foreignContactId)).toBeNull();
    expect(await contactOption(ws.viewer, lastContactId)).toMatchObject({
      label: "Person Filler 1500",
    });
  });

  it("searches companies past the first thousand", async () => {
    const options = await searchCompanyOptions(ws.viewer, "company 1200");
    expect(options).toEqual([expect.objectContaining({ id: lastCompanyId })]);
    expect(await companyOption(ws.viewer, lastCompanyId)).toMatchObject({ label: "Company 1200" });
    expect(await companyOption(other.viewer, lastCompanyId)).toBeNull();
  });

  it("requires a workspace member", async () => {
    await expect(
      searchContactOptions({ ...ws.viewer, role: "NONE" as never }, ""),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
