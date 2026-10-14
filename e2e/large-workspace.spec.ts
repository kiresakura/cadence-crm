import { expect, test } from "@playwright/test";

import { withDb, workspaceOf } from "./db";
import { registerWorkspace } from "./helpers";

interface Fixture {
  dealId: string;
  contactId: string;
  companyId: string;
}

/** 1,001 companies and 1,101 contacts; the linked records sort after the first thousand. */
async function arrangeLargeWorkspace(workspaceId: string, userId: string): Promise<Fixture> {
  return withDb(async (client) => {
    await client.query(
      `INSERT INTO "Company" (id, "workspaceId", name, "updatedAt")
       SELECT gen_random_uuid()::text, $1, 'Company ' || lpad(g::text, 4, '0'), now()
         FROM generate_series(1, 1001) g`,
      [workspaceId],
    );
    await client.query(
      `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "updatedAt")
       SELECT gen_random_uuid()::text, $1, 'Person', 'Filler ' || lpad(g::text, 4, '0'), now()
         FROM generate_series(1, 1100) g`,
      [workspaceId],
    );
    const company = await client.query<{ id: string }>(
      `SELECT id FROM "Company" WHERE "workspaceId" = $1 AND name = 'Company 1001'`,
      [workspaceId],
    );
    const companyId = company.rows[0]!.id;
    const contact = await client.query<{ id: string }>(
      `INSERT INTO "Contact" (id, "workspaceId", "firstName", "lastName", "companyId", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Zelda', 'Zzyzx', $2, now()) RETURNING id`,
      [workspaceId, companyId],
    );
    const contactId = contact.rows[0]!.id;
    const stage = await client.query<{ id: string; pipelineId: string }>(
      `SELECT id, "pipelineId" FROM "Stage" WHERE "workspaceId" = $1 ORDER BY position LIMIT 1`,
      [workspaceId],
    );
    const deal = await client.query<{ id: string }>(
      `INSERT INTO "Deal" (id, "workspaceId", title, amount, currency, "pipelineId", "stageId",
                           "companyId", "primaryContactId", "ownerId", "updatedAt")
       VALUES (gen_random_uuid()::text, $1, 'Big account', 5000, 'USD', $2, $3, $4, $5, $6, now())
       RETURNING id`,
      [workspaceId, stage.rows[0]!.pipelineId, stage.rows[0]!.id, companyId, contactId, userId],
    );
    return { dealId: deal.rows[0]!.id, contactId, companyId };
  });
}

async function readLinks(dealId: string, contactId: string) {
  return withDb(async (client) => {
    const deal = await client.query<{ companyId: string | null; primaryContactId: string | null }>(
      `SELECT "companyId", "primaryContactId" FROM "Deal" WHERE id = $1`,
      [dealId],
    );
    const contact = await client.query<{ companyId: string | null }>(
      `SELECT "companyId" FROM "Contact" WHERE id = $1`,
      [contactId],
    );
    return { deal: deal.rows[0]!, contact: contact.rows[0]! };
  });
}

test.describe("a workspace with more than 1,000 contacts and companies", () => {
  let fixture: Fixture;
  const email = `big.book.${Date.now().toString(36)}@example.com`;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await registerWorkspace(page, { email, workspaceName: "Big Book" });
    await page.close();
    const { workspaceId, userId } = await workspaceOf(email);
    fixture = await arrangeLargeWorkspace(workspaceId, userId);
  });

  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("my-own-long-password");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("editing only a deal's title keeps its company and primary contact", async ({ page }) => {
    await page.goto(`/deals/${fixture.dealId}/edit`);
    await page.getByLabel("Title").fill("Big account (renewal)");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/deals/${fixture.dealId}$`));

    const { deal } = await readLinks(fixture.dealId, fixture.contactId);
    expect(deal).toEqual({ companyId: fixture.companyId, primaryContactId: fixture.contactId });
    await expect(page.getByRole("link", { name: "Zelda Zzyzx" })).toBeVisible();

    // The pickers show the linked records even though they sort after the first thousand.
    await page.goto(`/deals/${fixture.dealId}/edit`);
    await expect(page.getByRole("combobox", { name: "Primary contact" })).toHaveValue(
      "Zelda Zzyzx",
    );
    await expect(page.getByRole("combobox", { name: "Company" })).toHaveValue("Company 1001");
  });

  test("editing only a contact's job title keeps its company", async ({ page }) => {
    await page.goto(`/contacts/${fixture.contactId}/edit`);
    await page.getByLabel("Job title").fill("Head of Purchasing");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(new RegExp(`/contacts/${fixture.contactId}$`));

    const { contact } = await readLinks(fixture.dealId, fixture.contactId);
    expect(contact.companyId).toBe(fixture.companyId);
    await page.goto(`/contacts/${fixture.contactId}/edit`);
    await expect(page.getByRole("combobox", { name: "Company" })).toHaveValue("Company 1001");
  });

  test("the pickers search the server and work from the keyboard", async ({ page }) => {
    await page.goto(`/deals/new`);
    await page.getByLabel("Title").fill("Keyboard deal");
    await page.getByLabel("Amount").fill("1200");

    const contact = page.getByRole("combobox", { name: "Primary contact" });
    await contact.focus();
    await contact.pressSequentially("filler 1100");
    const listbox = page.getByRole("listbox", { name: "Primary contact" });
    await expect(listbox.getByRole("option", { name: /Person Filler 1100/ })).toBeVisible();
    await expect(listbox.getByRole("option")).toHaveCount(1);
    await contact.press("Enter");
    await expect(contact).toHaveValue("Person Filler 1100");
    await expect(contact).toHaveAttribute("aria-expanded", "false");

    // Typing without choosing, then leaving the field, keeps the chosen contact.
    await contact.fill("zz");
    await contact.press("Escape");
    await expect(contact).toHaveValue("Person Filler 1100");

    const company = page.getByRole("combobox", { name: "Company" });
    await company.focus();
    await company.pressSequentially("company 100");
    // Every term must match: Company 0100, 1000 and 1001, in name order.
    await expect(page.getByRole("listbox", { name: "Company" }).getByRole("option")).toHaveText([
      "Company 0100",
      "Company 1000",
      "Company 1001",
    ]);
    await company.press("ArrowDown");
    await company.press("ArrowDown");
    await company.press("Enter");
    await expect(company).toHaveValue("Company 1001");

    await page.getByRole("button", { name: "Create deal" }).click();
    await expect(page.getByRole("link", { name: "Person Filler 1100" })).toBeVisible();
    const dealUrl = page.url();

    // Removing a link takes an explicit "Clear".
    await page.goto(`${dealUrl}/edit`);
    await page.getByRole("button", { name: "Clear primary contact" }).click();
    await expect(page.getByRole("combobox", { name: "Primary contact" })).toHaveValue("");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(dealUrl);
    await expect(page.getByRole("link", { name: "Person Filler 1100" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Company 1001" }).first()).toBeVisible();
  });
});
